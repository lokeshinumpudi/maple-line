"""Rebuild three local-game sound beds from the retained, hash-checked collection.

Requires ffmpeg. Sources are lossy recordings. Runtime owns the 0.65 s loop overlap;
these edits do not certify subjective quality or suitability for release.
"""
import hashlib
import json
import math
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[4]
LIBRARY = ROOT / 'assets/audio-library'
OUTPUT = ROOT / 'apps/game/public/audio'
RECIPES = [
    ('forest-wind', 'forest-wind.mp3', 20, 18, 'highpass=f=100,lowpass=f=6500'),
    ('rain-roof', 'roof-rain.mp3', 15, 14, 'highpass=f=100,lowpass=f=7000'),
    ('cicadas-tokyo', 'summer-cicadas.mp3', 12, 18, 'highpass=f=1400,lowpass=f=8500'),
]


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def measure(args, filters):
    result = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', *args, '-af',
        filters + ',loudnorm=I=-24:TP=-4:LRA=11:print_format=json',
        '-f', 'null', '-'], capture_output=True, text=True, check=True)
    values = json.JSONDecoder().raw_decode(result.stderr[result.stderr.rfind('{'):])[0]
    levels = {key: float(values[key]) for key in ['input_i', 'input_tp', 'input_lra']}
    if not all(math.isfinite(value) for value in levels.values()):
        raise ValueError('Non-finite audio measurement')
    return levels


def main():
    manifest = json.loads((LIBRARY / 'manifest.json').read_text())
    assets = {item['id']: item for item in manifest['assets']}
    report = {'date': '2026-09-21', 'status': 'local gameplay edits; listening review pending',
              'loop_overlap_owner': 'recordings.js blendLoop, 0.65 seconds after decoding', 'assets': []}
    for asset_id, filename, start, duration, filters in RECIPES:
        asset = assets[asset_id]
        source = LIBRARY / asset['source_file']
        if digest(source) != asset['source_sha256']:
            raise ValueError(f'Source hash mismatch: {asset_id}')
        args = ['-ss', str(start), '-i', str(source), '-t', str(duration)]
        base = 'aformat=channel_layouts=mono,' + filters
        levels = measure(args, base)
        gain = round(min(12, -24 - levels['input_i'], -4 - levels['input_tp']), 2)
        chain = base + f',volume={gain}dB,afade=t=in:d=0.01,afade=t=out:st={duration - 0.01}:d=0.01'
        target = OUTPUT / filename
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *args, '-af', chain, '-ar', '44100',
                        '-ac', '1', '-codec:a', 'libmp3lame', '-b:a', '128k', str(target)], check=True)
        encoded = measure(['-i', str(target)], 'anull')
        if encoded['input_tp'] > -2:
            raise ValueError(f'Insufficient headroom: {filename}')
        report['assets'].append({key: asset[key] for key in [
            'id', 'title', 'author', 'source_page', 'license', 'license_url', 'source_sha256', 'source_kind']}
            | {'file': filename, 'sha256': digest(target), 'bytes': target.stat().st_size,
               'start_seconds': start, 'duration_seconds': duration, 'filters': chain,
               'sample_rate': 44100, 'channels': 1, 'encoding': 'MP3 128 kbit/s',
               'measurements': encoded, 'listening_review': 'pending'})
    (OUTPUT / 'field-recordings.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps({'files': len(report['assets']), 'bytes': sum(a['bytes'] for a in report['assets'])}))


if __name__ == '__main__':
    main()

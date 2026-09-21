#!/usr/bin/env python3
"""Validate the local Maple audio manifest and measure audition files without editing them."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import subprocess
import sys


def command(args):
    return subprocess.run(args, check=True, capture_output=True, text=True, timeout=180)


def probe(path):
    result = json.loads(command([
        'ffprobe', '-v', 'error', '-show_entries',
        'format=duration,size:stream=codec_name,sample_rate,channels', '-of', 'json', str(path)
    ]).stdout)
    stream = result['streams'][0]
    duration = float(result['format']['duration'])
    assert math.isfinite(duration) and duration > 0, f'Invalid duration: {path}'
    return dict(duration_seconds=duration, bytes=int(result['format']['size']),
                codec=stream['codec_name'], sample_rate=int(stream['sample_rate']),
                channels=stream['channels'])


def measure(path):
    result = command(['ffmpeg', '-nostdin', '-hide_banner', '-nostats', '-v', 'info',
                      '-i', str(path), '-vn', '-af', 'loudnorm=I=-24:TP=-4:LRA=11:print_format=json',
                      '-f', 'null', '-'])
    start = result.stderr.rfind('{')
    data = json.JSONDecoder().raw_decode(result.stderr[start:])[0]
    return {key: float(data[name]) for key, name in [
        ('integrated_lufs', 'input_i'), ('true_peak_dbtp', 'input_tp'), ('loudness_range_lu', 'input_lra')
    ]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--library', type=Path,
                        default=Path(__file__).resolve().parents[4] / 'assets/audio-library')
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    root = args.library.resolve()
    manifest = json.loads((root / 'manifest.json').read_text())
    report = dict(ffmpeg=command(['ffmpeg', '-version']).stdout.splitlines()[0],
                  assets=[], failures=[])
    seen = set()
    for item in manifest['assets']:
        try:
            assert item['id'] not in seen, 'Duplicate asset id'
            seen.add(item['id'])
            for field in ['author', 'source_page', 'download_url', 'license_url', 'license_verified']:
                assert item.get(field), f'Missing {field}'
            assert item['license'] in ['CC0-1.0', 'CC-BY-4.0'], 'Review new licence before adding it'
            entry = {'id': item['id']}
            for kind in ['source', 'audition']:
                path = (root / item[f'{kind}_file']).resolve()
                assert path.is_relative_to(root), 'Asset path escapes library'
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                assert digest == item[f'{kind}_sha256'], f'{kind} hash mismatch'
                metadata = probe(path)
                command(['ffmpeg', '-nostdin', '-v', 'error', '-xerror', '-i', str(path), '-f', 'null', '-'])
                entry[kind] = metadata
                if kind == 'audition':
                    measured = measure(path)
                    assert all(math.isfinite(v) for v in measured.values()), 'Silent or invalid audition'
                    assert measured['true_peak_dbtp'] <= -2, 'Audition exceeds -2 dBTP review threshold'
                    entry['audition'].update(measured)
            report['assets'].append(entry)
        except (AssertionError, OSError, ValueError, KeyError, subprocess.SubprocessError) as exc:
            report['failures'].append({'id': item.get('id'), 'error': str(exc)})
    report['passed'] = bool(seen) and not report['failures']
    report['source_bytes'] = sum(x['source']['bytes'] for x in report['assets'])
    report['audition_bytes'] = sum(x['audition']['bytes'] for x in report['assets'])
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2, allow_nan=False) + '\n')
    print(json.dumps({k: v for k, v in report.items() if k not in ['assets', 'ffmpeg']}, indent=2))
    return 0 if report['passed'] else 1


if __name__ == '__main__':
    sys.exit(main())

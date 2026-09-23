import {
  normalizeEpisode,
  readingSeconds,
  beatSeconds,
  episodeSeconds,
  voicedSeconds,
  voiceOf,
  LINE_LEAD,
  LINE_GAP,
  BEAT_TAIL,
} from './episode-schema.js';
import { lineId, beatId } from './render-timeline.js';

/**
 * Plays a normalized episode through a host. The runner owns only the timeline;
 * the host performs each request with the game's existing actions:
 *
 *   setScene(set, scene)            weather, time, location jump, speed (UI action paths)
 *   setStop(stopId | null, { crossing }) scheduled stop for auto drive; with a crossing id
 *                                   (scene holdAt) the train stops short of that crossing
 *   cut(shot)                       director shot; subjects already resolved
 *   say({ speaker, text, seconds, phone, entity, voiced })
 *   card({ kind, title, subtitle, line, seconds })
 *   direct(entityId, { mood, intent, holdSeconds })
 *   event(type)                     NPC minds world event
 *   weather(value)
 *   doors('open' | 'close')         returns false when interlocks refuse
 *   isStopped(), doorsClosed()
 *   resolve(subject)                { cast, entity } | { crossing } | { prop } -> director
 *                                   subject or null
 *   mark?(entityId, markId)         stand a person on a stage mark (drama-stage.js)
 *   move?(entityId, markId, pace)   walk or run a staged person to a mark
 *   bus?(state)                     'wait' | 'leave' | 'arrive' for the village bus
 *   clearStage?()                   hand staged people back to the simulation
 *   ended?(state)                   optional: the last beat finished (not called on stop)
 *   voice?                          optional voice and translation (episode-voice.js):
 *     active()                      true when voiced or translated lines are in use
 *     prepare(items)                fetch translations and clips ahead of time
 *     ready(item)                   everything this line needs has arrived or failed
 *     text(item)                    subtitle in the chosen language (English if missing)
 *     durationMs(item)              length of a prepared clip, or null
 *     play(item)                    { durationMs, done, stop() } or null when unvoiced
 *     stopAll(), status()
 *
 * Advance with update(dt) using simulation time, so pauses and menus hold the episode.
 *
 * Dialogue coverage: when a line's speaker is a cast member on screen and the camera is not
 * on them, the runner cuts to a portrait of the speaker as the line starts (over the
 * listener's shoulder when the camera was on the listener). A speaker who is not on screen
 * keeps the beat's own shot.
 *
 * onEvent (optional) hears the timeline as it plays, for video renders and voice:
 *   { type: 'episode', id, title } · { type: 'scene', id, heading, index }
 *   { type: 'beat', id, scene, index, shot } · { type: 'end' }
 *   { type: 'line', id, scene, beat, cast, speaker, text, seconds, phone, voiced }
 * Line ids are `<scene id>/<beat number>/<line number>`, numbers from 1.
 *
 * A voiced line holds its beat until the clip ends; a line that is not voiced keeps
 * the reading-time schedule, so an episode without a voice host plays as before.
 */
const TITLE_LEAD = 4.5;
const WAIT_LIMIT = 45;
/** Longest the runner waits for a translation or clip before showing the line without it. */
const VOICE_WAIT = 4;
/** Longest the first beat waits under the title card for its voice to arrive. */
const PREROLL_LIMIT = TITLE_LEAD + 4;
/** Beats prepared ahead of the current one. */
const LOOKAHEAD = 2;

export function createEpisodeRunner(host, { stops = [], crossings = [], onEvent = () => {} } = {}) {
  let episode = null;
  let status = 'idle';
  let sceneIndex = 0;
  let beatIndex = 0;
  let elapsed = 0;
  let beatElapsed = 0;
  let planned = 0;
  let floor = 0;
  let lead = 0;
  let schedule = [];
  let log = [];
  let released = false;
  let prerolling = false;
  let lines = { index: 0, nextAt: 0, lastEnd: 0, current: null };

  const scene = () => episode.scenes[sceneIndex];
  const beat = () => scene().beats[beatIndex];
  const voice = () => (host.voice?.active() ? host.voice : null);
  const note = (message) => {
    log.push({ at: Number(elapsed.toFixed(1)), message });
    if (log.length > 40) log.shift();
  };
  const speakerOf = (line) => line.speaker ?? episode.cast[line.cast]?.name ?? line.cast ?? 'Voice';

  /** Stable ids let the voice host cache per line and the renderer map clips to beats. */
  function lineItem(s, b, l) {
    const line = episode.scenes[s].beats[b].dialogue[l];
    return {
      id: `${episode.id}:${s}.${b}.${l}`,
      line: lineId(episode.scenes[s].id, b, l),
      sceneIndex: s,
      beatIndex: b,
      lineIndex: l,
      text: line.text,
      voice: voiceOf(episode, line),
      emotion: line.emotion ?? 'natural',
      translations: line.translations ?? null,
    };
  }
  function beatLineItem(s, b) {
    const value = episode.scenes[s].beats[b];
    if (!value.line) return null;
    return {
      id: `${episode.id}:${s}.${b}.line`,
      caption: `${episode.scenes[s].id}/${b + 1}`,
      text: value.line,
      voice: null,
      translations: value.lineTranslations ?? null,
    };
  }
  const endItem = () =>
    episode.endCard?.line
      ? {
          id: `${episode.id}:end`,
          caption: 'end',
          text: episode.endCard.line,
          voice: null,
          translations: episode.endCard.lineTranslations ?? null,
        }
      : null;
  /** Current beat plus a few ahead, across scene boundaries, and the end card near the end. */
  function prepareAhead() {
    const speaker = voice();
    if (!speaker) return;
    const items = [];
    let s = sceneIndex,
      b = beatIndex;
    for (let step = 0; step <= LOOKAHEAD; step++) {
      if (s >= episode.scenes.length) {
        const end = endItem();
        if (end) items.push(end);
        break;
      }
      const lineOfBeat = beatLineItem(s, b);
      if (lineOfBeat) items.push(lineOfBeat);
      episode.scenes[s].beats[b].dialogue.forEach((_, l) => items.push(lineItem(s, b, l)));
      if (++b >= episode.scenes[s].beats.length) {
        s++;
        b = 0;
      }
    }
    speaker.prepare(items);
  }

  /** A cast member's director subject in this scene, or null when they are not on screen. */
  function castSubject(cast) {
    const entity = scene().actors?.[cast];
    if (!entity) return null;
    const resolved = host.resolve({ cast, entity });
    return resolved?.person ? resolved : null;
  }

  // Who the camera is on for the current line, so dialogue coverage cuts only on a change.
  let framed = { cast: null };

  /** The other cast speaker nearest this line in the beat (previous first), or null. */
  function listenerFor(cast, lineIndex) {
    const dialogue = beat().dialogue;
    for (let i = lineIndex - 1; i >= 0; i--)
      if (dialogue[i].cast && dialogue[i].cast !== cast && !dialogue[i].phone)
        return dialogue[i].cast;
    for (let i = lineIndex + 1; i < dialogue.length; i++)
      if (dialogue[i].cast && dialogue[i].cast !== cast && !dialogue[i].phone)
        return dialogue[i].cast;
    const authored = beat().shot.subject?.cast;
    return authored && authored !== cast ? authored : null;
  }

  /**
   * Dialogue coverage: a line spoken by a cast member on screen is filmed on that speaker.
   * When the camera was on the listener, the reverse is over the listener's shoulder; the
   * director keeps both on the same side of the line between them.
   */
  function coverLine(spoken, lineIndex) {
    const cast = spoken.cast;
    if (!cast || spoken.phone || framed.cast === cast || !scene().actors?.[cast]) return;
    const subject = castSubject(cast);
    if (!subject) {
      if (framed.note !== cast) note(`${speakerOf(spoken)} is not on screen; keeping the shot`);
      framed.note = cast;
      return;
    }
    const listener = listenerFor(cast, lineIndex);
    const partner = listener ? castSubject(listener) : null;
    host.cut({
      type: 'portrait',
      subject,
      ...(partner ? { partner, framing: framed.cast === listener ? 'ots' : 'single' } : {}),
      aperture: 'shallow',
      duration: Math.min(60, Math.max(2, planned - beatElapsed + 3)),
    });
    framed = { cast };
  }

  function resolveShot(shot) {
    const subject = shot.subject;
    if (shot.partner && typeof shot.partner === 'object' && 'cast' in shot.partner) {
      const partner = castSubject(shot.partner.cast);
      const { partner: _drop, ...rest } = shot;
      return resolveShot(partner ? { ...rest, partner } : rest);
    }
    if (
      !subject ||
      typeof subject !== 'object' ||
      !('cast' in subject || 'crossing' in subject || 'prop' in subject)
    )
      return shot;
    const resolved =
      'cast' in subject
        ? host.resolve({ cast: subject.cast, entity: scene().actors[subject.cast] })
        : 'prop' in subject
          ? host.resolve({ prop: subject.prop })
          : host.resolve({ crossing: subject.crossing });
    if (resolved) return { ...shot, subject: resolved };
    // The actor is not on screen: keep the scene going on a safe wide shot.
    note(`subject ${JSON.stringify(subject)} unavailable; using a platform or orbit shot`);
    const { subject: _drop, ...rest } = shot;
    return { ...rest, type: scene().stopAt ? 'platform' : 'orbit' };
  }

  function startScene(index, { deferBeat = false } = {}) {
    sceneIndex = index;
    released = false;
    const current = scene();
    host.setStop(current.stopAt ?? null, { crossing: current.holdAt ?? null });
    if (current.set) host.setScene(current.set, current);
    // Staged people stand on their marks before the first shot looks for them.
    for (const [cast, mark] of Object.entries(current.marks ?? {})) {
      try {
        host.mark?.(current.actors[cast], mark);
      } catch (error) {
        note(`mark ${mark} for ${cast} skipped: ${error.message}`);
      }
    }
    note(`scene ${current.id}: ${current.heading}`);
    onEvent({ type: 'scene', id: current.id, heading: current.heading, index });
    if (!deferBeat) startBeat(0);
  }

  function startBeat(index) {
    beatIndex = index;
    beatElapsed = 0;
    const current = beat();
    prepareAhead();
    const speaker = voice();
    const known = current.dialogue.map((_, l) => {
      const ms = speaker?.durationMs(lineItem(sceneIndex, beatIndex, l));
      return Number.isFinite(ms) ? voicedSeconds(ms) : undefined;
    });
    planned = beatSeconds(current, known) + lead;
    floor = lead + Math.max(current.hold ?? 4, ...current.cues.map((cue) => cue.after + 1));
    let shot = resolveShot(current.shot);
    framed = { cast: shot.subject?.person ? (current.shot.subject?.cast ?? null) : null };
    // A portrait in a conversation knows the listener: it sets the line of action and
    // which way the speaker looks.
    if (shot.type === 'portrait' && framed.cast && !shot.partner) {
      const listener = listenerFor(framed.cast, -1);
      const partner = listener ? castSubject(listener) : null;
      if (partner) shot = { ...shot, partner };
    }
    onEvent({
      type: 'beat',
      id: beatId(scene().id, index),
      scene: scene().id,
      index,
      shot: shot.type,
    });
    const { caption, subtitle } = current;
    const lineOfBeat = beatLineItem(sceneIndex, beatIndex);
    const line = lineOfBeat ? (speaker ? speaker.text(lineOfBeat) : lineOfBeat.text) : null;
    host.cut({
      ...shot,
      // A few spare seconds so the automatic editor never cuts before the beat ends.
      duration: Math.min(60, Math.max(shot.duration ?? 0, planned + 3)),
      ...(caption ? { caption } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(line ? { line } : {}),
    });
    schedule = [];
    lines = { index: 0, nextAt: lead + LINE_LEAD, lastEnd: 0, current: null };
    for (const cue of current.cues) schedule.push({ at: lead + cue.after, kind: 'cue', cue });
    schedule.sort((a, b) => a.at - b.at);
    lead = 0;
  }

  /** Show (and, when voiced, play) the line that has waited long enough for its voice. */
  function beginLine(current) {
    const spoken = beat().dialogue[lines.index];
    coverLine(spoken, lines.index);
    const speaker = voice();
    const handle = speaker ? speaker.play(current.item) : null;
    if (speaker && !handle && current.item.voice && speaker.status().mode === 'voice')
      note(
        `voice for ${speakerOf(spoken)} was not ready; line ${current.item.id} is subtitles only`,
      );
    const seconds = handle ? voicedSeconds(handle.durationMs) : readingSeconds(spoken.text);
    const text = speaker ? speaker.text(current.item) : spoken.text;
    onEvent({
      type: 'line',
      id: current.item.line,
      scene: scene().id,
      beat: beatIndex + 1,
      cast: spoken.cast ?? null,
      speaker: speakerOf(spoken),
      text,
      seconds,
      phone: Boolean(spoken.phone),
      voiced: Boolean(handle),
    });
    // Narration reads as a caption, without a speaker label over it.
    const narration = spoken.cast === 'narrator';
    host.say({
      speaker: narration ? '' : speakerOf(spoken),
      narration,
      text,
      seconds,
      phone: Boolean(spoken.phone),
      voiced: Boolean(handle),
      // The character playing the speaker in this scene, if any (for mouth movement).
      entity: spoken.cast ? (scene().actors[spoken.cast] ?? null) : null,
    });
    current.phase = 'speaking';
    current.handle = handle;
    current.minEnd = beatElapsed + seconds;
    // A clip that never reports its end (blocked audio, a stalled element) cannot hold the beat.
    current.hardEnd = current.minEnd + (handle ? 3 : 0);
  }

  function advanceLines() {
    const dialogue = beat().dialogue;
    for (;;) {
      const current = lines.current;
      if (current) {
        if (current.phase === 'waiting') {
          const speaker = voice();
          if (
            speaker &&
            !speaker.ready(current.item) &&
            beatElapsed - current.waitingSince < VOICE_WAIT
          )
            return;
          beginLine(current);
        }
        const heard = !current.handle || current.handle.done;
        if (!(beatElapsed >= current.minEnd && heard) && beatElapsed < current.hardEnd) return;
        if (!heard) current.handle.stop();
        lines.lastEnd = current.handle ? beatElapsed : current.minEnd;
        lines.nextAt = lines.lastEnd + LINE_GAP;
        lines.current = null;
        lines.index++;
      }
      if (lines.index >= dialogue.length || beatElapsed < lines.nextAt) return;
      lines.current = {
        item: lineItem(sceneIndex, beatIndex, lines.index),
        phase: 'waiting',
        waitingSince: beatElapsed,
      };
    }
  }

  function perform(item) {
    const cue = item.cue;
    if (cue.doors) {
      if (host.doors(cue.doors) !== false) return;
      // Interlocks can refuse for a moment (the train is still settling); try again briefly.
      const tries = (item.tries ?? 0) + 1;
      if (tries <= 8) {
        schedule.push({ ...item, at: beatElapsed + 0.5, tries });
        schedule.sort((a, b) => a.at - b.at);
      } else note(`doors ${cue.doors} refused by interlocks`);
    } else if (cue.bus) host.bus?.(cue.bus.state);
    else if (cue.move) {
      try {
        host.move?.(scene().actors[cue.move.cast], cue.move.to, cue.move.pace ?? 'walk');
      } catch (error) {
        note(`move for ${cue.move.cast} skipped: ${error.message}`);
      }
    } else if (cue.event) host.event(cue.event);
    else if (cue.weather) host.weather(cue.weather);
    else if (cue.release) {
      released = true;
      host.setStop(null);
    } else if (cue.direct) {
      const entity = scene().actors[cue.direct.cast];
      try {
        host.direct(entity, {
          mood: cue.direct.mood,
          intent: cue.direct.intent,
          holdSeconds: cue.direct.hold,
        });
      } catch (error) {
        note(`acting note for ${cue.direct.cast} (${entity}) skipped: ${error.message}`);
      }
    }
  }

  /** Seconds into the beat at which it may end, once every line has been heard. */
  function beatTarget() {
    return Math.max(floor, beat().dialogue.length ? lines.lastEnd + LINE_GAP + BEAT_TAIL : 0);
  }

  function beatDone() {
    const current = beat();
    if (schedule.length || lines.current || lines.index < current.dialogue.length) return false;
    const target = beatTarget();
    if (beatElapsed < target) return false;
    if (beatElapsed > target + WAIT_LIMIT) {
      note(`waited ${WAIT_LIMIT}s for ${current.waitFor}; continuing`);
      return true;
    }
    if (current.waitFor === 'stopped') return host.isStopped();
    if (current.waitFor === 'doors-closed') return host.doorsClosed();
    return true;
  }

  function finish() {
    status = 'ended';
    onEvent({ type: 'end' });
    host.setStop(null);
    host.card({
      kind: 'title',
      title: episode.endCard?.title ?? `${episode.title} · end`,
      seconds: 5,
    });
    const end = endItem();
    if (end) host.card({ kind: 'shot', line: voice()?.text(end) ?? end.text, seconds: 6 });
    note('episode ended');
    host.ended?.(api.getState());
  }

  /** The first beat's own lines, which the title card gives time to prepare. */
  function firstBeatReady() {
    const speaker = voice();
    if (!speaker) return true;
    const first = episode.scenes[0].beats[0];
    const items = first.dialogue.map((_, l) => lineItem(0, 0, l));
    const lineOfBeat = beatLineItem(0, 0);
    if (lineOfBeat) items.push(lineOfBeat);
    return items.every((item) => speaker.ready(item));
  }

  const api = {
    /** Validate and start an episode. Throws a readable TypeError for invalid data. */
    play(input) {
      const next = normalizeEpisode(input, { stops, crossings });
      api.stop();
      host.clearStage?.();
      episode = next;
      status = 'playing';
      elapsed = 0;
      log = [];
      const heading = [episode.series, episode.number ? `Episode ${episode.number}` : null]
        .filter(Boolean)
        .join(' · ');
      host.card({
        kind: 'title',
        title: heading ? `${heading}\n${episode.title}` : episode.title,
        seconds: TITLE_LEAD,
      });
      lead = TITLE_LEAD;
      onEvent({ type: 'episode', id: episode.id, title: episode.title });
      // With voice, the first beat waits under the title card for its translation and clips.
      prerolling = Boolean(voice());
      if (prerolling) {
        sceneIndex = 0;
        beatIndex = 0;
        prepareAhead();
        const speaker = voice();
        if (speaker?.status().mode !== 'voice' && speaker?.status().reason)
          note(`voice: ${speaker.status().reason}`);
      }
      startScene(0, { deferBeat: prerolling });
      return api.getState();
    },
    update(dt) {
      if (status !== 'playing' || !(dt > 0)) return;
      dt = Math.min(dt, 0.25);
      elapsed += dt;
      if (prerolling) {
        if (!firstBeatReady() && elapsed < PREROLL_LIMIT) return;
        if (elapsed >= PREROLL_LIMIT) note('voice was slow to arrive; starting without it');
        prerolling = false;
        lead = Math.max(0, TITLE_LEAD - elapsed);
        startBeat(0);
        return;
      }
      beatElapsed += dt;
      while (schedule.length && schedule[0].at <= beatElapsed) perform(schedule.shift());
      advanceLines();
      if (!beatDone()) return;
      if (beatIndex + 1 < scene().beats.length) startBeat(beatIndex + 1);
      else if (sceneIndex + 1 < episode.scenes.length) {
        if ((scene().stopAt || scene().holdAt) && !released) host.setStop(null);
        startScene(sceneIndex + 1);
      } else finish();
    },
    stop() {
      if (status === 'playing') {
        host.setStop(null);
        host.voice?.stopAll();
        host.clearStage?.();
        note('episode stopped');
      }
      status = episode ? 'stopped' : 'idle';
      schedule = [];
      prerolling = false;
      lines = { index: 0, nextAt: 0, lastEnd: 0, current: null };
    },
    /** Add a message to the episode log (the director's framing substitutions). */
    note(message) {
      if (status === 'playing') note(String(message).slice(0, 200));
    },
    /** A detached copy of the last episode played (normalized), or null. */
    current() {
      return episode ? structuredClone(episode) : null;
    },
    get playing() {
      return status === 'playing';
    },
    getState() {
      const active = episode && status === 'playing' && !prerolling;
      return {
        status,
        episode: episode
          ? {
              id: episode.id,
              series: episode.series ?? null,
              number: episode.number ?? null,
              title: episode.title,
              plannedSeconds: Math.round(episodeSeconds(episode)),
            }
          : null,
        scene: active
          ? {
              index: sceneIndex,
              id: scene().id,
              heading: scene().heading,
              actors: { ...scene().actors },
            }
          : null,
        beat: active
          ? {
              index: beatIndex,
              total: scene().beats.length,
              shot: beat().shot.type,
              elapsed: Number(beatElapsed.toFixed(1)),
              planned: Number(planned.toFixed(1)),
              waitingFor:
                lines.current?.phase === 'waiting'
                  ? 'voice'
                  : lines.current?.handle
                    ? 'line'
                    : beatElapsed >= planned && beat().waitFor
                      ? beat().waitFor
                      : null,
            }
          : null,
        voice: host.voice?.status() ?? { mode: 'subtitles', language: 'en-IN', reason: null },
        elapsed: Number(elapsed.toFixed(1)),
        log: log.map((item) => ({ ...item })),
      };
    },
  };
  return api;
}

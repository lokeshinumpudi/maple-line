import { normalizeEpisode, readingSeconds, beatSeconds, episodeSeconds } from './episode-schema.js';

/**
 * Plays a normalized episode through a host. The runner owns only the timeline;
 * the host performs each request with the game's existing actions:
 *
 *   setScene(set, scene)            weather, time, location jump, speed (UI action paths)
 *   setStop(stopId | null)          scheduled stop for auto drive
 *   cut(shot)                       director shot; subjects already resolved
 *   say({ speaker, text, seconds, phone })
 *   card({ kind, title, subtitle, line, seconds })
 *   direct(entityId, { mood, intent, holdSeconds })
 *   event(type)                     NPC minds world event
 *   weather(value)
 *   doors('open' | 'close')         returns false when interlocks refuse
 *   isStopped(), doorsClosed()
 *   resolve(subject)                { cast, entity } | { crossing } -> director subject or null
 *
 * Advance with update(dt) using simulation time, so pauses and menus hold the episode.
 */
const TITLE_LEAD = 4.5;
const WAIT_LIMIT = 45;

export function createEpisodeRunner(host, { stops = [], crossings = [] } = {}) {
  let episode = null;
  let status = 'idle';
  let sceneIndex = 0;
  let beatIndex = 0;
  let elapsed = 0;
  let beatElapsed = 0;
  let planned = 0;
  let lead = 0;
  let schedule = [];
  let log = [];
  let released = false;

  const scene = () => episode.scenes[sceneIndex];
  const beat = () => scene().beats[beatIndex];
  const note = (message) => {
    log.push({ at: Number(elapsed.toFixed(1)), message });
    if (log.length > 40) log.shift();
  };
  const speakerOf = (line) => line.speaker ?? episode.cast[line.cast]?.name ?? line.cast ?? 'Voice';

  function resolveShot(shot) {
    const subject = shot.subject;
    if (!subject || typeof subject !== 'object' || !('cast' in subject || 'crossing' in subject))
      return shot;
    const resolved =
      'cast' in subject
        ? host.resolve({ cast: subject.cast, entity: scene().actors[subject.cast] })
        : host.resolve({ crossing: subject.crossing });
    if (resolved) return { ...shot, subject: resolved };
    // The actor is not on screen: keep the scene going on a safe wide shot.
    note(`subject ${JSON.stringify(subject)} unavailable; using a platform or orbit shot`);
    const { subject: _drop, ...rest } = shot;
    return { ...rest, type: scene().stopAt ? 'platform' : 'orbit' };
  }

  function startScene(index) {
    sceneIndex = index;
    released = false;
    const current = scene();
    host.setStop(current.stopAt ?? null);
    if (current.set) host.setScene(current.set, current);
    note(`scene ${current.id}: ${current.heading}`);
    startBeat(0);
  }

  function startBeat(index) {
    beatIndex = index;
    beatElapsed = 0;
    const current = beat();
    planned = beatSeconds(current) + lead;
    const shot = resolveShot(current.shot);
    const { caption, subtitle, line } = current;
    host.cut({
      ...shot,
      // A few spare seconds so the automatic editor never cuts before the beat ends.
      duration: Math.min(60, Math.max(shot.duration ?? 0, planned + 3)),
      ...(caption ? { caption } : {}),
      ...(subtitle ? { subtitle } : {}),
      ...(line ? { line } : {}),
    });
    schedule = [];
    let t = lead + (current.dialogue.length ? 1 : 0);
    for (const spoken of current.dialogue) {
      const seconds = readingSeconds(spoken.text);
      schedule.push({ at: t, kind: 'line', line: spoken, seconds });
      t += seconds + 0.35;
    }
    for (const cue of current.cues) schedule.push({ at: lead + cue.after, kind: 'cue', cue });
    schedule.sort((a, b) => a.at - b.at);
    lead = 0;
  }

  function perform(item) {
    if (item.kind === 'line') {
      host.say({
        speaker: speakerOf(item.line),
        text: item.line.text,
        seconds: item.seconds,
        phone: Boolean(item.line.phone),
        // The character playing the speaker in this scene, if any (for mouth movement).
        entity: item.line.cast ? (scene().actors[item.line.cast] ?? null) : null,
      });
      return;
    }
    const cue = item.cue;
    if (cue.doors) {
      if (host.doors(cue.doors) !== false) return;
      // Interlocks can refuse for a moment (the train is still settling); try again briefly.
      const tries = (item.tries ?? 0) + 1;
      if (tries <= 8) {
        schedule.push({ ...item, at: beatElapsed + 0.5, tries });
        schedule.sort((a, b) => a.at - b.at);
      } else note(`doors ${cue.doors} refused by interlocks`);
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

  function beatDone() {
    const current = beat();
    if (beatElapsed < planned || schedule.length) return false;
    if (beatElapsed > planned + WAIT_LIMIT) {
      note(`waited ${WAIT_LIMIT}s for ${current.waitFor}; continuing`);
      return true;
    }
    if (current.waitFor === 'stopped') return host.isStopped();
    if (current.waitFor === 'doors-closed') return host.doorsClosed();
    return true;
  }

  function finish() {
    status = 'ended';
    host.setStop(null);
    host.card({
      kind: 'title',
      title: episode.endCard?.title ?? `${episode.title} · end`,
      seconds: 5,
    });
    if (episode.endCard?.line) host.card({ kind: 'shot', line: episode.endCard.line, seconds: 6 });
    note('episode ended');
  }

  const api = {
    /** Validate and start an episode. Throws a readable TypeError for invalid data. */
    play(input) {
      const next = normalizeEpisode(input, { stops, crossings });
      api.stop();
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
      startScene(0);
      return api.getState();
    },
    update(dt) {
      if (status !== 'playing' || !(dt > 0)) return;
      dt = Math.min(dt, 0.25);
      elapsed += dt;
      beatElapsed += dt;
      while (schedule.length && schedule[0].at <= beatElapsed) perform(schedule.shift());
      if (!beatDone()) return;
      if (beatIndex + 1 < scene().beats.length) startBeat(beatIndex + 1);
      else if (sceneIndex + 1 < episode.scenes.length) {
        if (scene().stopAt && !released) host.setStop(null);
        startScene(sceneIndex + 1);
      } else finish();
    },
    stop() {
      if (status === 'playing') {
        host.setStop(null);
        note('episode stopped');
      }
      status = episode ? 'stopped' : 'idle';
      schedule = [];
    },
    /** Scheduled stop distance id while a scene holds the train at a platform. */
    get playing() {
      return status === 'playing';
    },
    getState() {
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
        scene:
          episode && status === 'playing'
            ? { index: sceneIndex, id: scene().id, heading: scene().heading }
            : null,
        beat:
          episode && status === 'playing'
            ? {
                index: beatIndex,
                total: scene().beats.length,
                shot: beat().shot.type,
                elapsed: Number(beatElapsed.toFixed(1)),
                planned: Number(planned.toFixed(1)),
                waitingFor: beatElapsed >= planned && beat().waitFor ? beat().waitFor : null,
              }
            : null,
        elapsed: Number(elapsed.toFixed(1)),
        log: log.map((item) => ({ ...item })),
      };
    },
  };
  return api;
}

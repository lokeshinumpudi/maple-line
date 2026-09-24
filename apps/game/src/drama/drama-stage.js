/**
 * Staged figures for episodes. The world's own people follow the population simulation;
 * a scene can take a cast member off that simulation and put them on a named mark instead
 * (the front car's door at Aonuma, a seat in the front car, the bus stop), and a cue can
 * walk or run them to another mark. The hero model that draws the person (a VRM) follows
 * the staged figure exactly as it follows a simulated one, so Meera is the same figure at
 * Momiji and at Aonuma.
 *
 * Marks are data. The host turns a mark into a world pose each frame (a seat moves with
 * the train), so this module holds only positions, paths and acting notes.
 */

/**
 * `kind` says how the host places a mark:
 *   door     a platform-side door of a car (`car`, `door`); a figure placed here is aboard
 *            and hidden, a figure moving away from it steps out, one arriving boards.
 *   car      a seat or standing spot inside a car, in car-local metres (`x`, `z`), facing
 *            `face` (radians, car frame). Follows the train.
 *   station  station-local metres at `stop`: x across from the rail, z along the route.
 *   bus      a spot at the Aonuma village bus (`spot`), which the bus module places;
 *            `aboard` marks hide the person on arrival, as a door does.
 * `via` lists station-local points (at `viaStop`, or the mark's own stop) walked through on
 * the way to the mark.
 */
export const STAGE_MARKS = Object.freeze({
  'front-car-door': { kind: 'door', car: 0, door: 1 },
  // The front car's other platform-side door, so two people do not share one doorway.
  'front-car-door-rear': { kind: 'door', car: 0, door: 0 },
  // Longitudinal benches face across the aisle: Meera on the platform side, Arjun opposite.
  // At the front end of the car, clear of the seats the other riders use. x is the middle of
  // the 0.55 m-deep cushion (about 0.78 to 1.33 m from the centre line), so the hips sit on it
  // rather than on the front lip with the thighs through the bench.
  'front-car-seat': { kind: 'car', car: 0, x: -1.02, z: 3.05, face: Math.PI / 2, seated: true },
  'front-car-seat-across': {
    kind: 'car',
    car: 0,
    x: 1.12,
    z: 2.2,
    face: -Math.PI / 2,
    seated: true,
  },
  // At the open front of the bus-stop shelter, beside the bus, watching for Meera.
  'aonuma-bus-stop': {
    kind: 'station',
    stop: 'aonuma',
    x: 10.4,
    z: 29.45,
    face: Math.PI,
  },
  // By the open front door, facing Ammamma under the shelter roof.
  'aonuma-bus-door': {
    kind: 'station',
    stop: 'aonuma',
    x: 10.1,
    z: 27.55,
    face: 0.15,
    via: [
      [5.8, 21.5],
      [6.4, 24.4],
      [9.6, 25.6],
    ],
  },
  // Beside her, a step nearer the platform, facing the door and the driver.
  'aonuma-bus-side': {
    kind: 'station',
    stop: 'aonuma',
    x: 9.3,
    z: 26.9,
    face: 0.5,
    via: [
      [5.2, 21.0],
      [5.9, 24.0],
      [8.8, 25.4],
    ],
  },
  'aonuma-bus-step': { kind: 'bus', spot: 'step' },
  // Through the door and out of sight: aboard the bus.
  'aonuma-bus-aboard': { kind: 'bus', spot: 'door', aboard: true },
});
const aboard = (markId) =>
  STAGE_MARKS[markId].kind === 'door' || STAGE_MARKS[markId].aboard === true;
export const STAGE_MARK_IDS = Object.freeze(Object.keys(STAGE_MARKS));
export const STAGE_PACES = Object.freeze({ walk: 1.15, run: 2.1 });

/**
 * @param {object} host
 * @param {(mark: object, id: string) => ({x:number,y:number,z:number,heading?:number,
 *   seated?:boolean} | null)} host.resolve a mark's world pose now, or null
 * @param {(stop: string, x: number, z: number) => ({x:number,y:number,z:number} | null)}
 *   [host.station] a station-local point in world coordinates
 * @param {(id: string) => ({x:number,y:number,z:number,heading?:number} | null)}
 *   [host.origin] where a simulated person stands, for a move that takes them over
 */
export function createDramaStage(host) {
  /** entity id -> { mark, markId, hidden, path, pace, position, heading, expression } */
  const figures = new Map();
  const log = [];
  const note = (message) => {
    log.push(message);
    if (log.length > 20) log.shift();
  };

  function poseOf(markId, id) {
    const mark = STAGE_MARKS[markId];
    return mark ? host.resolve(mark, id) : null;
  }

  function settle(figure) {
    const pose = poseOf(figure.markId, figure.id);
    if (!pose) return false;
    figure.position = { x: pose.x, y: pose.y, z: pose.z };
    if (Number.isFinite(pose.heading)) figure.heading = pose.heading;
    figure.seated = Boolean(pose.seated);
    figure.seatHeight = Number.isFinite(pose.seatHeight) ? pose.seatHeight : undefined;
    return true;
  }

  const api = {
    marks: STAGE_MARK_IDS,
    /** Put a person on a mark now. A door mark means aboard: hidden until they move. */
    place(id, markId) {
      if (!STAGE_MARKS[markId]) throw new TypeError(`unknown stage mark ${markId}`);
      const figure = figures.get(id) ?? {
        id,
        heading: 0,
        position: null,
        expression: null,
        expressionFor: 0,
      };
      Object.assign(figure, {
        markId,
        hidden: aboard(markId),
        path: [],
        target: null,
        pace: 0,
        seated: false,
      });
      figures.set(id, figure);
      if (!settle(figure)) note(`${id}: mark ${markId} is not in the world yet`);
      return api.figureOf(id);
    },
    /** Walk or run to a mark through its `via` points; arriving at a door boards. */
    move(id, markId, pace = 'walk') {
      const mark = STAGE_MARKS[markId];
      if (!mark) throw new TypeError(`unknown stage mark ${markId}`);
      let figure = figures.get(id);
      if (!figure) {
        // Take the person over from the simulation where they stand now.
        const origin = host.origin?.(id);
        if (!origin) {
          note(`${id} is not in the world; placing at ${markId}`);
          return api.place(id, markId);
        }
        figure = {
          id,
          markId: null,
          hidden: false,
          path: [],
          target: null,
          pace: 0,
          seated: false,
          heading: origin.heading ?? 0,
          position: { x: origin.x, y: origin.y, z: origin.z },
          expression: null,
          expressionFor: 0,
        };
        figures.set(id, figure);
      }
      // Stepping off the train: start at the door.
      if (figure.hidden && figure.markId) {
        settle(figure);
        figure.hidden = false;
      }
      if (!figure.position && figure.markId) settle(figure);
      const points = (mark.via ?? [])
        .map(([x, z]) => host.station?.(mark.viaStop ?? mark.stop, x, z) ?? null)
        .filter(Boolean);
      figure.path = points;
      figure.target = markId;
      figure.pace = STAGE_PACES[pace] ?? STAGE_PACES.walk;
      figure.seated = false;
      return api.figureOf(id);
    },
    /** A short acting note for a staged person, like the minds' directives. */
    direct(id, { mood, intent, holdSeconds = 30 } = {}) {
      const figure = figures.get(id);
      if (!figure) return false;
      figure.expression = { mood: mood ?? null, intent: intent ?? null };
      figure.expressionFor = holdSeconds;
      return true;
    },
    expressionFor(id) {
      const figure = figures.get(id);
      if (!figure?.expression || figure.expressionFor <= 0) return null;
      return {
        mood: figure.expression.mood ?? 'content',
        intent: figure.path.length || figure.target ? 'continue' : figure.expression.intent,
        source: 'directed',
      };
    },
    has: (id) => figures.has(id),
    /** True while a staged person sits or stands on a mark inside a carriage. */
    inCar: (id) => {
      const figure = figures.get(id);
      return Boolean(figure && !figure.target && STAGE_MARKS[figure.markId]?.kind === 'car');
    },
    /** The figure a hero model follows, in the shape of world-details figureOf. */
    figureOf(id) {
      const figure = figures.get(id);
      if (!figure || !figure.position) return figure ? { visible: false } : null;
      return {
        position: figure.position,
        heading: figure.heading,
        visible: !figure.hidden,
        walking: Boolean(figure.target),
        pose: figure.seated ? 'seated' : 'standing',
        ...(figure.seated && figure.seatHeight !== undefined
          ? { seatHeight: figure.seatHeight }
          : {}),
        state: figure.target ? 'walking' : 'staged',
      };
    },
    update(dt) {
      if (!(dt > 0)) return;
      for (const figure of figures.values()) {
        figure.expressionFor = Math.max(0, figure.expressionFor - dt);
        if (!figure.target) {
          // Seats move with the train; station marks do not, but re-reading is cheap.
          if (!figure.hidden && figure.markId) settle(figure);
          continue;
        }
        const goal = figure.path[0] ?? poseOf(figure.target, figure.id);
        if (!goal || !figure.position) continue;
        const dx = goal.x - figure.position.x;
        const dz = goal.z - figure.position.z;
        const distance = Math.hypot(dx, dz);
        const step = figure.pace * dt;
        if (distance > 1e-3) figure.heading = Math.atan2(dx, dz);
        if (distance <= step) {
          figure.position = { x: goal.x, y: goal.y, z: goal.z };
          if (figure.path.length) figure.path.shift();
          else {
            figure.markId = figure.target;
            figure.target = null;
            figure.hidden = aboard(figure.markId);
            settle(figure);
          }
          continue;
        }
        const t = step / distance;
        figure.position = {
          x: figure.position.x + dx * t,
          y: figure.position.y + (goal.y - figure.position.y) * t,
          z: figure.position.z + dz * t,
        };
      }
    },
    /** Hand everyone back to the simulation. */
    clear() {
      figures.clear();
    },
    ids: () => [...figures.keys()],
    getState() {
      return {
        figures: [...figures.values()].map((figure) => ({
          id: figure.id,
          mark: figure.markId,
          moving: figure.target ?? null,
          hidden: figure.hidden,
          position: figure.position
            ? [figure.position.x, figure.position.y, figure.position.z].map(
                (value) => Math.round(value * 100) / 100,
              )
            : null,
        })),
        log: [...log],
      };
    },
  };
  return api;
}

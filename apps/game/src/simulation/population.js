import { CAR_COUNT, CAR_SPACING } from '../train/consist.js';
// Optional NPC minds (context.minds) may delay a waiting passenger's walk to the door by at
// most this many seconds. They can never slow the walk to the door or prevent boarding.
export const MAX_MIND_BOARDING_DELAY = 2;
const PAUSING_INTENTS = new Set([
  'linger',
  'chat',
  'watch-train',
  'check-phone',
  'sit',
  'stretch',
  'wave',
]);
// Deterministic residents and passengers. No renderer or random position changes.
export function createPopulation({ center, terrain, homes = [], stationZ = 525 }) {
  const stationX = center(stationZ) + 28,
    angle = Math.atan2(center(stationZ + 1) - center(stationZ), 1),
    cs = Math.cos(angle),
    sn = Math.sin(angle);
  const people = [],
    events = [];
  let elapsed = 0,
    service = 0,
    serving = false,
    serviceStarted = 0,
    departedSinceService = true;
  const stationPoint = (x, z, y = 5.35) => ({
    x: stationX + x * cs + z * sn,
    y,
    z: stationZ - x * sn + z * cs,
    surface: 'fixed',
  });
  const localStation = (p) => ({
    x: (p.x - stationX) * cs - (p.z - stationZ) * sn,
    z: (p.x - stationX) * sn + (p.z - stationZ) * cs,
  });
  const groundPoint = (u, z) => ({
    x: center(z) + u,
    y: terrain(u, z) + 0.285,
    z,
    surface: 'ground',
  });
  const entry = stationPoint(5, 35);
  entry.y = terrain(entry.x - center(entry.z), entry.z) + 0.285;
  const rampBottom = stationPoint(5, 23);
  rampBottom.y = terrain(rampBottom.x - center(rampBottom.z), rampBottom.z) + 0.285;
  const rampTop = stationPoint(5, 14);
  const copy = (p) => ({ ...p });
  function event(person, type) {
    events.push({ person: person.id, type, time: Math.round(elapsed * 10) / 10, service });
    if (events.length > 50) events.shift();
  }
  function setRoute(person, route, next) {
    person.route = route.map(copy);
    person.routeIndex = 0;
    person.nextState = next;
    person.walking = route.length > 0;
  }
  function person(id, role, state, position, extra = {}) {
    const p = {
      id,
      role,
      state,
      destination: 'Momiji platform',
      position: copy(position),
      visible: true,
      walking: false,
      heading: 0,
      route: [],
      routeIndex: 0,
      speed: 1.05 + (people.length % 3) * 0.12,
      lastService: 0,
      stateTime: 0,
      mindSpeed: 1,
      mindPause: false,
      mindShelter: false,
      ...extra,
    };
    people.push(p);
    return p;
  }
  for (let i = 0; i < 6; i++) {
    const wait = stationPoint(4.2 + (i % 2) * 0.65, -32 + i * 5.4),
      atPlatform = i < 3;
    const p = person(
      `commuter-${i + 1}`,
      ['office commuter', 'school student', 'market shopper'][i % 3],
      atPlatform ? 'waiting' : 'arriving',
      atPlatform ? wait : stationPoint(5, 35 + (i - 3) * 2),
      { wait, queue: i, coat: i % 5 },
    );
    if (!atPlatform) {
      p.position.y = terrain(p.position.x - center(p.position.z), p.position.z) + 0.285;
      setRoute(p, [entry, rampBottom, rampTop, wait], 'waiting');
    }
  }
  for (let i = 0; i < 3; i++)
    person(
      `returning-${i + 1}`,
      ['returning resident', 'guesthouse visitor', 'delivery worker'][i],
      'riding',
      stationPoint(4, -28 + i * 10),
      { wait: stationPoint(4.5, -28 + i * 10), queue: 6 + i, visible: false, coat: (i + 1) % 5 },
    );
  // Residents have distinct errands on the village lane; each route ends at a real doorway or garden.
  for (let i = 0; i < 5; i++) {
    const home = homes[i] ?? { u: 48, z: -235 + i * 25, y: terrain(48, -235 + i * 25) + 0.3, w: 8 };
    const front = {
      x: center(home.z) + home.u - home.w / 2 - 0.8,
      y: home.y + 0.55,
      z: home.z,
      surface: 'fixed',
    };
    const lane = groundPoint(39.5, home.z),
      targetZ = [-113, -178, -235, -145, -208][i],
      destination = groundPoint(39.5, targetZ);
    const stop = homes.find((h) => Math.abs(h.z - targetZ) < 1);
    const doorstep = stop
      ? {
          x: center(stop.z) + stop.u - stop.w / 2 - 0.8,
          y: stop.y + 0.55,
          z: stop.z,
          surface: 'fixed',
        }
      : destination;
    const laneRoute = (from, to) => {
      const points = [];
      const count = Math.max(1, Math.ceil(Math.abs(to - from) / 5));
      for (let k = 1; k <= count; k++)
        points.push(groundPoint(39.5, from + ((to - from) * k) / count));
      return points;
    };
    const role = [
      'shopkeeper',
      'post carrier',
      'vegetable gardener',
      'school student',
      'retired neighbour',
    ][i];
    const p = person(`resident-${i + 1}`, role, 'at-home', front, {
      coat: i,
      queue: i,
      home: front,
      lane,
      outbound: [{ ...lane, surface: 'fixed' }, ...laneRoute(home.z, targetZ), doorstep],
      inbound: [{ ...destination, surface: 'fixed' }, ...laneRoute(targetZ, home.z), front],
      destinationPoint: doorstep,
      destinationLane: destination,
      departure: 3 + i * 7,
      dwell: 12 + i * 4,
      village: true,
      destination: [
        'village shop',
        'delivery doorway',
        'vegetable garden',
        'friend’s house',
        'tea veranda',
      ][i],
    });
    p.visible = true;
  }
  // Three additional station regulars have small, repeatable off-track routines.
  const readingSeat = stationPoint(6.1, -19);
  const readerHomeData = homes[7] ??
    homes[0] ?? { u: 48, z: -113, y: terrain(48, -113) + 0.3, w: 8 };
  const readerHome = {
    x: center(readerHomeData.z) + readerHomeData.u - readerHomeData.w / 2 - 0.8,
    y: readerHomeData.y + 0.55,
    z: readerHomeData.z,
    surface: 'fixed',
  };
  const villageLane = (from, to) => {
    const route = [];
    const count = Math.max(1, Math.ceil(Math.abs(to - from) / 5));
    for (let i = 1; i <= count; i++)
      route.push(groundPoint(39.5, from + ((to - from) * i) / count));
    return route;
  };
  person('reader-1', 'retired newspaper reader', 'reading', readingSeat, {
    actor: 'reader',
    coat: 4,
    queue: 10,
    pose: 'reading',
    heading: angle - Math.PI / 2,
    destination: 'station bench',
    home: readerHome,
    seat: readingSeat,
    inbound: [
      stationPoint(5.2, -19),
      rampTop,
      rampBottom,
      entry,
      ...villageLane(entry.z, readerHome.z),
      readerHome,
    ],
    outbound: [
      groundPoint(39.5, readerHome.z),
      ...villageLane(readerHome.z, entry.z),
      entry,
      rampBottom,
      rampTop,
      stationPoint(5.2, -19),
      readingSeat,
    ],
  });
  const shopperStart = stationPoint(5.2, -33);
  const bagSpot = stationPoint(5.2, -19.8);
  const helperHome = stationPoint(5.6, -7);
  const shopper = person(
    'shopper-visitor',
    'visitor carrying a market bag',
    'walking-to-exit',
    shopperStart,
    {
      actor: 'shopper',
      coat: 1,
      queue: 11,
      bagDropped: false,
      pose: 'standing',
      destination: 'station village exit',
    },
  );
  setRoute(shopper, [bagSpot], 'searching-for-bag');
  person('helpful-neighbour', 'neighbour helping a visitor', 'reading-noticeboard', helperHome, {
    actor: 'helper',
    coat: 2,
    queue: 12,
    pose: 'standing',
    destination: 'station noticeboard',
  });
  function updateActor(p, dt, context) {
    if (p.actor === 'reader') {
      if (p.state === 'reading') {
        p.pose = 'reading';
        p.heading = angle - Math.PI / 2;
        if (elapsed - p.stateTime > 38 + (p.mindPause ? 12 : 0)) {
          p.state = 'returning-home';
          p.pose = 'standing';
          p.destination = 'home after the morning paper';
          setRoute(p, p.inbound, 'at-home');
          event(p, 'finished-newspaper');
        }
      } else if (
        p.state === 'at-home' &&
        elapsed >= p.departure &&
        context.stationActivity !== 'shelter'
      ) {
        p.state = 'walking-to-bench';
        p.destination = 'station bench';
        setRoute(p, p.outbound, 'reading');
        event(p, 'walked-to-reading-bench');
      }
      advanceRoute(p, dt);
      p.pose = p.state === 'reading' ? 'reading' : 'standing';
      if (p.state === 'reading') p.heading = angle - Math.PI / 2;
      return;
    }
    if (p.actor === 'shopper') {
      if (p.state === 'searching-for-bag' && !p.bagDropped) {
        p.bagDropped = true;
        p.destination = 'recover dropped market bag';
        event(p, 'dropped-market-bag');
      }
      if (p.state === 'thanking-neighbour' && elapsed - p.stateTime > 6) {
        p.state = 'walking-to-exit';
        p.pose = 'standing';
        p.destination = 'station village exit';
        setRoute(p, [stationPoint(5.2, -5), rampTop, rampBottom, entry], 'visiting-village');
      }
      if (p.state === 'visiting-village' && elapsed - p.stateTime > 35) {
        p.state = 'returning-with-shopping';
        p.destination = 'station platform';
        setRoute(p, [rampBottom, rampTop, shopperStart, bagSpot], 'searching-for-bag');
      }
    } else if (p.actor === 'helper') {
      if (
        p.state === 'reading-noticeboard' &&
        shopper.bagDropped &&
        elapsed - shopper.stateTime > 2
      ) {
        p.state = 'walking-to-help';
        p.destination = 'help visitor with market bag';
        setRoute(p, [stationPoint(5.6, -18.9)], 'helping-with-bag');
        event(p, 'noticed-dropped-bag');
      }
      if (p.state === 'helping-with-bag') {
        p.pose = 'helping';
        p.heading = Math.atan2(
          shopper.position.x - p.position.x,
          shopper.position.z - p.position.z,
        );
        if (elapsed - p.stateTime > 3) {
          shopper.bagDropped = false;
          shopper.state = 'thanking-neighbour';
          shopper.stateTime = elapsed;
          shopper.pose = 'talking';
          shopper.heading = Math.atan2(
            p.position.x - shopper.position.x,
            p.position.z - shopper.position.z,
          );
          p.state = 'chatting';
          p.stateTime = elapsed;
          p.pose = 'talking';
          event(p, 'returned-market-bag');
        }
      }
      if (p.state === 'chatting' && elapsed - p.stateTime > 6) {
        p.state = 'returning-to-noticeboard';
        p.pose = 'standing';
        p.destination = 'station noticeboard';
        setRoute(p, [helperHome], 'reading-noticeboard');
      }
    }
    advanceRoute(p, dt);
    if (p.walking) p.pose = 'standing';
  }
  function doors(context) {
    const position = context.trainPosition;
    if (!position) return [];
    const direction = context.travelDirection < 0 ? -1 : 1,
      results = [];
    for (let car = 0; car < CAR_COUNT; car++)
      for (const longitudinal of [-4.59, 4.59]) {
        const z = position[2] - direction * car * CAR_SPACING + direction * longitudinal,
          tan = center(z + 0.1) - center(z - 0.1),
          a = Math.atan2(tan, 0.2),
          x = center(z) + 28 + Math.cos(a) * 1.72,
          zz = z - Math.sin(a) * 1.72;
        const p = {
            x,
            y: (position[1] ?? 4.75) + 1.05,
            z: zz,
            surface: 'fixed',
            car,
            door: longitudinal > 0 ? 'front' : 'rear',
          },
          local = localStation(p);
        if (local.z >= -40 && local.z <= 13) results.push(p);
      }
    return results;
  }
  function advanceRoute(p, dt) {
    // A mind may speed anyone up. It never slows a passenger heading for a door, or any
    // platform passenger while a train is being served.
    const scale =
      p.state === 'approaching-door' ||
      p.state === 'boarding' ||
      (serving && !p.village && !p.actor)
        ? Math.max(1, p.mindSpeed)
        : p.mindSpeed;
    let remaining = p.speed * scale * dt;
    p.walking = false;
    while (remaining > 0 && p.routeIndex < p.route.length) {
      const target = p.route[p.routeIndex],
        dx = target.x - p.position.x,
        dz = target.z - p.position.z,
        d = Math.hypot(dx, dz);
      if (d < 0.015) {
        p.position = copy(target);
        p.routeIndex++;
        continue;
      }
      const move = Math.min(d, remaining),
        fraction = move / d;
      p.heading = Math.atan2(dx, dz);
      p.position.x += dx * fraction;
      p.position.z += dz * fraction;
      p.position.y =
        target.surface === 'ground'
          ? terrain(p.position.x - center(p.position.z), p.position.z) + 0.285
          : p.position.y + (target.y - p.position.y) * fraction;
      remaining -= move;
      p.walking = true;
      if (move >= d - 0.001) {
        p.position = copy(target);
        p.routeIndex++;
      }
    }
    if (p.route.length && p.routeIndex === p.route.length) {
      p.route = [];
      p.state = p.nextState;
      p.stateTime = elapsed;
      p.walking = false;
      if (p.state === 'boarding') event(p, 'at-door');
      if (p.state === 'at-home') p.departure = elapsed + 22 + p.queue * 1.5;
    }
  }
  return {
    people,
    stationPoint,
    /** True when a world point lies on the Momiji platform strip. Allocation-free. */
    platformAt(x, z) {
      const dx = x - stationX,
        dz = z - stationZ,
        localX = dx * cs - dz * sn,
        localZ = dx * sn + dz * cs;
      return localX > 1.5 && localX < 8 && localZ > -42 && localZ < 15;
    },
    entry,
    rampBottom,
    rampTop,
    update(dt, context = {}) {
      if (dt <= 0) return;
      dt = Math.min(dt, 0.25);
      elapsed += dt;
      const openDoors =
        context.doorsOpen === true && Math.abs(context.speed ?? Infinity) < 0.2
          ? doors(context)
          : [];
      const nowServing = openDoors.length > 0;
      if (context.trainPosition && Math.abs(context.trainPosition[2] - stationZ) > 90)
        departedSinceService = true;
      if (nowServing && !serving && departedSinceService) {
        departedSinceService = false;
        service++;
        serviceStarted = elapsed;
        let arrival = 0;
        for (const p of people)
          if (p.state === 'riding') {
            p.state = 'alighting-scheduled';
            p.alightAt = elapsed + 0.8 + arrival * 1.5;
            p.serviceDoor = copy(openDoors[arrival % openDoors.length]);
            p.lastService = service;
            arrival++;
          }
        events.push({ type: 'station-service', service, time: Math.round(elapsed * 10) / 10 });
      }
      serving = nowServing;
      const minds = context.minds;
      for (const p of people) {
        const expression = minds?.expressionFor(p.id);
        p.mindSpeed = Number.isFinite(expression?.walkSpeedScale)
          ? Math.min(1.4, Math.max(0.6, expression.walkSpeedScale))
          : 1;
        p.mindPause = Boolean(expression && PAUSING_INTENTS.has(expression.intent));
        p.mindShelter = expression?.intent === 'shelter';
        if (p.actor) {
          updateActor(p, dt, context);
          continue;
        }
        if (p.village) {
          const sheltering = context.stationActivity === 'shelter' || p.mindShelter;
          if (p.state === 'at-home' && elapsed >= p.departure && !sheltering) {
            p.state = 'going-to-errand';
            setRoute(p, p.outbound, 'at-destination');
            event(p, 'left-home');
          }
          if (
            p.state === 'at-destination' &&
            (sheltering ||
              elapsed - p.stateTime >
                p.dwell * (context.stationActivity === 'stroll' ? 1.5 : 1) + (p.mindPause ? 10 : 0))
          ) {
            p.state = 'returning-home';
            setRoute(p, p.inbound, 'at-home');
            event(p, 'errand-complete');
          }
          advanceRoute(p, dt);
          continue;
        }
        // Platform passengers use the station canopy while waiting in wet weather.
        // An arriving service always takes priority over the director's activity.
        const wantsShelter = context.stationActivity === 'shelter' || p.mindShelter;
        if (p.state === 'waiting' && !nowServing && wantsShelter) {
          p.state = 'seeking-shelter';
          p.destination = 'station canopy';
          setRoute(p, [stationPoint(5.4 + (p.queue % 2) * 0.5, -4 + p.queue * 1.2)], 'sheltering');
        }
        if (['seeking-shelter', 'sheltering'].includes(p.state) && (nowServing || !wantsShelter)) {
          p.state = 'arriving';
          p.destination = 'Momiji platform';
          setRoute(p, [p.wait], 'waiting');
        }
        if (p.state === 'alighting-scheduled') {
          if (!nowServing) {
            p.state = 'riding';
            continue;
          }
          if (elapsed >= p.alightAt) {
            p.position = copy(p.serviceDoor);
            p.visible = true;
            p.state = 'alighting';
            p.destination = 'station village exit';
            const local = localStation(p.position);
            setRoute(
              p,
              [stationPoint(3.6, local.z), stationPoint(5, local.z), rampTop, rampBottom, entry],
              'leaving-station',
            );
            event(p, 'disembarked-at-door');
          }
        }
        if (
          p.state === 'leaving-station' &&
          elapsed - p.stateTime > 18 + p.queue + (p.mindPause ? 8 : 0)
        ) {
          p.state = 'arriving';
          p.destination = 'Momiji platform';
          setRoute(p, [rampBottom, rampTop, p.wait], 'waiting');
        }
        if (
          p.state === 'waiting' &&
          nowServing &&
          service > p.lastService &&
          elapsed - serviceStarted >
            5.5 + p.queue * 0.7 + (p.mindPause ? MAX_MIND_BOARDING_DELAY : 0)
        ) {
          p.serviceDoor = copy(openDoors[p.queue % openDoors.length]);
          const local = localStation(p.serviceDoor);
          p.state = 'approaching-door';
          p.destination = `car ${p.serviceDoor.car + 1}, ${p.serviceDoor.door} door`;
          setRoute(
            p,
            [stationPoint(4.1, local.z), stationPoint(2.6, local.z), p.serviceDoor],
            'boarding',
          );
        }
        if ((p.state === 'approaching-door' || p.state === 'boarding') && !nowServing) {
          p.state = 'arriving';
          p.destination = 'Momiji platform';
          setRoute(p, [p.wait], 'waiting');
          event(p, 'boarding-cancelled');
        }
        advanceRoute(p, dt);
        if (p.state === 'boarding' && nowServing && elapsed - p.stateTime >= 1.25) {
          p.state = 'riding';
          p.visible = false;
          p.lastService = service;
          p.destination = 'next station';
          p.route = [];
          event(p, 'boarded-at-door');
        }
      }
    },
    getState() {
      return {
        elapsed: Math.round(elapsed),
        service,
        serving,
        counts: people.reduce(
          (counts, p) => ((counts[p.state] = (counts[p.state] ?? 0) + 1), counts),
          {},
        ),
        people: people.map((p) => ({
          id: p.id,
          role: p.role,
          state: p.state,
          destination: p.destination,
          visible: p.visible,
          position: { ...p.position },
          walking: p.walking,
          pose: p.pose ?? 'standing',
          bagDropped: Boolean(p.bagDropped),
        })),
        recentEvents: events.slice(-20),
      };
    },
  };
}

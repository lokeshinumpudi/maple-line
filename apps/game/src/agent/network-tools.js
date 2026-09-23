/**
 * WebMCP tools for the regional network and missions. Registered through the same validated
 * `tool()` as route-tools.js. Mission actions call the same methods as the Network dialog.
 * None of these tools drive the train: loading still needs the player to stop with doors open.
 */
export function registerNetworkTools({ tool, network, missions, business }) {
  if (typeof tool !== 'function' || !network?.getState || !missions?.getState)
    throw new TypeError('Network tools need tool(), the rail network and missions.');
  const schema = (properties = {}, required = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });
  const missionId = { type: 'string', pattern: '^m[0-9]{1,7}$', minLength: 2, maxLength: 8 };
  const stationId = { type: 'string', enum: network.stationIds() };
  const ledger = () => business?.getLedger?.() ?? missions.getState().ledger;

  tool(
    'get_network_state',
    'Read the regional rail network: game clock, lines (only the Maple Line is rendered in 3D; the others are simulated on the map), which lines are unlocked, AI train positions, single-track block holders and dispatcher stats. Read-only.',
    schema(),
    true,
    () => {
      const state = network.getState();
      const map = network.getMap();
      return {
        ...state,
        trains: state.trains.slice(0, 60),
        lines: map.lines.map(({ id, name, track, electrified, speedKmh, rendered, stations }) => ({
          id,
          name,
          track,
          electrified,
          speedKmh,
          rendered,
          stations,
          unlocked: state.unlockedLines.includes(id),
        })),
        junctions: map.junctions,
        prefectures: map.prefectures,
      };
    },
  );
  tool(
    'get_missions',
    'Read offered and active missions, handling progress, deadlines in game minutes, campaign step and unlocks. Read-only.',
    schema(),
    true,
    () => {
      const state = missions.getState();
      return { ...state, archive: state.archive.slice(0, 6), ledger: undefined };
    },
  );
  tool(
    'accept_mission',
    'Accept an offered mission by id through the same action as the Network dialog. Fails when capacity (seats, one freight wagon) or the three-mission limit is reached. Accepting does not move the train.',
    schema({ id: missionId }, ['id']),
    false,
    ({ id }) => {
      const result = missions.accept(id);
      if (!result.ok) throw new Error(result.message ?? result.reason ?? 'Mission unavailable.');
      return { ...result, missions: missions.getState().active };
    },
  );
  tool(
    'abandon_mission',
    'Abandon an active mission (charges half its penalty) or decline an offered non-campaign mission (free).',
    schema({ id: missionId }, ['id']),
    false,
    ({ id }) => {
      const result = missions.abandon(id);
      if (!result.ok) throw new Error(result.message ?? result.reason ?? 'Mission unavailable.');
      return { ...result, ledger: ledger() };
    },
  );
  tool(
    'plan_network_route',
    'Find the fastest route between two network stations by timetable speed, with line changes and a five-minute transfer allowance. Set unlockedOnly to limit the search to unlocked lines. Read-only.',
    schema({ from: stationId, to: stationId, unlockedOnly: { type: 'boolean' } }, ['from', 'to']),
    true,
    ({ from, to, unlockedOnly = false }) => {
      const route = network.planRoute(from, to, { unlockedOnly });
      if (!route.ok) throw new Error(route.message ?? route.reason);
      return route;
    },
  );
  tool(
    'get_company_ledger',
    'Read the player company: money in yen, reputation per prefecture (0–100), seat and freight-wagon capacity, completed and failed contracts, recent entries. Read-only.',
    schema(),
    true,
    ledger,
  );
}

/** Adapter for `registerGameWebMCP({ extensions: [...] })`. */
export const networkToolsExtension =
  (deps) =>
  ({ tool }) =>
    registerNetworkTools({ tool, ...deps });

export function registerRouteTools({ tool, getState, choose }) {
  const schema = (properties = {}, required = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });
  tool(
    'get_route_state',
    'Inspect the physical direct and wetland routes, selection, stop board, and current route authority. Read-only. Both tracks rejoin before Kawasemi.',
    schema(),
    true,
    getState,
  );
  tool(
    'choose_route',
    'Request a pre-authorised excursion route through the same action as the UI. Requires stopping at the route board with doors closed and no active conversation. Rejects switching while a train occupies the branch. This changes the actual path of every carriage.',
    schema({ route: { type: 'string', enum: ['direct', 'wetland'] } }, ['route']),
    false,
    ({ route }) => {
      const result = choose(route);
      if (!result.ok) throw new Error(result.message ?? result.reason ?? 'Route unavailable.');
      return { ...result, state: getState() };
    },
  );
}

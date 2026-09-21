/** The host action callback is shared with UI and applies requested train controls. */
export function registerRailwayTools({ tool, duties, act }) {
  if (
    typeof tool !== 'function' ||
    typeof duties?.getState !== 'function' ||
    typeof act !== 'function'
  ) {
    throw new TypeError('Railway tools require a duty engine and the host action callback.');
  }
  const state = () => structuredClone(duties.getState());
  const objectSchema = (properties = {}, required = []) => ({
    type: 'object',
    properties,
    required,
    additionalProperties: false,
  });
  tool(
    'get_duties_state',
    'Read Momiji’s current passenger routing, boarding, signal clearance and passing train state, with available actions. This does not operate the train.',
    objectSchema(),
    true,
    state,
  );
  let pending = false;
  tool(
    'railway_action',
    'Perform one available station duty using the same controls as the game UI. Set the passenger route, open or close actual train doors, request clearance, or depart after the other train passes. Freight selection gives recoverable feedback. Waiting cannot be skipped and this tool cannot reset progress.',
    objectSchema(
      {
        action: {
          type: 'string',
          enum: [
            'route-passenger',
            'route-freight',
            'open-doors',
            'close-doors',
            'request-clearance',
            'depart',
          ],
        },
      },
      ['action'],
    ),
    false,
    async ({ action }) => {
      if (pending) throw new Error('A railway action is already in progress.');
      if (!duties.getState().availableActions.includes(action))
        throw new Error(
          'That railway action is unavailable. Read get_duties_state for available actions.',
        );
      pending = true;
      try {
        const result = await act(action);
        if (!result?.ok)
          throw new Error(result?.message ?? 'The railway action could not be completed.');
        return { action, ...result, duties: state() };
      } finally {
        pending = false;
      }
    },
  );
}

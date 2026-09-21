/** Unvoiced notebook labels derived from story facts; never award or change progress. */
export function describeRecordedTask(task) {
  if (!task?.completed) return null;
  if (task.kind === 'delivery-plan') {
    const proposal = task.delivery?.proposal;
    if (proposal === 'later-clinic')
      return 'Proposed: ask the clinic about 10:00. Confirmation is still pending; the crate stays with Nao.';
    if (proposal === 'shared-van')
      return 'Proposed: ask about the shared van. Confirmation is still pending; the crate stays with Nao.';
    return 'Proposal recorded. Confirmation is still pending; the crate stays with Nao.';
  }
  if (task.id === 'return-spanner') return 'Fumi’s spanner returned to the workshop.';
  if (task.id === 'amend-connection') return 'Proposed connection correction pinned to the board.';
  return `Recorded action: ${task.title}.`;
}

export function currentNotebookPage(state) {
  const beat = state.activeBeat;
  if (state.status !== 'dialogue' || !beat) return null;
  const reply = beat.choices?.find((choice) => choice.id === beat.selectedChoice);
  let prompt = 'Return to the conversation when you are ready to continue.';
  if (beat.choices?.length && !reply)
    prompt = 'A reply is waiting. Return to the conversation to choose what Haru says.';
  else if (beat.task?.required && !beat.task.completed)
    prompt = `Still to do: ${beat.task.title}. Return to the conversation to finish it.`;
  return {
    title: beat.title,
    reply: reply?.label ?? null,
    action: describeRecordedTask(beat.task),
    prompt,
  };
}

export function latestConversationMemory(state) {
  if (state.status !== 'travelling') return null;
  const beatId = state.seenIds.at(-1);
  return (
    state.memories.findLast(
      (memory) => memory.origin?.beatId === beatId && memory.origin.kind !== 'field-note',
    ) ?? null
  );
}

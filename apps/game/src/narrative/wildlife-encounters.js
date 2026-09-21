// Authored listening stops. These do not change the order or outcome of Haru's conversations.
const woodland = {
  spring: ['japanese-hare', 'Japanese hare'],
  summer: ['tanuki', 'Tanuki'],
  autumn: ['japanese-squirrel', 'Japanese squirrel'],
  winter: ['red-fox', 'Red fox'],
};
const birds = {
  spring: ['japanese-white-eye', 'Japanese white-eye'],
  summer: ['barn-swallow', 'Barn swallow'],
  autumn: ['varied-tit', 'Varied tit'],
  winter: ['long-tailed-tit', 'Long-tailed tit'],
};
const actions = [
  { id: 'wait', label: 'Wait quietly with Haru' },
  { id: 'record', label: 'Record with Emi' },
];
export const wildlifeEncounters = {
  'the-recorder': {
    title: 'A smaller beginning',
    species: woodland,
    actions,
    invitation: 'Something moves beside the verge. Emi lowers her lunch bag.',
    wait: 'We stop talking. The little visitor lowers its head and goes back to searching the grass. “That was a good beginning,” Emi says. I had not said a word.',
    record:
      'Emi records the rustle beside the line. I begin to supply its railway history. She raises one finger. For once, I take the hint.',
    note: 'Before the first story, we made room for a rustle in the grass.',
  },
  'sakuragawa-water': {
    title: 'Jun’s old opponents',
    species: birds,
    actions,
    invitation: 'A small bird settles beside the paddies while Jun checks the pump.',
    wait: '“Jun used to chase them,” I tell her. We stay still until the bird begins looking for food. “Did he ever win?” she asks. Not that I remember.',
    record:
      'Emi holds the recorder still. “Keep the bit about Jun losing,” she says. “The bird can have the last word.”',
    note: 'At Sakuragawa, Jun’s old opponents still have the last word.',
  },
  'hinoki-furniture': {
    title: 'The woodworker’s neighbours',
    species: woodland,
    actions,
    invitation: 'A visitor noses through the grass beyond the platform.',
    wait: 'A visitor noses through the leaves while the timber order is being checked. I put the phone face down. For a minute, neither the depot nor the recording needs an answer.',
    record:
      'Emi records the small movement under the workshop hedge. The order ledger stays closed beside us. We keep this sound because we wanted to hear it, not because it proves anything about the timetable.',
    note: 'At Hinoki, we kept a moment that did not have to become an argument.',
  },
  'yukihara-scaffolding': {
    title: 'Outside the café',
    species: { ...woodland, winter: ['japanese-macaque', 'Japanese macaque'] },
    actions,
    invitation: 'Beyond the café platform, a neighbour is investigating the verge.',
    wait: 'Beyond the café, a visitor checks the edge of the snow. Emi leaves the recorder off. Mika has gone inside to answer a supplier, and we let this minute belong to nobody’s programme.',
    record:
      'Emi points the recorder toward the verge. “Next summer we can record this spot again.” I write that down before I can turn it into a story about last summer.',
    note: 'A place to record again next summer, outside Mika’s café.',
  },
  'akane-notebook': {
    title: 'A name in the margin',
    species: birds,
    actions,
    invitation: 'A bird pauses near the platform. Emi leaves a line blank in the notebook.',
    wait: 'I start to name the bird, then stop. “You can leave a blank,” Emi says. We watch its markings instead. The notebook survives the uncertainty.',
    record:
      '“Describe what you actually hear,” Emi says. I write a small sound, a short pause. There is room beside it for her handwriting.',
    note: 'At Akane, we left room beside an observation for another person’s words.',
  },
};

export const wildlifeBroadcast = {
  beatId: 'harumi-broadcast',
  line: 'Emi has kept a little of our wildlife recording between the voices. I nearly ask her to fill the pause. Then I recognise it: the two of us, listening.',
};

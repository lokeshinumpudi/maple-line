/** Original optional scene; separate from the campaign's prepared narration. */
export const routeChoiceScene = freezeScene({
  id: 'kawasemi-route-choice',
  title: 'Beyond the platform',
  intro:
    'A passenger has asked Emi whether the path beyond Kawasemi’s bus stop has a seat. Haru knows the station bench; he has never needed the other one. He admits that his timetable ends before her trip does.',
  operatingNote:
    'Today’s fictional excursion has two pre-authorised paths. Request one while stopped at the route board; the points remain locked while a train occupies the branch.',
  choices: {
    direct: {
      id: 'direct',
      label: 'Direct · time at the connection board',
      consequence:
        'Reach Kawasemi sooner, with time to ask about the outward bus, the return and the waiting place.',
      afterSelection:
        'Haru wants to check both bus directions at Kawasemi. Emi leaves space for the question the arrival time cannot answer: where does the passenger wait?',
      captions: [
        'The timetable names the bus stop. It does not show where she waits.',
        'Haru looks past the return time: is there a seat and shelter?',
      ],
      arrivalNote:
        'Ask at the desk about both bus directions and the waiting place. A connection is not confirmed yet.',
    },
    wetland: {
      id: 'wetland',
      label: 'Wetland · see the walking route',
      consequence:
        'Take the slower loop past the public footbridge. Look for the path and bench beyond the reeds; the bus connection still needs checking.',
      afterSelection:
        'Haru has called this the short walk for years. On the loop, he and Emi can look at the part of the trip he usually leaves out.',
      captions: [
        'Emi points out the footbridge. Beyond the reeds, the path still has some way to go.',
        'A bench appears on the far side. Haru cannot tell from the cab whether it makes the walk manageable.',
      ],
      arrivalNote:
        'The footbridge and far-side bench are worth asking about. Check the return bus too; the view alone cannot answer for the passenger.',
    },
  },
  captionPolicy: {
    mode: 'optional-text',
    replayable: true,
    requiresActualTraversal: true,
    deferDuringDrivingDemand: true,
  },
});

function freezeScene(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeScene(child);
    Object.freeze(value);
  }
  return value;
}

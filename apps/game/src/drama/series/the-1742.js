/**
 * The 17:42 — a three-episode companion drama for the director.
 *
 * Tomorrow Grandma Fusae moves to a care home in the city. Tonight she wants to hear
 * Grandpa's old radio one last time, in her own house up the valley. Riko has it, freshly
 * repaired. The last bus up the hill leaves Aonuma at 17:40; Riko's train gets in at 17:42.
 * Haru's campaign follows the driver who endorsed that timetable; this series stays on
 * the passenger side and does not use or alter the campaign's characters or saves.
 *
 * Riko is the same figure in every episode: the Momiji student `commuter-2`, whose model
 * the stage (drama/drama-stage.js) moves onto the train and off it at Aonuma. Fusae and
 * the bus driver Aoi are staged people with their own models. Every key time is also on
 * screen as words (a timetable insert, captions), so the story reads with the sound off.
 */
const CAST = {
  riko: { name: 'Riko', note: '17. Carrying Grandpa’s radio home, freshly repaired.' },
  sato: {
    name: 'Mr. Sato',
    note: '44. Takes the same train home. Quietly kind. His daughter drives the Aonuma bus.',
  },
  ishida: {
    name: 'Mr. Ishida',
    note: '70s. Reads on the Momiji bench. Missed that bus once, forty years ago.',
  },
  fusae: {
    name: 'Grandma Fusae',
    note: '80. Moves to a care home in the city tomorrow. Heard on the phone, then at Aonuma.',
  },
  aoi: { name: 'Aoi', note: '24. Drives the last bus up the hill. Cheerful. Mr. Sato’s daughter.' },
};

export const THE_1742 = Object.freeze({
  id: 'the-1742',
  title: 'The 17:42',
  japanese: '十七時四十二分',
  logline:
    'Tomorrow Grandma Fusae moves to a care home in the city. Tonight she wants to hear Grandpa’s old radio one last time, at home up the valley. Riko has it. The last bus up the hill leaves Aonuma at 17:40. Riko’s train gets in at 17:42.',
  // Hand-written Telugu lines a native speaker should read before a video is shared.
  review: [
    'Episode 2, Mr. Sato: “Aoi? It’s Dad…”. The spelling of Aoi (అఓయి) and Aonuma (అఓనుమా) in Telugu script.',
    'Episode 3, the radio line “(Static. Then soft music.)”: గరగర for radio static.',
    'Episode 1, the care-home line: వృద్ధాశ్రమం is the everyday word but can sound bleak; ఆశ్రమం or కేర్ హోమ్ are the alternatives.',
  ],
  episodes: [
    {
      id: 'the-1742-e1-two-minutes',
      series: 'The 17:42',
      number: 1,
      title: 'Two Minutes',
      logline:
        'At Momiji, Riko works out she will miss the last bus up the hill by two minutes. Two strangers on the platform notice the radio she is carrying.',
      cast: CAST,
      scenes: [
        {
          id: 'momiji-platform',
          heading: 'EXT. MOMIJI STATION — SUNSET, 16:51',
          set: {
            location: 'station',
            offset: -380,
            timeOfDay: 'sunset',
            weather: 'clear',
            speedKmh: 50,
            clock: '16:51',
          },
          stopAt: 'momiji',
          actors: { riko: 'commuter-2', sato: 'commuter-1', ishida: 'reader-1' },
          beats: [
            {
              shot: { type: 'establishing', aperture: 'deep' },
              caption: 'Momiji',
              subtitle: 'sunset · 16:51',
              line: 'Tomorrow, Grandma Fusae moves to a care home in the city.',
              lineTranslations: {
                'te-IN': 'రేపు ఫుసాయే బామ్మ పట్నంలోని వృద్ధాశ్రమానికి మారిపోతోంది.',
              },
              hold: 6,
              cues: [
                {
                  after: 0,
                  direct: { cast: 'riko', mood: 'wistful', intent: 'linger', hold: 60 },
                },
                { after: 0, direct: { cast: 'sato', mood: 'content', intent: 'linger', hold: 60 } },
                { after: 0, direct: { cast: 'ishida', mood: 'content', intent: 'sit', hold: 120 } },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' }, lens: 60 },
              line: 'Tonight she wants to hear Grandpa’s radio one last time, at home.',
              lineTranslations: {
                'te-IN': 'ఈ రాత్రి సొంత ఇంట్లో, తాతయ్య రేడియోని ఆఖరిసారి వినాలనుకుంటోంది.',
              },
              hold: 6,
            },
            {
              shot: { type: 'insert', subject: { prop: 'momiji-timetable' } },
              line: 'Arrives Aonuma 17:42 · Last bus 17:40',
              lineTranslations: { 'te-IN': 'అఓనుమా చేరేది 17:42 · ఆఖరి బస్సు 17:40' },
              hold: 6,
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' } },
              cues: [{ after: 0, direct: { cast: 'riko', mood: 'anxious', intent: 'linger' } }],
              dialogue: [
                {
                  cast: 'riko',
                  text: 'Two minutes. I’ll miss the last bus by two minutes.',
                  emotion: 'anxious',
                  translations: {
                    'te-IN': 'రెండే నిమిషాలు. రెండు నిమిషాల తేడాతో ఆఖరి బస్సు తప్పిపోతుంది.',
                  },
                },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'sato' }, side: 'right' },
              cues: [{ after: 0, direct: { cast: 'sato', mood: 'curious', intent: 'linger' } }],
              dialogue: [
                {
                  cast: 'sato',
                  text: 'Is that a radio?',
                  emotion: 'curious',
                  translations: { 'te-IN': 'అది రేడియోనా?' },
                },
                {
                  cast: 'riko',
                  text: 'Grandpa’s. I got it fixed. Grandma wants to hear it tonight.',
                  emotion: 'warm',
                  translations: {
                    'te-IN': 'తాతయ్యది. బాగు చేయించాను. ఈ రాత్రి బామ్మ దీన్ని వినాలనుకుంటోంది.',
                  },
                },
              ],
            },
            {
              // Sato says nothing. Hold on him: this is where he decides.
              shot: { type: 'portrait', subject: { cast: 'sato' }, lens: 75, aperture: 'shallow' },
              hold: 4,
              cues: [{ after: 0, direct: { cast: 'sato', mood: 'wistful', intent: 'linger' } }],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'ishida' }, lens: 40 },
              dialogue: [
                {
                  cast: 'ishida',
                  text: 'Ride in the front car. Run the moment the doors open.',
                  emotion: 'reassuring',
                  // "Car" is a railway carriage (బోగీ), not a motor car.
                  translations: { 'te-IN': 'ముందు బోగీలో ఎక్కు. తలుపులు తెరుచుకోగానే పరిగెత్తు.' },
                },
                {
                  cast: 'riko',
                  text: 'Thank you.',
                  emotion: 'warm',
                  translations: { 'te-IN': 'చాలా థాంక్స్ అండీ.' },
                },
                {
                  cast: 'ishida',
                  text: 'I missed that bus once. Forty years ago. I never went back up the hill.',
                  emotion: 'reflective',
                  translations: {
                    'te-IN':
                      'ఒకసారి నాకూ ఆ బస్సు తప్పిపోయింది. నలభై ఏళ్ళ క్రితం. మళ్ళీ ఆ కొండ పైకి ఎప్పుడూ వెళ్ళలేదు.',
                  },
                },
              ],
            },
            {
              shot: { type: 'platform' },
              waitFor: 'stopped',
              hold: 5,
              cues: [
                {
                  after: 0,
                  direct: { cast: 'riko', mood: 'curious', intent: 'watch-train', hold: 30 },
                },
                { after: 0, direct: { cast: 'sato', intent: 'watch-train', hold: 30 } },
                { after: 1, event: 'train-arrival' },
              ],
            },
            {
              // Riko hurries to the front car and gets in; Sato boards with the commuters.
              shot: { type: 'portrait', subject: { cast: 'riko' }, lens: 35 },
              line: 'Riko takes the front car.',
              lineTranslations: { 'te-IN': 'రికో ముందు బోగీ ఎక్కుతుంది.' },
              hold: 7,
              cues: [
                { after: 0, move: { cast: 'riko', to: 'front-car-door', pace: 'run' } },
                { after: 0.5, doors: 'open' },
                { after: 1, event: 'doors-open' },
              ],
            },
            {
              shot: { type: 'platform', lens: 40 },
              hold: 9,
              cues: [{ after: 7.5, doors: 'close' }],
            },
            {
              shot: { type: 'trackside', aperture: 'shallow' },
              waitFor: 'doors-closed',
              hold: 9,
              cues: [{ after: 0.5, release: true }],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · Episode 1 · Two Minutes',
        line: 'Next: The Crossing',
        lineTranslations: { 'te-IN': 'తర్వాతి భాగం: The Crossing' },
      },
    },
    {
      id: 'the-1742-e2-the-crossing',
      series: 'The 17:42',
      number: 2,
      title: 'The Crossing',
      logline:
        'On the train, Riko tells her grandmother she will miss the bus. At the Sakuragawa farm road the train is held, and Mr. Sato, across the aisle, makes a call.',
      cast: CAST,
      scenes: [
        {
          id: 'front-car',
          heading: 'INT. FRONT CAR, EVENING SERVICE — SUNSET, 17:09',
          set: {
            location: 'sakuragawa',
            offset: -760,
            timeOfDay: 'sunset',
            weather: 'clear',
            speedKmh: 55,
            clock: '17:09',
          },
          holdAt: 'sakuragawa-farm-road',
          actors: { riko: 'commuter-2', sato: 'commuter-1' },
          marks: { riko: 'front-car-seat', sato: 'front-car-seat-across' },
          beats: [
            {
              shot: { type: 'telephoto' },
              caption: 'The evening train',
              subtitle: '17:09',
              hold: 8,
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' } },
              cues: [
                {
                  after: 0,
                  direct: { cast: 'riko', mood: 'anxious', intent: 'check-phone', hold: 40 },
                },
              ],
              dialogue: [
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'Did you get it working?',
                  emotion: 'warm',
                  translations: { 'te-IN': 'రేడియో బాగయిందా, తల్లీ?' },
                },
                {
                  cast: 'riko',
                  text: 'It works. But the train’s running late. I’ll miss the bus.',
                  emotion: 'anxious',
                  translations: {
                    'te-IN': 'పని చేస్తోంది. కానీ రైలు లేటుగా నడుస్తోంది. బస్సు తప్పిపోతుంది.',
                  },
                },
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'Then come tomorrow.',
                  translations: { 'te-IN': 'అయితే రేపు రా.' },
                },
                {
                  cast: 'riko',
                  text: 'Tomorrow you won’t be there.',
                  emotion: 'vulnerable',
                  translations: { 'te-IN': 'రేపు నువ్వు అక్కడ ఉండవుగా.' },
                },
              ],
            },
            {
              // The pause before Fusae answers.
              shot: { type: 'portrait', subject: { cast: 'riko' }, lens: 70, aperture: 'shallow' },
              hold: 3,
              dialogue: [
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'Then hurry, child.',
                  emotion: 'warm',
                  translations: { 'te-IN': 'అయితే త్వరగా రా, తల్లీ.' },
                },
              ],
            },
            {
              shot: {
                type: 'orbit',
                subject: { crossing: 'sakuragawa-farm-road' },
                distance: 26,
                height: 5,
                lens: 32,
              },
              caption: 'Sakuragawa farm road',
              line: 'The train is held at the crossing. Now five minutes late.',
              lineTranslations: {
                'te-IN': 'రైలుని రైల్వే గేటు దగ్గర ఆపేశారు. ఇప్పుడు ఐదు నిమిషాలు ఆలస్యం.',
              },
              waitFor: 'stopped',
              hold: 8,
            },
            {
              shot: { type: 'portrait', subject: { cast: 'sato' }, partner: { cast: 'riko' } },
              cues: [
                {
                  after: 0,
                  direct: { cast: 'sato', mood: 'content', intent: 'check-phone', hold: 20 },
                },
              ],
              dialogue: [
                {
                  cast: 'sato',
                  text: 'Aoi? It’s Dad. The 17:40 from Aonuma. Can you wait tonight?',
                  emotion: 'warm',
                  translations: {
                    'te-IN': 'అఓయి? నాన్నని. అఓనుమా నుంచి ఐదు నలభై బస్సు. ఈ రాత్రి కాసేపు ఆగగలవా?',
                  },
                },
              ],
            },
            {
              // Riko looks up.
              shot: { type: 'portrait', subject: { cast: 'riko' }, partner: { cast: 'sato' } },
              hold: 3,
              cues: [{ after: 0, direct: { cast: 'riko', mood: 'curious', intent: 'linger' } }],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'sato' }, partner: { cast: 'riko' } },
              cues: [{ after: 0, direct: { cast: 'sato', mood: 'cheerful', intent: 'linger' } }],
              dialogue: [
                {
                  cast: 'sato',
                  text: 'My daughter drives that bus. She never waits for me.',
                  emotion: 'playful',
                  translations: {
                    'te-IN': 'ఆ బస్సు నడిపేది మా అమ్మాయే. నా కోసం మాత్రం ఎప్పుడూ ఆగదు.',
                  },
                },
              ],
            },
            {
              shot: { type: 'trackside', aperture: 'shallow' },
              hold: 9,
              cues: [{ after: 0.5, release: true }],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · Episode 2 · The Crossing',
        line: 'Next: 17:42',
        lineTranslations: { 'te-IN': 'తర్వాతి భాగం: 17:42' },
      },
    },
    {
      id: 'the-1742-e3-seventeen-forty-two',
      series: 'The 17:42',
      number: 3,
      title: '17:42',
      logline:
        'The train reaches Aonuma seven minutes after the last bus should have gone. Riko runs. The bus is still there.',
      cast: CAST,
      scenes: [
        {
          id: 'aonuma-arrival',
          heading: 'EXT. AONUMA STATION AND BUS STOP — BLUE HOUR, RAIN, 17:47',
          set: {
            location: 'aonuma',
            offset: -420,
            timeOfDay: 'dusk',
            weather: 'rain',
            speedKmh: 55,
            clock: '17:47',
          },
          stopAt: 'aonuma',
          actors: { riko: 'commuter-2', fusae: 'fusae', aoi: 'aoi' },
          marks: { riko: 'front-car-door', fusae: 'aonuma-bus-stop', aoi: 'aonuma-bus-step' },
          beats: [
            {
              shot: { type: 'establishing', aperture: 'deep' },
              caption: 'Aonuma · 17:47',
              subtitle: 'blue hour · rain',
              hold: 6,
              cues: [
                { after: 0, bus: { state: 'wait' } },
                {
                  after: 0,
                  direct: { cast: 'fusae', mood: 'content', intent: 'linger', hold: 120 },
                },
                { after: 0, direct: { cast: 'aoi', mood: 'cheerful', intent: 'linger', hold: 60 } },
              ],
            },
            {
              shot: { type: 'insert', subject: { prop: 'aonuma-clock' } },
              caption: '17:47',
              subtitle: 'The last bus was due out at 17:40',
              hold: 4,
            },
            {
              shot: { type: 'platform' },
              waitFor: 'stopped',
              hold: 4,
              cues: [{ after: 1, event: 'train-arrival' }],
            },
            {
              // The doors open and Riko runs, the radio against her chest.
              shot: { type: 'platform', lens: 40 },
              hold: 4,
              cues: [
                { after: 0, doors: 'open' },
                { after: 0.8, move: { cast: 'riko', to: 'aonuma-bus-door', pace: 'run' } },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' }, lens: 32 },
              line: 'Riko runs.',
              lineTranslations: { 'te-IN': 'రికో పరిగెడుతుంది.' },
              hold: 4,
            },
            {
              // The bus is still there: headlights on, doors open.
              shot: { type: 'insert', subject: { prop: 'aonuma-bus' } },
              line: 'The bus is still there.',
              lineTranslations: { 'te-IN': 'బస్సు ఇంకా అక్కడే ఉంది.' },
              hold: 5,
            },
            {
              shot: { type: 'portrait', subject: { cast: 'aoi' }, partner: { cast: 'riko' } },
              cues: [
                { after: 0, direct: { cast: 'aoi', mood: 'cheerful', intent: 'wave', hold: 4 } },
              ],
              dialogue: [
                {
                  cast: 'aoi',
                  text: 'You’re the girl with the radio? Dad said you’d run.',
                  emotion: 'playful',
                  translations: {
                    'te-IN':
                      'రేడియో అమ్మాయి నువ్వేనా? నువ్వు పరిగెత్తుకుంటూ వస్తావని నాన్న చెప్పారు.',
                  },
                },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' }, partner: { cast: 'fusae' } },
              cues: [{ after: 0, direct: { cast: 'riko', mood: 'cheerful', intent: 'linger' } }],
              dialogue: [
                {
                  cast: 'riko',
                  text: 'Grandma, you came down?',
                  emotion: 'excited',
                  translations: { 'te-IN': 'బామ్మా, నువ్వు కిందికి వచ్చేశావా?' },
                },
                {
                  cast: 'fusae',
                  text: 'I wasn’t going to hear it through a phone.',
                  emotion: 'warm',
                  translations: { 'te-IN': 'దాన్ని ఫోన్‌లో వింటానా ఏమిటి?' },
                },
              ],
            },
            {
              // Under the bus lights Riko turns the radio on.
              shot: {
                type: 'portrait',
                subject: { cast: 'riko' },
                partner: { cast: 'fusae' },
                framing: 'two',
              },
              line: '(Static. Then soft music.)',
              lineTranslations: { 'te-IN': '(గరగర శబ్దం. ఆ తర్వాత మెల్లని సంగీతం.)' },
              hold: 5,
              cues: [{ after: 0, direct: { cast: 'fusae', mood: 'wistful', intent: 'linger' } }],
            },
            {
              shot: {
                type: 'portrait',
                subject: { cast: 'fusae' },
                lens: 70,
                aperture: 'shallow',
              },
              cues: [{ after: 0, direct: { cast: 'fusae', mood: 'content', intent: 'linger' } }],
              dialogue: [
                {
                  cast: 'fusae',
                  text: 'That’s his station.',
                  emotion: 'reflective',
                  translations: { 'te-IN': 'ఇదే... ఆయన ఎప్పుడూ వినే స్టేషన్.' },
                },
              ],
            },
            {
              // They get on. The bus pulls away up the hill with its windows lit.
              shot: { type: 'insert', subject: { prop: 'aonuma-bus-stop' } },
              hold: 10,
              cues: [
                { after: 0.3, move: { cast: 'fusae', to: 'aonuma-bus-aboard' } },
                { after: 0.8, move: { cast: 'riko', to: 'aonuma-bus-aboard' } },
                { after: 4.2, move: { cast: 'aoi', to: 'aonuma-bus-aboard' } },
                { after: 5.5, bus: { state: 'leave' } },
              ],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · Episode 3 · 17:42',
        line: 'She waited seven minutes. Somebody asked her to.',
        lineTranslations: { 'te-IN': 'ఆమె ఏడు నిమిషాలు ఆగింది. ఎవరో ఆగమని అడిగారు.' },
      },
    },
  ],
});

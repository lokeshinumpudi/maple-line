/**
 * The 17:42 — a three-episode companion drama for the director.
 *
 * One evening service down the Maple Line reaches Aonuma at 17:42. The last village
 * bus leaves at 17:40. Haru's campaign follows the driver who endorsed that timetable;
 * this series stays on the passenger side of the same two minutes and does not use or
 * alter the campaign's characters, dialogue or saved choices.
 *
 * Casting uses characters the world already simulates. Riko is played by a Momiji
 * student in episode 1 and by an Aonuma resident in episode 3; the figures differ.
 * At Aonuma she is cast as the standing resident by the kiosk; the seated reader there
 * sits behind a shelter post that hides her from every portrait angle.
 */
const CAST = {
  riko: { name: 'Riko', note: '17. Carrying her grandmother’s repaired radio home to Aonuma.' },
  sato: { name: 'Mr. Sato', note: '44. Office commuter. Has taken this train for nine years.' },
  ishida: { name: 'Mr. Ishida', note: '70s. Reads the paper on the Momiji bench every evening.' },
  fusae: { name: 'Fusae', note: 'Riko’s grandmother, heard on the phone. Dry, unbothered.' },
  aoi: { name: 'Mrs. Hara', note: '53. Runs the kiosk at Aonuma. Closes at six.' },
  tanabe: { name: 'Mr. Tanabe', note: '47. Missed the same bus. Has written to the railway.' },
};

export const THE_1742 = Object.freeze({
  id: 'the-1742',
  title: 'The 17:42',
  japanese: '十七時四十二分',
  logline:
    'One evening train reaches Aonuma at 17:42. The last village bus leaves at 17:40. Three short episodes about the people on either side of those two minutes.',
  episodes: [
    {
      id: 'the-1742-e1-two-minutes',
      series: 'The 17:42',
      number: 1,
      title: 'Two Minutes',
      logline:
        'Riko waits at Momiji with her grandmother’s radio and learns what the printed times mean.',
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
          },
          stopAt: 'momiji',
          actors: { riko: 'commuter-2', sato: 'commuter-1', ishida: 'reader-1' },
          beats: [
            {
              shot: { type: 'establishing', aperture: 'deep' },
              caption: 'Momiji',
              subtitle: 'sunset · 16:51',
              line: 'The evening service leaves Momiji at 16:58. It reaches Aonuma at 17:42.',
              hold: 7,
              cues: [
                {
                  after: 0,
                  direct: { cast: 'riko', mood: 'anxious', intent: 'check-phone', hold: 60 },
                },
                { after: 0, direct: { cast: 'sato', mood: 'content', intent: 'linger', hold: 60 } },
                { after: 0, direct: { cast: 'ishida', mood: 'content', intent: 'sit', hold: 90 } },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' } },
              dialogue: [
                { cast: 'riko', text: 'Seventeen forty-two in. Seventeen forty out.' },
                { cast: 'riko', text: 'That isn’t a connection. That’s a race.' },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'sato' }, side: 'right' },
              dialogue: [
                { cast: 'sato', text: 'What’s in the box?' },
                {
                  cast: 'riko',
                  text: 'My grandmother’s radio. She says the new one talks too fast.',
                },
                { cast: 'sato', text: 'The bus waits, if the driver’s in a good mood.' },
                { cast: 'riko', text: 'Is he usually?' },
                { cast: 'sato', text: 'It’s a she. And no.' },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'ishida' }, lens: 40 },
              dialogue: [
                { cast: 'ishida', text: 'Ride in the front car. The bus stop is by the kiosk.' },
                { cast: 'riko', text: 'Thank you.' },
                { cast: 'ishida', text: 'Don’t thank me. I’ve never made it.' },
              ],
            },
            {
              shot: { type: 'platform' },
              line: 'Nobody on the platform looks at the timetable again.',
              waitFor: 'stopped',
              hold: 6,
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
              shot: { type: 'wheels', aperture: 'shallow' },
              hold: 9,
              cues: [
                { after: 0.5, doors: 'open' },
                { after: 1, event: 'doors-open' },
                { after: 7, doors: 'close' },
              ],
            },
            {
              shot: { type: 'window' },
              waitFor: 'doors-closed',
              hold: 3,
              dialogue: [{ cast: 'riko', text: 'Front car.' }],
            },
            {
              shot: { type: 'trackside', aperture: 'shallow' },
              hold: 10,
              cues: [{ after: 0.5, release: true }],
            },
          ],
        },
      ],
      endCard: { title: 'The 17:42 · Episode 1 · Two Minutes', line: 'Next: The Crossing' },
    },
    {
      id: 'the-1742-e2-the-crossing',
      series: 'The 17:42',
      number: 2,
      title: 'The Crossing',
      logline:
        'On the train, Riko calls her grandmother. At the Sakuragawa farm road, the arms come down.',
      cast: CAST,
      scenes: [
        {
          id: 'between-stations',
          heading: 'INT./EXT. EVENING SERVICE AND SAKURAGAWA FARM ROAD — SUNSET, 17:09',
          set: {
            location: 'sakuragawa',
            offset: -900,
            timeOfDay: 'sunset',
            weather: 'clear',
            speedKmh: 60,
          },
          stopAt: 'sakuragawa',
          beats: [
            {
              shot: { type: 'window' },
              caption: 'Between Momiji and Sakuragawa',
              subtitle: '17:09',
              dialogue: [
                { cast: 'riko', text: 'Grandma, don’t come to the stop. It’s cold.' },
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'I’m not coming for you. I’m coming for the radio.',
                },
              ],
            },
            {
              shot: { type: 'telephoto' },
              dialogue: [
                { cast: 'riko', text: 'The train gets in at 17:42. The bus goes at 17:40.' },
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'Kaneda’s girl drives it now. She waits if she sees the train.',
                },
                { cast: 'riko', text: 'And if she doesn’t see it?' },
                { cast: 'fusae', phone: true, text: 'Then you walk, and I make tea.' },
              ],
            },
            {
              shot: {
                type: 'orbit',
                subject: { crossing: 'sakuragawa-farm-road' },
                distance: 24,
                height: 5,
                lens: 32,
              },
              caption: 'Sakuragawa farm road',
              hold: 14,
            },
            {
              shot: { type: 'wheels' },
              dialogue: [
                { cast: 'riko', text: 'Why don’t they just move the bus five minutes?' },
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'The bus belongs to the town. The train belongs to the railway.',
                },
                { cast: 'fusae', phone: true, text: 'They don’t eat at the same table.' },
              ],
            },
            {
              shot: { type: 'cab' },
              dialogue: [
                {
                  cast: 'fusae',
                  phone: true,
                  text: 'Bring the radio anyway. If you miss her, it can tell me the weather.',
                },
                { cast: 'riko', text: 'It only gets one station.' },
                { cast: 'fusae', phone: true, text: 'It’s the right one.' },
              ],
            },
            {
              shot: { type: 'platform' },
              caption: 'Sakuragawa',
              subtitle: '17:14',
              waitFor: 'stopped',
              hold: 6,
            },
          ],
        },
      ],
      endCard: { title: 'The 17:42 · Episode 2 · The Crossing', line: 'Next: 17:42' },
    },
    {
      id: 'the-1742-e3-seventeen-forty-two',
      series: 'The 17:42',
      number: 3,
      title: '17:42',
      logline:
        'The train reaches Aonuma. The bus is gone. The kiosk is still open, and it starts to rain.',
      cast: CAST,
      scenes: [
        {
          id: 'aonuma-arrival',
          heading: 'EXT. AONUMA STATION — BLUE HOUR, 17:41',
          set: {
            location: 'aonuma',
            offset: -450,
            timeOfDay: 'dusk',
            weather: 'clear',
            speedKmh: 55,
          },
          stopAt: 'aonuma',
          actors: {
            riko: 'aonuma-resident-3',
            aoi: 'aonuma-resident-5',
            tanabe: 'aonuma-resident-2',
          },
          beats: [
            {
              shot: { type: 'establishing', aperture: 'deep' },
              caption: 'Aonuma',
              subtitle: 'blue hour · 17:41',
              line: 'The last village bus leaves from the kiosk side of the station.',
              hold: 7,
              cues: [
                { after: 0, direct: { cast: 'aoi', mood: 'content', intent: 'linger', hold: 120 } },
                {
                  after: 0,
                  direct: { cast: 'tanabe', mood: 'irritated', intent: 'check-phone', hold: 60 },
                },
              ],
            },
            {
              shot: { type: 'platform' },
              line: '17:42.',
              waitFor: 'stopped',
              hold: 5,
              cues: [{ after: 1, event: 'train-arrival' }],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' } },
              cues: [
                { after: 0, doors: 'open' },
                { after: 0, direct: { cast: 'riko', mood: 'anxious', intent: 'hurry', hold: 20 } },
              ],
              dialogue: [{ cast: 'riko', text: 'Was that the bus?' }],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'aoi' } },
              dialogue: [
                { cast: 'aoi', text: 'Two minutes ago. She waited one.' },
                { cast: 'riko', text: 'One.' },
                { cast: 'aoi', text: 'Last week it was none. You’re doing well.' },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'tanabe' }, side: 'left' },
              cues: [
                { after: 0, direct: { cast: 'tanabe', mood: 'tired', intent: 'sit', hold: 90 } },
              ],
              dialogue: [
                { cast: 'tanabe', text: 'I’ve written to the railway twice.' },
                { cast: 'aoi', text: 'And?' },
                { cast: 'tanabe', text: 'They wrote back that the bus isn’t the railway.' },
              ],
            },
          ],
        },
        {
          id: 'aonuma-kiosk-rain',
          heading: 'EXT. AONUMA KIOSK — BLUE HOUR, RAIN, 17:46',
          stopAt: 'aonuma',
          actors: {
            riko: 'aonuma-resident-3',
            aoi: 'aonuma-resident-5',
            tanabe: 'aonuma-resident-2',
          },
          beats: [
            {
              shot: { type: 'helicopter', distance: 90, height: 28 },
              line: 'It starts to rain.',
              hold: 8,
              cues: [
                { after: 0, weather: 'rain' },
                { after: 0.5, event: 'rain-start' },
                {
                  after: 1,
                  direct: { cast: 'riko', mood: 'wistful', intent: 'shelter', hold: 90 },
                },
                { after: 1, direct: { cast: 'tanabe', intent: 'shelter', hold: 90 } },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'aoi' }, side: 'right' },
              cues: [
                { after: 0, direct: { cast: 'aoi', mood: 'cheerful', intent: 'wave', hold: 8 } },
              ],
              dialogue: [
                { cast: 'aoi', text: 'Come under here, both of you.' },
                { cast: 'aoi', text: 'The roof is the only free thing I sell.' },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'aoi' }, lens: 70, aperture: 'shallow' },
              cues: [
                {
                  after: 0,
                  direct: { cast: 'aoi', mood: 'content', intent: 'check-phone', hold: 20 },
                },
              ],
              dialogue: [
                { cast: 'aoi', text: 'Seventeen forty-two. Seventeen forty.' },
                {
                  cast: 'aoi',
                  text: 'Write it down on the back of a receipt. Somebody reads these things.',
                },
                { cast: 'riko', text: 'Who?' },
                { cast: 'aoi', text: 'The radio, maybe.' },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'riko' } },
              cues: [
                {
                  after: 0,
                  direct: { cast: 'riko', mood: 'content', intent: 'check-phone', hold: 30 },
                },
              ],
              dialogue: [
                { cast: 'riko', text: 'Grandma? I missed it. Yes, I have the radio.' },
                { cast: 'fusae', phone: true, text: 'Then turn it on. Tell me what it says.' },
                { cast: 'riko', text: 'It says rain.' },
              ],
            },
            {
              shot: { type: 'wheels' },
              hold: 8,
              cues: [{ after: 1, doors: 'close' }],
            },
            {
              shot: { type: 'trackside', aperture: 'shallow' },
              waitFor: 'doors-closed',
              hold: 12,
              cues: [{ after: 0.5, release: true }],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · end',
        line: 'Aonuma station to Fusae’s house: 3.1 km. The rain stopped at 18:20.',
      },
    },
  ],
});

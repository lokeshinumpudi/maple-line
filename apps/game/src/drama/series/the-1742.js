/**
 * The 17:42 — a three-episode companion drama for the director.
 *
 * Meera's grandparents, a Telugu family, came to this Japanese valley forty years ago.
 * Tomorrow her Ammamma moves back to India; tonight she wants to hear Grandpa's old radio
 * one last time, at home up the hill. Meera has it, freshly repaired. The last bus up the
 * hill leaves Aonuma at 17:40; Meera's train gets in at 17:42. Her classmate Arjun rides
 * with her, and his older sister Divya drives that bus. Haru's campaign follows the driver
 * who endorsed that timetable; this series stays on the passenger side and does not use
 * or alter the campaign's characters or saves.
 *
 * Meera is the same figure in every episode: the Momiji student `commuter-2`, whose model
 * the stage (drama/drama-stage.js) moves onto the train and off it at Aonuma; Arjun is
 * `commuter-1`. Ammamma and Divya are staged people with their own models. Every key time
 * is also on screen as words (a timetable insert, captions, narration), so the story reads
 * with the sound off.
 */

/** Hand-written Hindi, spoken the way a family talks; keyed by the English line. */
const HINDI = {
  'Meera’s grandparents came to this valley forty years ago.':
    'मीरा के नाना-नानी चालीस साल पहले इस घाटी में आए थे।',
  'Tomorrow, her Ammamma moves back to India.': 'कल उसकी अम्मम्मा वापस भारत जा रही हैं।',
  'Tonight, she wants to hear Grandpa’s old radio one last time, at home.':
    'आज रात वो आख़िरी बार, अपने घर में, नाना का पुराना रेडियो सुनना चाहती हैं।',
  'The train gets in at 17:42. The last bus leaves at 17:40.':
    'ट्रेन पाँच बजकर बयालीस मिनट पर पहुँचती है। आख़िरी बस पाँच बजकर चालीस पर निकल जाती है।',
  'Two minutes. I’m going to miss it by two minutes.': 'दो मिनट। बस दो मिनट से छूट जाएगी।',
  'Meera? You’re on the late train too?': 'मीरा? तुम भी लेट वाली ट्रेन से जा रही हो?',
  'Arjun. Hi. I have to get to Aonuma tonight.': 'अर्जुन। हाय। मुझे आज रात आओनुमा पहुँचना है।',
  'What’s in the box?': 'डिब्बे में क्या है?',
  'Grandpa’s radio. I got it fixed. Ammamma wants to hear it tonight.':
    'नाना का रेडियो। ठीक करवाया है। अम्मम्मा आज रात इसे सुनना चाहती हैं।',
  'Tonight? But the last bus…': 'आज रात? लेकिन आख़िरी बस तो…',
  'I know. It leaves before the train gets in.': 'पता है। ट्रेन पहुँचने से पहले ही निकल जाती है।',
  'Sit in the front car. When the doors open, run.':
    'आगे वाले डिब्बे में बैठना। दरवाज़े खुलते ही दौड़ पड़ना।',
  'Thank you.': 'शुक्रिया।',
  'I missed that bus once. I still think about it.':
    'एक बार मेरी भी वो बस छूट गई थी। आज तक याद आती है।',
  'Front car, then. I’ll run with you.': 'तो फिर आगे वाला डिब्बा। मैं भी तुम्हारे साथ दौड़ूँगा।',
  'You don’t even live in Aonuma.': 'तुम तो आओनुमा में रहते भी नहीं।',
  'I do tonight.': 'आज रात रहता हूँ।',
  'The train leaves Momiji on time.': 'ट्रेन मोमिजी से समय पर निकलती है।',
  'On the train, Meera calls her Ammamma.': 'ट्रेन में मीरा अपनी अम्मम्मा को फ़ोन करती है।',
  'Meera? Did you fix it?': 'मीरा? ठीक हो गया?',
  'It works, Ammamma. It sounds just like before.':
    'चल रहा है, अम्मम्मा। बिल्कुल पहले जैसा बजता है।',
  'Good girl. Then I’ll see you soon.': 'शाबाश, बेटा। तो फिर जल्दी मिलते हैं।',
  'Ammamma… the train gets in after the bus leaves.':
    'अम्मम्मा… ट्रेन बस निकलने के बाद पहुँचती है।',
  'Then come tomorrow, dear.': 'तो कल आ जाना, बेटा।',
  'Tomorrow you’ll be gone.': 'कल तो आप चली जाएँगी।',
  'Then hurry, child.': 'तो फिर जल्दी आ, बच्ची।',
  'At the farm crossing, the train stops. Now it’s running late.':
    'खेतों वाले फाटक पर ट्रेन रुक जाती है। अब वो लेट हो रही है।',
  'No, no, no…': 'नहीं, नहीं, नहीं…',
  'Give me a second.': 'एक सेकंड रुको।',
  'Divya? It’s me. Are you driving the last bus tonight?':
    'दिव्या? मैं बोल रहा हूँ। आज आख़िरी बस तुम चला रही हो?',
  'Can you wait at Aonuma? Just a few minutes. Please.':
    'आओनुमा पर थोड़ा रुक सकती हो? बस कुछ मिनट। प्लीज़।',
  'Who was that?': 'कौन था?',
  'My sister. She drives the bus.': 'मेरी दीदी। वो बस चलाती है।',
  'Will she wait?': 'क्या वो रुकेगी?',
  'She never waits for me. But she might wait for you.':
    'मेरे लिए तो कभी नहीं रुकती। पर तुम्हारे लिए शायद रुक जाए।',
  'At Aonuma, a bus driver looks at the clock.': 'आओनुमा में, एक बस ड्राइवर घड़ी की ओर देखती है।',
  'Aonuma. The train is seven minutes late.': 'आओनुमा। ट्रेन सात मिनट लेट है।',
  'Meera runs.': 'मीरा दौड़ पड़ती है।',
  'The bus is still there.': 'बस अब भी वहीं खड़ी है।',
  'You must be Meera. My brother wouldn’t stop calling.':
    'तुम मीरा होगी। मेरा भाई फ़ोन पर फ़ोन किए जा रहा था।',
  'I called twice.': 'दो ही बार किया था।',
  'Five times. Get in, both of you.': 'पाँच बार। चलो, दोनों बैठ जाओ।',
  'Ammamma? You came all the way down?': 'अम्मम्मा? आप इतनी दूर नीचे तक आ गईं?',
  'I couldn’t wait at home. Is that it?': 'घर पर बैठा नहीं गया। यही है वो?',
  'It’s Grandpa’s radio.': 'नाना का रेडियो है।',
  'Meera turns the radio on.': 'मीरा रेडियो चालू करती है।',
  'That’s his station. He used to sing along.': 'यही उनका स्टेशन है। वो साथ-साथ गुनगुनाया करते थे।',
  'Then let’s listen all the way home.': 'तो फिर घर तक यही सुनते चलते हैं।',
  'She waited seven minutes. Someone asked her to.':
    'वो सात मिनट रुकी रही। किसी ने रुकने को कहा था।',
};

/** The narrator carries the setup and the turns, in few words; the same words are captions. */
const narrate = (text, te) => ({
  cast: 'narrator',
  text,
  emotion: 'warm',
  translations: { 'te-IN': te, ...(HINDI[text] ? { 'hi-IN': HINDI[text] } : {}) },
});
/** A line with its hand-written Telugu. */
const say = (cast, text, te, extra = {}) => ({
  cast,
  text,
  ...extra,
  translations: { 'te-IN': te, ...(HINDI[text] ? { 'hi-IN': HINDI[text] } : {}) },
});

const CAST = {
  narrator: { name: 'Narrator', note: 'Tells the story in a few warm words between the scenes.' },
  meera: { name: 'Meera', note: '17. Carrying Grandpa’s radio home, freshly repaired.' },
  arjun: {
    name: 'Arjun',
    note: '17. Her classmate. Quietly likes her. His sister drives the bus.',
  },
  ishida: {
    name: 'Mr. Ishida',
    note: '70s. Reads on the Momiji bench. Missed that bus once, long ago.',
  },
  ammamma: {
    name: 'Ammamma',
    note: '80. Meera’s grandmother. Moves back to India tomorrow.',
  },
  divya: { name: 'Divya', note: '24. Arjun’s older sister. Drives the last bus up the hill.' },
};

export const THE_1742 = Object.freeze({
  id: 'the-1742',
  title: 'The 17:42',
  japanese: '十七時四十二分',
  logline:
    'Tomorrow Meera’s Ammamma moves back to India. Tonight she wants to hear Grandpa’s old radio one last time, at home up the valley. The last bus up the hill leaves Aonuma at 17:40. Meera’s train gets in at 17:42.',
  // Hand-written Telugu lines a native speaker should read before a video is shared.
  review: [
    'The spelling of Aonuma (అఓనుమా) and Momiji (మొమిజి) in Telugu script.',
    'Episode 1, Meera: “రెండు నిమిషాల తేడాతో బస్సు మిస్ అయిపోతాను” mixes in the English “miss”, as teenagers talk; “తప్పిపోతుంది” is the pure-Telugu choice.',
    'Episode 2, Ammamma: “మంచి పిల్లవి” for “Good girl”.',
    'Episode 3, the radio line “(Static. Then soft music.)”: గరగర for radio static.',
  ],
  episodes: [
    {
      id: 'the-1742-e1-two-minutes',
      series: 'The 17:42',
      number: 1,
      title: 'Two Minutes',
      logline:
        'At Momiji, Meera works out she will miss the last bus up the hill by two minutes. Her classmate Arjun and an old man on the bench notice the radio she is carrying.',
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
          actors: { meera: 'commuter-2', arjun: 'commuter-1', ishida: 'reader-1' },
          beats: [
            {
              shot: { type: 'establishing', aperture: 'deep' },
              caption: 'Momiji',
              subtitle: 'sunset · 16:51',
              hold: 6,
              cues: [
                {
                  after: 0,
                  direct: { cast: 'meera', mood: 'wistful', intent: 'linger', hold: 60 },
                },
                {
                  after: 0,
                  direct: { cast: 'arjun', mood: 'content', intent: 'linger', hold: 60 },
                },
                { after: 0, direct: { cast: 'ishida', mood: 'content', intent: 'sit', hold: 120 } },
              ],
              dialogue: [
                narrate(
                  'Meera’s grandparents came to this valley forty years ago.',
                  'నలభై ఏళ్ళ క్రితం మీరా తాతయ్య, అమ్మమ్మ ఈ లోయకి వచ్చారు.',
                ),
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'meera' }, lens: 60 },
              hold: 6,
              dialogue: [
                narrate(
                  'Tomorrow, her Ammamma moves back to India.',
                  'రేపు వాళ్ళ అమ్మమ్మ మళ్ళీ ఇండియాకి వెళ్ళిపోతోంది.',
                ),
                narrate(
                  'Tonight, she wants to hear Grandpa’s old radio one last time, at home.',
                  'ఈ రాత్రి, సొంత ఇంట్లో, తాతయ్య పాత రేడియోని ఆఖరిసారి వినాలని ఆవిడ కోరిక.',
                ),
              ],
            },
            {
              shot: { type: 'insert', subject: { prop: 'momiji-timetable' } },
              hold: 6,
              dialogue: [
                narrate(
                  'The train gets in at 17:42. The last bus leaves at 17:40.',
                  'రైలు 5:42కి చేరుతుంది. ఆఖరి బస్సు 5:40కే వెళ్ళిపోతుంది.',
                ),
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'meera' } },
              cues: [{ after: 0, direct: { cast: 'meera', mood: 'anxious', intent: 'linger' } }],
              dialogue: [
                say(
                  'meera',
                  'Two minutes. I’m going to miss it by two minutes.',
                  'రెండే నిమిషాలు. రెండు నిమిషాల తేడాతో బస్సు మిస్ అయిపోతాను.',
                  { emotion: 'anxious' },
                ),
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'arjun' }, partner: { cast: 'meera' } },
              cues: [
                { after: 0, direct: { cast: 'arjun', mood: 'curious', intent: 'linger' } },
                { after: 0, direct: { cast: 'meera', mood: 'anxious', intent: 'linger' } },
              ],
              dialogue: [
                say(
                  'arjun',
                  'Meera? You’re on the late train too?',
                  'మీరా? నువ్వు కూడా ఈ లేట్ ట్రైన్‌కేనా?',
                  { emotion: 'curious' },
                ),
                say(
                  'meera',
                  'Arjun. Hi. I have to get to Aonuma tonight.',
                  'అర్జున్. హాయ్. ఈ రాత్రి నేను అఓనుమా వెళ్ళాలి.',
                ),
                say('arjun', 'What’s in the box?', 'ఆ డబ్బాలో ఏముంది?', { emotion: 'curious' }),
                say(
                  'meera',
                  'Grandpa’s radio. I got it fixed. Ammamma wants to hear it tonight.',
                  'తాతయ్య రేడియో. బాగు చేయించాను. ఈ రాత్రే అమ్మమ్మ దీన్ని వినాలనుకుంటోంది.',
                  { emotion: 'warm' },
                ),
                say('arjun', 'Tonight? But the last bus…', 'ఈ రాత్రా? కానీ ఆఖరి బస్సు…', {
                  emotion: 'anxious',
                }),
                say(
                  'meera',
                  'I know. It leaves before the train gets in.',
                  'తెలుసు. రైలు చేరకముందే అది వెళ్ళిపోతుంది.',
                  { emotion: 'tired' },
                ),
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'ishida' }, lens: 40 },
              dialogue: [
                say(
                  'ishida',
                  'Sit in the front car. When the doors open, run.',
                  // "Car" is a railway carriage (బోగీ), not a motor car.
                  'ముందు బోగీలో కూర్చో. తలుపులు తెరుచుకోగానే పరిగెత్తు.',
                  { emotion: 'reassuring' },
                ),
                say('meera', 'Thank you.', 'థాంక్యూ అండీ.', { emotion: 'warm' }),
                say(
                  'ishida',
                  'I missed that bus once. I still think about it.',
                  'ఒకసారి నాకూ ఆ బస్సు తప్పిపోయింది. ఇప్పటికీ దాని గురించి ఆలోచిస్తుంటాను.',
                  { emotion: 'reflective' },
                ),
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'arjun' }, partner: { cast: 'meera' } },
              cues: [{ after: 0, direct: { cast: 'arjun', mood: 'cheerful', intent: 'linger' } }],
              dialogue: [
                say(
                  'arjun',
                  'Front car, then. I’ll run with you.',
                  'అయితే ముందు బోగీ. నేనూ నీతో పాటు పరిగెడతాను.',
                  { emotion: 'warm' },
                ),
                say('meera', 'You don’t even live in Aonuma.', 'నువ్వు అసలు అఓనుమాలో ఉండవు కదా.', {
                  emotion: 'playful',
                }),
                say('arjun', 'I do tonight.', 'ఈ రాత్రికి ఉంటాను.', { emotion: 'playful' }),
              ],
            },
            {
              shot: { type: 'platform' },
              waitFor: 'stopped',
              hold: 5,
              cues: [
                {
                  after: 0,
                  direct: { cast: 'meera', mood: 'curious', intent: 'watch-train', hold: 30 },
                },
                { after: 0, direct: { cast: 'arjun', intent: 'watch-train', hold: 30 } },
                { after: 1, event: 'train-arrival' },
              ],
            },
            {
              // Meera and Arjun hurry to the front car and get in.
              shot: { type: 'portrait', subject: { cast: 'meera' }, lens: 35 },
              hold: 7,
              cues: [
                { after: 0, move: { cast: 'meera', to: 'front-car-door', pace: 'run' } },
                { after: 0.3, move: { cast: 'arjun', to: 'front-car-door-rear', pace: 'run' } },
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
              dialogue: [
                narrate(
                  'The train leaves Momiji on time.',
                  'రైలు మొమిజి నుంచి సమయానికే బయలుదేరుతుంది.',
                ),
              ],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · Episode 1 · Two Minutes',
        line: 'Next: The Crossing',
        lineTranslations: {
          'te-IN': 'తర్వాతి భాగం: The Crossing',
          'hi-IN': 'अगला भाग: The Crossing',
        },
      },
    },
    {
      id: 'the-1742-e2-the-crossing',
      series: 'The 17:42',
      number: 2,
      title: 'The Crossing',
      logline:
        'On the train, Meera tells her Ammamma she will miss the bus. At the Sakuragawa farm road the train is held, and Arjun calls his sister.',
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
          actors: { meera: 'commuter-2', arjun: 'commuter-1' },
          marks: { meera: 'front-car-seat', arjun: 'front-car-seat-across' },
          beats: [
            {
              shot: { type: 'telephoto' },
              caption: 'The evening train',
              subtitle: '17:09',
              hold: 8,
              dialogue: [
                narrate(
                  'On the train, Meera calls her Ammamma.',
                  'రైలులోంచి మీరా వాళ్ళ అమ్మమ్మకి ఫోన్ చేసింది.',
                ),
              ],
            },
            {
              // In the car the portraits stay wide: a seated head reads off-centre on a long lens.
              shot: { type: 'portrait', subject: { cast: 'meera' }, lens: 32 },
              cues: [
                {
                  after: 0,
                  direct: { cast: 'meera', mood: 'anxious', intent: 'check-phone', hold: 40 },
                },
              ],
              dialogue: [
                say('ammamma', 'Meera? Did you fix it?', 'మీరా? బాగు చేయించావా, తల్లీ?', {
                  phone: true,
                  emotion: 'warm',
                }),
                say(
                  'meera',
                  'It works, Ammamma. It sounds just like before.',
                  'పని చేస్తోంది అమ్మమ్మా. అచ్చం మునుపటిలాగే వినిపిస్తోంది.',
                  { emotion: 'warm' },
                ),
                say(
                  'ammamma',
                  'Good girl. Then I’ll see you soon.',
                  'మంచి పిల్లవి. అయితే కాసేపట్లో కలుద్దాం, బంగారం.',
                  { phone: true, emotion: 'warm' },
                ),
                say(
                  'meera',
                  'Ammamma… the train gets in after the bus leaves.',
                  'అమ్మమ్మా… బస్సు వెళ్ళిపోయాకే రైలు చేరుతుంది.',
                  { emotion: 'anxious' },
                ),
                say('ammamma', 'Then come tomorrow, dear.', 'అయితే రేపు రామ్మా.', {
                  phone: true,
                }),
                say('meera', 'Tomorrow you’ll be gone.', 'రేపటికి నువ్వు వెళ్ళిపోతావుగా.', {
                  emotion: 'vulnerable',
                }),
              ],
            },
            {
              // The pause before Ammamma answers.
              shot: {
                type: 'portrait',
                subject: { cast: 'meera' },
                side: 'left',
                lens: 32,
                aperture: 'shallow',
              },
              hold: 3,
              dialogue: [
                say('ammamma', 'Then hurry, child.', 'అయితే త్వరగా రా, తల్లీ.', {
                  phone: true,
                  emotion: 'warm',
                }),
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
              waitFor: 'stopped',
              hold: 8,
              dialogue: [
                narrate(
                  'At the farm crossing, the train stops. Now it’s running late.',
                  'పొలాల దగ్గర రైల్వే గేటు వద్ద రైలు ఆగిపోయింది. ఇప్పుడు ఆలస్యంగా నడుస్తోంది.',
                ),
              ],
            },
            {
              shot: {
                type: 'portrait',
                subject: { cast: 'meera' },
                partner: { cast: 'arjun' },
                lens: 32,
              },
              cues: [{ after: 0, direct: { cast: 'meera', mood: 'anxious', intent: 'linger' } }],
              dialogue: [
                say('meera', 'No, no, no…', 'అయ్యో, వద్దు, వద్దు…', { emotion: 'anxious' }),
                say('arjun', 'Give me a second.', 'ఒక్క నిమిషం ఆగు.', { emotion: 'reassuring' }),
              ],
            },
            {
              shot: {
                type: 'portrait',
                subject: { cast: 'arjun' },
                partner: { cast: 'meera' },
                lens: 32,
              },
              cues: [
                {
                  after: 0,
                  direct: { cast: 'arjun', mood: 'content', intent: 'check-phone', hold: 20 },
                },
              ],
              dialogue: [
                say(
                  'arjun',
                  'Divya? It’s me. Are you driving the last bus tonight?',
                  'దివ్యా? నేనే. ఈ రాత్రి ఆఖరి బస్సు నువ్వేనా నడిపేది?',
                ),
                say(
                  'arjun',
                  'Can you wait at Aonuma? Just a few minutes. Please.',
                  'అఓనుమాలో కాసేపు ఆగగలవా? కొన్ని నిమిషాలే. ప్లీజ్.',
                  { emotion: 'warm' },
                ),
              ],
            },
            {
              shot: {
                type: 'portrait',
                subject: { cast: 'meera' },
                partner: { cast: 'arjun' },
                lens: 32,
              },
              cues: [
                { after: 0, direct: { cast: 'meera', mood: 'curious', intent: 'linger' } },
                { after: 0, direct: { cast: 'arjun', mood: 'cheerful', intent: 'linger' } },
              ],
              dialogue: [
                say('meera', 'Who was that?', 'ఎవరు అది?', { emotion: 'curious' }),
                say('arjun', 'My sister. She drives the bus.', 'మా అక్క. తనే బస్సు నడుపుతుంది.'),
                say('meera', 'Will she wait?', 'ఆగుతుందా?', { emotion: 'curious' }),
                say(
                  'arjun',
                  'She never waits for me. But she might wait for you.',
                  'నా కోసం ఎప్పుడూ ఆగదు. కానీ నీ కోసం ఆగుతుందేమో.',
                  { emotion: 'playful' },
                ),
              ],
            },
            {
              shot: { type: 'trackside', aperture: 'shallow' },
              hold: 9,
              cues: [{ after: 0.5, release: true }],
              dialogue: [
                narrate(
                  'At Aonuma, a bus driver looks at the clock.',
                  'అఓనుమాలో ఒక బస్సు డ్రైవర్ గడియారం వైపు చూస్తోంది.',
                ),
              ],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · Episode 2 · The Crossing',
        line: 'Next: 17:42',
        lineTranslations: { 'te-IN': 'తర్వాతి భాగం: 17:42', 'hi-IN': 'अगला भाग: 17:42' },
      },
    },
    {
      id: 'the-1742-e3-seventeen-forty-two',
      series: 'The 17:42',
      number: 3,
      title: '17:42',
      logline:
        'The train reaches Aonuma seven minutes late. Meera and Arjun run. The bus is still there, and so is Ammamma.',
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
          actors: { meera: 'commuter-2', arjun: 'commuter-1', ammamma: 'ammamma', divya: 'divya' },
          marks: {
            meera: 'front-car-door',
            arjun: 'front-car-door-rear',
            ammamma: 'aonuma-bus-stop',
            divya: 'aonuma-bus-step',
          },
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
                  direct: { cast: 'ammamma', mood: 'content', intent: 'linger', hold: 120 },
                },
                {
                  after: 0,
                  direct: { cast: 'divya', mood: 'cheerful', intent: 'linger', hold: 60 },
                },
              ],
              dialogue: [
                narrate(
                  'Aonuma. The train is seven minutes late.',
                  'అఓనుమా. రైలు ఏడు నిమిషాలు ఆలస్యం.',
                ),
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
              // The doors open. Meera runs, the radio against her chest; Arjun beside her.
              shot: { type: 'platform', lens: 40 },
              hold: 4,
              cues: [
                { after: 0, doors: 'open' },
                { after: 0.8, move: { cast: 'meera', to: 'aonuma-bus-door', pace: 'run' } },
                { after: 1, move: { cast: 'arjun', to: 'aonuma-bus-side', pace: 'run' } },
              ],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'meera' }, lens: 32 },
              hold: 4,
              dialogue: [narrate('Meera runs.', 'మీరా పరిగెడుతోంది.')],
            },
            {
              // The bus is still there: headlights on, doors open.
              shot: { type: 'insert', subject: { prop: 'aonuma-bus' } },
              hold: 5,
              dialogue: [narrate('The bus is still there.', 'బస్సు ఇంకా అక్కడే ఉంది.')],
            },
            {
              shot: { type: 'portrait', subject: { cast: 'divya' }, partner: { cast: 'meera' } },
              cues: [
                { after: 0, direct: { cast: 'divya', mood: 'cheerful', intent: 'wave', hold: 4 } },
              ],
              dialogue: [
                say(
                  'divya',
                  'You must be Meera. My brother wouldn’t stop calling.',
                  'నువ్వేనా మీరా? మా తమ్ముడు ఫోన్ చేస్తూనే ఉన్నాడు.',
                  { emotion: 'playful' },
                ),
                say('arjun', 'I called twice.', 'రెండుసార్లే చేశాను.', { emotion: 'dry' }),
                say('divya', 'Five times. Get in, both of you.', 'ఐదుసార్లు. ఇద్దరూ ఎక్కండి.', {
                  emotion: 'playful',
                }),
              ],
            },
            {
              shot: {
                type: 'portrait',
                subject: { cast: 'meera' },
                partner: { cast: 'ammamma' },
              },
              cues: [{ after: 0, direct: { cast: 'meera', mood: 'cheerful', intent: 'linger' } }],
              dialogue: [
                say(
                  'meera',
                  'Ammamma? You came all the way down?',
                  'అమ్మమ్మా? ఇంత దూరం కిందికి వచ్చేశావా?',
                  { emotion: 'excited' },
                ),
                say(
                  'ammamma',
                  'I couldn’t wait at home. Is that it?',
                  'ఇంట్లో ఉండలేకపోయాను, బంగారం. అదేనా?',
                  { emotion: 'warm' },
                ),
                say('meera', 'It’s Grandpa’s radio.', 'తాతయ్య రేడియో.', { emotion: 'warm' }),
              ],
            },
            {
              // Under the bus lights Meera turns the radio on.
              shot: {
                type: 'portrait',
                subject: { cast: 'meera' },
                partner: { cast: 'ammamma' },
                framing: 'two',
              },
              line: '(Static. Then soft music.)',
              lineTranslations: {
                'te-IN': '(గరగర శబ్దం. ఆ తర్వాత మెల్లని సంగీతం.)',
                'hi-IN': '(खरखराहट। फिर धीमा संगीत।)',
              },
              hold: 5,
              cues: [{ after: 0, direct: { cast: 'ammamma', mood: 'wistful', intent: 'linger' } }],
              dialogue: [narrate('Meera turns the radio on.', 'మీరా రేడియో ఆన్ చేసింది.')],
            },
            {
              shot: {
                type: 'portrait',
                subject: { cast: 'ammamma' },
                partner: { cast: 'meera' },
                lens: 70,
                aperture: 'shallow',
              },
              cues: [{ after: 0, direct: { cast: 'ammamma', mood: 'content', intent: 'linger' } }],
              dialogue: [
                say(
                  'ammamma',
                  'That’s his station. He used to sing along.',
                  'ఇదే ఆయన స్టేషన్. దాంతో పాటు పాడుతుండేవారు.',
                  { emotion: 'reflective' },
                ),
                say(
                  'meera',
                  'Then let’s listen all the way home.',
                  'అయితే ఇంటి దాకా వింటూనే వెళ్దాం.',
                  { emotion: 'warm' },
                ),
              ],
            },
            {
              // They get on. The bus pulls away up the hill with its windows lit.
              shot: { type: 'insert', subject: { prop: 'aonuma-bus-stop' } },
              hold: 10,
              cues: [
                { after: 0.3, move: { cast: 'ammamma', to: 'aonuma-bus-aboard' } },
                { after: 0.8, move: { cast: 'meera', to: 'aonuma-bus-aboard' } },
                { after: 1.2, move: { cast: 'arjun', to: 'aonuma-bus-aboard' } },
                { after: 4.2, move: { cast: 'divya', to: 'aonuma-bus-aboard' } },
                { after: 5.5, bus: { state: 'leave' } },
              ],
              dialogue: [
                narrate(
                  'She waited seven minutes. Someone asked her to.',
                  'ఆమె ఏడు నిమిషాలు ఆగింది. ఎవరో ఆగమని అడిగారు.',
                ),
              ],
            },
          ],
        },
      ],
      endCard: {
        title: 'The 17:42 · Episode 3 · 17:42',
        line: 'She waited seven minutes. Someone asked her to.',
        lineTranslations: {
          'te-IN': 'ఆమె ఏడు నిమిషాలు ఆగింది. ఎవరో ఆగమని అడిగారు.',
          'hi-IN': 'वो सात मिनट रुकी रही। किसी ने रुकने को कहा था।',
        },
      },
    },
  ],
});

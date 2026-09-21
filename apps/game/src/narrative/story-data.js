/** Authored fiction; source context and design limits are in docs/research/JAPANESE-RAILWAY-LIFE.md. */
export const campaign = {
  id: 'the-things-we-carried',
  title: 'The Things We Carried',
  tagline: 'One railway. Sixty years. A little room for someone else’s story.',
  protagonist: {
    name: 'Haru Morita',
    age: 60,
    description:
      'A local train driver, husband, grandfather, and unreliable keeper of borrowed tools. Still working. Still curious.',
  },
  chapters: [
    {
      id: 'a-blank-side',
      title: 'A Blank Side',
      zStart: -460,
      zEnd: 1499,
    },
    {
      id: 'useful-things',
      title: 'Useful Things',
      zStart: 1500,
      zEnd: 7999,
    },
    {
      id: 'what-the-mountain-keeps',
      title: 'What the Mountain Keeps',
      zStart: 8000,
      zEnd: 14399,
    },
    {
      id: 'the-way-down',
      title: 'The Way Down',
      zStart: 14400,
      zEnd: 21199,
    },
    {
      id: 'room-on-the-tape',
      title: 'Room on the Tape',
      zStart: 21200,
      zEnd: 24000,
    },
  ],
  beats: [
    {
      id: 'the-recorder',
      chapterId: 'a-blank-side',
      z: -440,
      title: 'The timetable in his pocket',
      speaker: 'Haru',
      lines: [
        'The winter draft is folded behind my licence. I have checked the crossing at Momiji, the mountain turnround, the relief driver’s break. Yesterday I told the village radio it would work. They have asked Emi to record today’s service for the follow-up.',
        'She lays her recorder beside my flask. “Do you want the railway, or the people using it?” I say both. She turns the timetable over: Aonuma arrival 17:42; last village bus 17:40. There is no mark beside either time.',
        '“We’ll have time,” I tell her. It is something I say easily in this cab.',
      ],
      choices: [
        {
          id: 'recorder-history',
          label: 'Explain why I supported the draft.',
          response: [
            '“We stop asking the afternoon crew to make up time they haven’t got. The break is a real break.”',
            'Emi nods. “Keep that bit. Now let’s ask who has to change their day for it.”',
          ],
          memory: {
            id: 'folded-speech',
            title: 'The checked column',
            text: 'Haru has checked the train operation. He has not yet checked the trips that continue beyond the station.',
          },
        },
        {
          id: 'recorder-listen',
          label: 'Ask what she needs to find out.',
          response: [
            '“Whether someone could get home after a Saturday class in Harumi.”',
            'I reach for the departures. She stops my finger. “Home, Grandpa. Not Aonuma station.”',
          ],
          memory: {
            id: 'emi-question',
            title: 'The other half of a trip',
            text: 'Emi has asked about a Saturday connection. Haru does not yet know why the question matters to her.',
          },
        },
      ],
      delivery: 'platform',
    },
    {
      id: 'the-spanner',
      chapterId: 'a-blank-side',
      z: -120,
      title: 'An indefinite loan',
      speaker: 'Haru',
      lines: [
        'Keiko has packed a spanner with my lunch. Thirteen millimetres. A note is wrapped around it: Fumi wants this back. And ring me before you offer Saturday.',
        '“Which Saturday?” Emi asks. “Probably all of them.” I turn the spanner in my hand. Fumi lent it to me thirty-seven years ago, when I was trying to repair a bicycle before a date with Keiko.',
        'The tool has outlasted the bicycle. Keiko has kept better track of the loan than I have. I put her note somewhere I can see it.',
      ],
      choices: [],
      memory: {
        id: 'borrowed-spanner',
        title: 'Keiko’s note',
        text: 'Return Fumi’s spanner. Ring before offering Saturday. Two instructions Haru can no longer mistake for suggestions.',
      },
      delivery: 'platform',
    },
    {
      id: 'momiji-bread',
      task: {
        id: 'plan-clinic-delivery',
        kind: 'delivery-plan',
        title: 'Nao’s third crate',
        actionLabel: 'Inspect the clinic label',
        required: true,
      },
      chapterId: 'a-blank-side',
      z: 525,
      title: 'While the other train clears',
      speaker: 'Nao',
      lines: [
        'Nao sets two bread crates on the platform. A third stays by her shoe. “That one’s for the clinic kiosk. Under your new timetable it waits nearly an hour. I pay someone to meet it.”',
        'We must wait here for the opposing local. I check the signal. “The connection’s tighter,” I say. “The connection is gone,” she answers. Her mother used to leave yesterday’s bread for the early crew. Nao has heard me tell that story often.',
        'Emi waits with the recorder lowered. Nao taps the third crate. “Ask me about this one.”',
      ],
      choices: [
        {
          id: 'bread-mother',
          label: 'Ask how her mother managed the delivery.',
          response: [
            '“She drove it herself. She stopped because her wrists hurt.” Nao lifts the crate with both hands. “I’m trying not to build my business around somebody doing that for free.”',
            'I draw a box beside the clinic connection. There was room for it on the page.',
          ],
          memory: {
            id: 'bread-kindness',
            title: 'The third crate',
            text: 'An old kindness also involved work. Nao needs a paid, repeatable way to meet the clinic delivery.',
          },
        },
        {
          id: 'bread-today',
          label: 'Ask what would make the new delivery work.',
          response: [
            '“The clinic can take it at ten, if we agree it beforehand. Or I can use the road van twice a week. Tell me the real options.”',
            'Emi asks permission to record that. Nao straightens the label before she says yes.',
          ],
          memory: {
            id: 'pear-bun',
            title: 'Nao’s two options',
            text: 'A confirmed later delivery or a shared road van could work. Nao has not asked Haru to preserve every old arrangement.',
          },
        },
      ],
      delivery: 'platform',
    },
    {
      id: 'sakuragawa-water',
      chapterId: 'useful-things',
      z: 1500,
      title: 'Someone else’s morning',
      speaker: 'Haru',
      lines: [
        'Jun comes aboard with mud dried along the seam of one boot. Below the station, the irrigation pump starts. He has been there since before my alarm.',
        '“Your radio piece,” he says. “The early bus. My sister uses it after she helps Mum dress. Ten minutes earlier means I do that instead. Fine on some days. Not on pump days.” He pulls his other boot away from the clean seat.',
        'I used to think his wave from the field was meant for me. He was chasing birds. I nearly tell Emi this. Jun is still explaining Thursday.',
      ],
      choices: [
        {
          id: 'paddy-joke',
          label: 'Let him finish explaining Thursday.',
          response: [
            'There are two pump days, a neighbour who can cover one, and a sister whose own shift starts at nine. I write the days down.',
            'Jun checks them. “That’s it. Don’t write that we need rescuing.”',
          ],
          memory: {
            id: 'mistaken-wave',
            title: 'Thursday, written down',
            text: 'Jun’s household can manage some changes, but not every day. Haru records the actual limit instead of offering general sympathy.',
          },
        },
        {
          id: 'paddy-work',
          label: 'Ask whether another bus time could help.',
          response: [
            '“Later helps Mum. Earlier helps my sister’s job. There isn’t one time that does both.” He looks at my pencil. “Put that down too.”',
            'The pump settles into a steady note beneath us. Emi records his answer before the sound.',
          ],
          memory: {
            id: 'pump-rhythm',
            title: 'Two incompatible times',
            text: 'An earlier departure and a later one solve different problems. The draft needs to show who still requires another arrangement.',
          },
        },
      ],
      delivery: 'platform',
    },
    {
      id: 'kawasemi-lunch',
      chapterId: 'useful-things',
      z: 3100,
      title: 'The hospital is not at the station',
      speaker: 'Haru',
      lines: [
        'Mr. Endo unfolds a hospital letter, keeping the printed details facing him. He wants to know whether the connecting bus will wait. I know the train arrival. I do not know the answer.',
        '“Shall I ring the transport desk?” Emi asks. He agrees. While she waits, he tells me he used to wash dishes at that hospital. I knew his seat for twenty years and imagined an office.',
        'We can ask about a protected connection. We cannot promise one from this platform. I give him the revised arrival to take to the desk, and he checks that I have written the return as well.',
      ],
      choices: [],
      memory: {
        id: 'endo-name',
        title: 'The return as well',
        text: 'Mr. Endo asks about both directions of his hospital trip. His appointment details remain his business; the connection is ours to clarify.',
      },
      delivery: 'platform',
    },
    {
      id: 'aonuma-fumi',
      chapterId: 'useful-things',
      z: 4700,
      title: 'The person who does the extra trip',
      speaker: 'Fumi',
      lines: [
        'Fumi wipes bicycle grease from her thumb, then nods at the spanner in my hand. “Still the right size,” she says. Then she sees the folded timetable. “Keiko says you’ve put her car in the margins again.”',
        '“I haven’t put her anywhere.” Fumi holds my gaze. “Exactly.” Emi stops the recorder without being asked. A train door closes farther down the platform.',
        'Fumi looks at the spanner again. “You borrowed that to see Keiko. The chain broke, she waited, and somehow she became the person who was good at waiting. Is that in your programme?”',
      ],
      choices: [
        {
          id: 'fumi-truth',
          label: 'Admit I assumed Keiko could do the lifts.',
          response: [
            '“I thought she could cover the awkward days.” It sounds worse said beside Fumi’s workshop than it did beside the roster.',
            '“Ask her which days are hers,” Fumi says. She clears a place on the bench for the spanner. I am still holding it.',
          ],
          memory: {
            id: 'bicycle-bell',
            title: 'What Haru assumed',
            text: 'Haru admits that his workable plan depended on Keiko’s unasked-for car trips. Returning the tool cannot return those hours.',
          },
        },
        {
          id: 'fumi-account',
          label: 'Ask what Keiko had planned for Saturday.',
          response: [
            '“A firing with the other potters. She booked it before your draft existed.” Fumi lifts the next bicycle onto the stand.',
            '“Don’t make me speak for her. Ring.” I put the phone beside the timetable instead of back in my pocket.',
          ],
          memory: {
            id: 'loan-closed',
            title: 'The booked firing',
            text: 'Keiko already has a Saturday commitment. Fumi refuses to negotiate it on her behalf.',
          },
        },
      ],
      delivery: 'platform',
      task: {
        id: 'return-spanner',
        title: 'Return Fumi’s spanner',
        actionLabel: 'Set the spanner on Fumi’s bench',
        required: true,
      },
    },
    {
      id: 'bridge-silence',
      chapterId: 'useful-things',
      z: 6250,
      title: 'A clear section',
      speaker: 'Haru',
      lines: [
        'The wheels change their note as the valley opens underneath. Emi braces the recorder on her knees. I keep my attention on the rail and the permitted speed.',
        '“Was it different when you first drove here?” she asks. The bridge looks smaller from a cab than it does in a photograph. There is less room in your head for the view.',
        'I had wanted this stretch for the programme: proof that the line was worth keeping. She has heard that argument. She waits for me to answer her question.',
      ],
      choices: [
        {
          id: 'bridge-explain',
          label: 'Tell her what the first crossing felt like.',
          response: [
            '“I trusted the inspection. My stomach didn’t. I watched the rail and did the work.”',
            '“You can keep being good at this,” she says, “and still have missed something on the back of the timetable.”',
          ],
          memory: {
            id: 'bridge-breath',
            title: 'The rail ahead',
            text: 'Haru’s driving skill and his mistaken endorsement can both be true. Neither needs to erase the other.',
          },
        },
        {
          id: 'bridge-listen',
          label: 'Let the crossing speak for a moment.',
          response: [
            'Emi records eight seconds of wheels and wind. I do not add the speech I had prepared.',
            'When the far bank comes near, she says, “I’m keeping that. I’m keeping Nao too.”',
          ],
          memory: {
            id: 'eight-seconds',
            title: 'Eight seconds, and Nao',
            text: 'The beautiful crossing stays in the programme. It no longer replaces the people who have to arrange their days around it.',
          },
        },
      ],
      delivery: 'rolling',
    },
    {
      id: 'hinoki-furniture',
      chapterId: 'what-the-mountain-keeps',
      z: 8000,
      title: 'The gap on the roster',
      speaker: 'Haru',
      lines: [
        'A message from the depot arrives as Yuta’s furniture parcels are checked. The relief driver cannot cover next Saturday. Her father has a hospital visit. Would I take the late duty?',
        'My thumb reaches Reply before I have read the last line. Emi sees it. “You said you’d ring Grandma.” I say I am only looking. We both know the shape of that pause.',
        'Yuta asks which van can carry a rejected parcel if it misses the train. I send the depot a different message: I need to check a commitment first. Please ask the next person on the cover list.',
      ],
      choices: [],
      memory: {
        id: 'repair-sign',
        title: 'An unanswered request',
        text: 'Haru asks for time before accepting another shift. The roster still has a gap; the game does not pretend someone else’s obligation has vanished.',
      },
      delivery: 'platform',
    },
    {
      id: 'kiri-missed-recital',
      chapterId: 'what-the-mountain-keeps',
      z: 9600,
      title: 'The empty chair was not empty for everyone',
      speaker: 'Haru',
      lines: [
        'The roster message makes Emi ask about a concert programme in my notebook. Her father’s name is circled. I missed it for an extra shift. There was no emergency; a colleague asked, and I said yes.',
        '“You always tell me you regret it,” she says. “Did you tell Dad?” I say he knows. She looks down at the circled name. It is not the same answer.',
        'I remember being thanked at the depot that night. At home, Keiko had left my dinner covered. For years I have told the story as though regret was the thing I did next.',
      ],
      choices: [
        {
          id: 'recital-own',
          label: 'Say what I chose, without defending it.',
          response: [
            '“I liked being the one they could rely on. I let him be the one who could wait.”',
            'Emi shuts the notebook gently. “Ask him what he wants now. It might not be an apology about a concert.”',
          ],
          memory: {
            id: 'circled-name',
            title: 'A choice, not a shift',
            text: 'Haru names why he volunteered. He has not yet heard what his son wants from their relationship today.',
          },
        },
        {
          id: 'recital-ask',
          label: 'Ask what her father remembers.',
          response: [
            '“Grandma arrived in her clay-covered apron. He thought she’d come straight through the audience from the kiln.” Emi smiles, then stops. “He wanted you there as well.”',
            'I have been measuring the evening by my absence. Keiko was doing something in it.',
          ],
          memory: {
            id: 'clay-apron',
            title: 'The apron in the audience',
            text: 'Keiko made a trip, left work, and took a seat. Haru’s regret has often obscured the work she actually did.',
          },
        },
      ],
      delivery: 'platform',
      callbacks: [
        {
          beatId: 'the-recorder',
          choiceId: 'recorder-history',
          lines: [
            'The crew’s protected break still matters; I cannot use that true thing to explain every choice I have made.',
          ],
        },
        {
          beatId: 'aonuma-fumi',
          choiceId: 'fumi-account',
          lines: ['Fumi’s words return: Keiko booked the firing before my draft existed.'],
        },
      ],
    },
    {
      id: 'tunnel-light',
      chapterId: 'what-the-mountain-keeps',
      z: 11500,
      title: 'What the microphone keeps',
      speaker: 'Emi',
      lines: [
        'The tunnel gathers the wheel noise into one long note. In the glass I can see Grandpa watching the signal ahead. I replay Nao’s answer quietly through one earpiece.',
        'I have trimmed the part about the road van. Her complaint sounds sharper now. Grandpa notices my face and asks. When I tell him, he says, “She gave you two options.”',
        'I restore the missing sentence. It weakens the point I wanted to make. It also puts Nao back in charge of what she said. At the tunnel mouth I stop editing and listen to the sound change.',
      ],
      choices: [],
      memory: {
        id: 'window-faces',
        title: 'An uncut answer',
        text: 'Emi restores Nao’s alternative instead of making her sound opposed to the railway. The recording must leave room for a qualified opinion.',
      },
      delivery: 'rolling',
    },
    {
      id: 'yukihara-scaffolding',
      chapterId: 'what-the-mountain-keeps',
      z: 12800,
      title: 'The clear sky is not clearance',
      speaker: 'Mika',
      lines: [
        'At Yukihara, meltwater drops from the shelter in a steady line. The sky has cleared. Mika asks whether that means the next service will run. I say the slope inspection decides that, not the sky.',
        '“Then say that on the notice,” she answers. “We tell customers ‘probably’ because we don’t want them to cancel. Then somebody has to drive down for them.” She takes Nao’s bread inside before the paper bags get damp.',
        'Emi asks to record her. “Once I’ve moved this tray,” Mika says. We wait. The inspection message has not arrived yet.',
      ],
      choices: [
        {
          id: 'cafe-old-days',
          label: 'Tell her about an old winter supply run.',
          response: [
            '“We brought biscuits up after a long closure.” Mika knows the story. “And when you couldn’t?”',
            'I remember a neighbour’s van, and the road being closed as well. I cross out ‘replacement guaranteed’ in my own notes.',
          ],
          memory: {
            id: 'small-biscuits',
            title: 'No guaranteed replacement',
            text: 'Haru stops treating a remembered successful rescue as a service plan. The notice must say what is confirmed and what is still unknown.',
          },
        },
        {
          id: 'cafe-next-summer',
          label: 'Ask what she needs on the next notice.',
          response: [
            '“Inspection pending. Update time. Whether there’s an actual replacement, and where it stops. I can work with bad news if it’s true.”',
            'Emi reads the wording back. Mika corrects one word, then gives permission to use it.',
          ],
          memory: {
            id: 'lake-bench',
            title: 'Mika’s notice',
            text: 'Confirmed information, an update time, and an honest account of replacement transport. Mika can decide for her café once she has those.',
          },
        },
      ],
      delivery: 'platform',
    },
    {
      id: 'hoshimi-emi-plan',
      chapterId: 'the-way-down',
      z: 14400,
      title: 'Two minutes after the bus',
      speaker: 'Emi',
      lines: [
        '“The Saturday class is mine,” Emi says. “Sound recording, in Harumi. I sent the application. Under this draft I get to Aonuma at 17:42. The last village bus leaves at 17:40.”',
        'I start to say I could fetch her. The relief request is still on my phone. She sees me notice it. “Grandma could” is the next sentence, waiting in my mouth. I do not say it.',
        '“I can stay with a friend some weeks. There may be another bus route. I’m working it out,” she says. “I didn’t tell you because you’d either solve it without asking me, or tell everyone I was leaving.”',
      ],
      choices: [
        {
          id: 'emi-apology',
          label: 'Apologize for treating her plans as mine to settle.',
          response: [
            '“I’ve offered your time to the station group. I’ve offered your grandmother’s car to my timetable. I’m sorry.”',
            'Emi nods once. “Ask what I’ve already tried.” She opens the application, not the recorder.',
          ],
          memory: {
            id: 'application',
            title: 'What Emi has tried',
            text: 'Haru makes space for Emi’s existing work on her own future. An apology does not itself create a bus connection.',
          },
        },
        {
          id: 'emi-curiosity',
          label: 'Ask about the course and her alternatives.',
          response: [
            'She shows me an assignment: record the same place from three positions. “It changes what you think happened,” she says.',
            'We compare the later road service and a stay with her friend. Neither is as simple as my first answer would have been.',
          ],
          memory: {
            id: 'sound-course',
            title: 'Three listening positions',
            text: 'Emi wants to learn a craft, not merely get away. She and Haru examine alternatives without pretending they cost nothing.',
          },
        },
      ],
      delivery: 'platform',
      callbacks: [
        {
          beatId: 'the-recorder',
          choiceId: 'recorder-listen',
          lines: [
            'This was the Saturday journey Emi asked about before we left; I wish I had asked one question more.',
          ],
        },
      ],
    },
    {
      id: 'shirakaba-call',
      chapterId: 'the-way-down',
      z: 16000,
      title: 'Keiko had somewhere to go',
      speaker: 'Haru',
      lines: [
        'Keiko answers with the studio door banging behind her. “I’ve got clay on my hands. Is this about Saturday?” I tell her about the missed connection, then say I thought she could cover the difficult weeks.',
        '“I booked a shared firing. I’ve paid for my shelf.” I say she could have told me it was too much. “I’m telling you I had somewhere to go, Haru. Not that I couldn’t manage another trip.”',
        'Emi turns away to give us privacy. I ask what time Keiko needs the car. She tells me. I write it on the front of the timetable, beside my own duty.',
      ],
      choices: [],
      memory: {
        id: 'spring-onions',
        title: 'Keiko’s Saturday',
        text: 'A booked kiln shelf and the time she needs the car. Her work belongs on the plan before anybody calls her available.',
      },
      delivery: 'platform',
      callbacks: [
        {
          beatId: 'aonuma-fumi',
          choiceId: 'fumi-truth',
          lines: ['I have admitted the assumption to Fumi; saying it to Keiko takes longer.'],
        },
        {
          beatId: 'kiri-missed-recital',
          choiceId: 'recital-ask',
          lines: ['For a moment I see the clay-covered apron in the audience again.'],
        },
      ],
    },
    {
      id: 'akane-notebook',
      chapterId: 'the-way-down',
      z: 17600,
      title: 'Ask again, properly',
      speaker: 'Emi',
      lines: [
        'At Akane I ring Nao back and play her the passage I cut. Grandpa stands far enough away that she can answer me without answering him. I explain what I removed.',
        '“Put the van back,” she says. “And don’t say I want the old timetable. I want an answer before I renew my delivery contract.” I ask about using her name. “The bakery’s name. The contract date can stay out.”',
        'There is more to do than choose the nicest sounds. Grandpa unfolds the draft on a bench. We need somewhere to put the corrections without pretending they are all ours.',
      ],
      choices: [
        {
          id: 'notebook-revise',
          label: 'Keep Haru’s draft and mark each correction by its source.',
          response: [
            'Nao: delivery decision. Mr. Endo: outward and return connection. Keiko: Saturday already booked.',
            '“Leave my endorsement at the top,” Grandpa says. “They should see what I’m changing.”',
          ],
          memory: {
            id: 'green-ink',
            title: 'A draft with names beside the corrections',
            text: 'Haru’s endorsement remains visible, with specific corrections and their sources. Permission to quote is recorded separately from private details.',
          },
        },
        {
          id: 'notebook-new-page',
          label: 'Start a shared proposal on a new page.',
          response: [
            'We write our names at the top, then leave space for people who have not agreed yet. Grandpa draws a line through the word unanimous.',
            '“We could send both,” I say. “Your correction, and this.” He leaves the old sheet beside the new one.',
          ],
          memory: {
            id: 'blank-page',
            title: 'A page with room for disagreement',
            text: 'Emi begins a joint proposal. Agreement is asked for, not assumed; the old endorsement does not disappear into a fresh document.',
          },
        },
      ],
      delivery: 'platform',
      callbacks: [
        {
          beatId: 'momiji-bread',
          choiceId: 'bread-today',
          lines: [
            'Nao’s two workable options were in our notes already; the edit had made her sound less practical than she was.',
          ],
        },
        {
          beatId: 'sakuragawa-water',
          choiceId: 'paddy-work',
          lines: [
            'Jun’s two incompatible times stay on the page; we have not made them agree by choosing nicer words.',
          ],
        },
      ],
    },
    {
      id: 'tanada-hands',
      chapterId: 'the-way-down',
      z: 19300,
      title: 'A bus is an answer if it works',
      speaker: 'Haru',
      lines: [
        'Two growers at Tanada ask about the road option. For them, a stop nearer the packing shed would save carrying boxes up to this platform. One prefers the train; the other cares about the first market arrival.',
        'I show them our marked sheet. They ask about the return, the box space, and whether booking requires a phone call the day before. We do not have all three answers. Emi leaves blank lines instead of filling them with ‘flexible’.',
        'A passenger moves her bag so the growers can sit. I used to call that the whole story of the line. Today it is one true part of it.',
      ],
      choices: [],
      memory: {
        id: 'free-seat',
        title: 'Three blanks',
        text: 'Return time, room for boxes, and booking arrangements still need confirmation. A useful road connection belongs in the proposal without being treated as defeat.',
      },
      delivery: 'platform',
    },
    {
      id: 'minato-message',
      chapterId: 'room-on-the-tape',
      z: 21200,
      title: 'What can change today',
      speaker: 'Haru',
      lines: [
        'At Minato, the transport desk replies. They can bring a 17:50 bus connection on selected Saturdays to the trial review: eight minutes after the 17:42 train. They cannot promise daily service. The railway crew’s break stays protected.',
        'There is enough here to correct what I said on the radio, not enough to announce that we have fixed it. Emi lays out a connection sheet: 17:50 proposed; operator approval pending. The old 17:40 sheet is still on the board.',
        'My son messages about dinner. I have talked to his daughter all day about an evening I missed years ago. I still have not asked him about this evening.',
      ],
      choices: [
        {
          id: 'son-message',
          label: 'Tell him I want to hear what he needs now.',
          response: [
            '“Not a speech about the concert,” he replies. “Can you come to Emi’s open day with us? I can’t do both trips.”',
            'I check the date before I answer. Then I tell the depot I am not available for that extra duty.',
          ],
          memory: {
            id: 'dinner-message',
            title: 'A date checked before a promise',
            text: 'Haru commits to Emi’s open day after checking the date and declines the conflicting extra shift. The depot must arrange cover; Keiko is not silently substituted.',
          },
        },
        {
          id: 'son-in-person',
          label: 'Ask him to stay after dinner and talk.',
          response: [
            '“All right,” he says. “But don’t spend it explaining the roster.”',
            'I put the phone down. The extra-duty request is still unanswered. I decline it before I can use it as tonight’s explanation.',
          ],
          memory: {
            id: 'proper-tea',
            title: 'An evening kept free',
            text: 'Haru keeps the evening for his son and declines the extra duty. What his son will say remains his to say.',
          },
        },
      ],
      delivery: 'platform',
      task: {
        id: 'amend-connection',
        title: 'Correct the connection sheet',
        actionLabel: 'Pin the corrected connection sheet',
        required: true,
      },
    },
    {
      id: 'harumi-broadcast',
      chapterId: 'room-on-the-tape',
      z: 23300,
      title: 'The correction',
      speaker: 'Emi',
      lines: [
        'At Harumi, the radio volunteer asks what our piece is called. Grandpa looks at his old introduction. He had described a timetable that worked. I have a recording full of people explaining the rest of it.',
        'We can lead with his correction, or with the joint proposal and the voices that changed it. Neither version gets to say everybody agrees. Nao has approved her passage. We leave the hospital letter and Grandma’s private call out.',
        'The transport desk’s trial review is a next step, not a result. Grandpa takes off his cap while I check the levels.',
      ],
      choices: [
        {
          id: 'broadcast-voices',
          label: 'Open with Haru correcting his public endorsement.',
          response: [
            '“I said the winter draft worked. I checked the railway duties and missed the connections beyond our stations. Here is what I need to correct.” He does not start again when his voice catches.',
            'We send that introduction with the approved voices and the marked draft. The radio volunteer confirms receipt; the review still has to decide.',
          ],
          memory: {
            id: 'recording-voices',
            title: 'A public correction',
            text: 'Haru names his own mistake on the record. Approved voices and specific unresolved connections accompany his corrected endorsement into the trial review.',
          },
        },
        {
          id: 'broadcast-wheels',
          label: 'Open with the jointly authored connection proposal.',
          response: [
            'Emi reads the first question. Haru gives the railway constraint. Nao’s approved answer keeps its road-van option. The piece names the two of them as authors, without absorbing everyone else into “we”.',
            'We send the proposal, the recording, and Haru’s separate written correction. The radio volunteer confirms receipt; the review still has to decide.',
          ],
          memory: {
            id: 'recording-wheels',
            title: 'A shared proposal, with a separate correction',
            text: 'Haru and Emi share authorship of the proposal. Haru remains personally responsible for correcting his earlier endorsement; other voices retain their qualifications.',
          },
        },
      ],
      delivery: 'platform',
      callbacks: [
        {
          beatId: 'akane-notebook',
          choiceId: 'notebook-revise',
          lines: [
            'We keep the marked original beside the microphone, with Haru’s endorsement still at the top.',
          ],
        },
        {
          beatId: 'akane-notebook',
          choiceId: 'notebook-new-page',
          lines: [
            'The new page has room for names, but we add only the people who actually agreed.',
          ],
        },
        {
          beatId: 'bridge-silence',
          choiceId: 'bridge-listen',
          lines: [
            'The eight seconds of bridge sound remain; they no longer have to carry the argument alone.',
          ],
        },
      ],
    },
    {
      id: 'the-return-ticket',
      chapterId: 'room-on-the-tape',
      z: 23800,
      title: 'Before another promise',
      speaker: 'Haru',
      lines: [
        'The duty finishes with a brake check, a cab left ready, and a note for the next crew. The winter draft goes into my bag with the corrections still visible. No one has approved a new timetable while we have been talking.',
        'Emi asks whether I want to hear the finished piece again. “Tomorrow,” I say. “Tell me about the assignment with three positions.” She begins with a recording she made badly and wants to try again.',
        'On my phone, Keiko’s firing remains in the calendar. My son is expecting us. I can leave those plans where they are.',
      ],
      choices: [
        {
          id: 'ending-together',
          label: 'Ask Emi to choose our next outing.',
          response: [
            '“A recording trip,” she says. “We get off the train.” I ask when she wants to go before opening the roster.',
            'There is still the review meeting, and dinner, and a conversation with my son. For once I do not offer to fit them around everything else.',
          ],
          memory: {
            id: 'next-saturday',
            title: 'A plan asked for, not assigned',
            text: 'Emi will choose the place and date of their next outing. Haru asks before reserving anybody’s time.',
          },
        },
        {
          id: 'ending-her-trip',
          label: 'Ask to visit the sound course with her.',
          response: [
            '“If I get in,” she says. “And you have to sit through the bit where I don’t know what I’m doing.”',
            '“I can manage that,” I say. Then I check the open-day date with her, instead of trusting that I will remember.',
          ],
          memory: {
            id: 'future-ticket',
            title: 'A seat for Haru',
            text: 'Haru asks to be present while Emi learns. The family date is checked explicitly, not left to become another story about an empty chair.',
          },
        },
      ],
      delivery: 'platform',
      callbacks: [
        {
          beatId: 'harumi-broadcast',
          choiceId: 'broadcast-voices',
          lines: [
            'My correction is now on record; the people hearing it may still disagree with me.',
          ],
        },
        {
          beatId: 'harumi-broadcast',
          choiceId: 'broadcast-wheels',
          lines: ['The proposal carries Emi’s name beside mine, and my correction remains my own.'],
        },
        {
          beatId: 'minato-message',
          choiceId: 'son-message',
          lines: [
            'The open-day date is in the calendar, and the depot knows I will not take that shift.',
          ],
        },
        {
          beatId: 'minato-message',
          choiceId: 'son-in-person',
          lines: [
            'My son has asked for an evening without a roster explanation; I mean to give him one.',
          ],
        },
      ],
    },
  ],
};

export default campaign;

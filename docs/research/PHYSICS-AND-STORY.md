# Railway physics serving the story

The longitudinal driving model includes actuator response, grade force, speed-dependent resistance, weather adhesion, door interlocks, and station/terminal braking. It does not simulate a full wheel/rail contact model, derailment, or suspension rigid bodies.

The Railway Technical Research Institute describes reduced wheel/rail adhesion in rain and snow and the limits this places on braking. This supports the direction of the game’s weather effect, not its numeric tuning: [RTRI brake research](https://www.rtri.or.jp/eng/rd/seika/2018/2018/04_22.html), [RTRI engineer’s braking-system explanation](https://www.ejrcf.or.jp/jrtr/jrtr20/F52_Tech.html).

`simulation/operating-rules.js` defines fictional route limits: 25 km/h through Momiji’s passing loop and the valley bridge, 35 km/h through the tunnel, and 30 km/h in the mountain section. Automatic driving anticipates these zones using a braking envelope that depends on weather and grade. Manual driving remains under the player’s control; local overspeed exposure is recorded instead of imposing a sudden speed clamp. These speeds are game design values, not copied operating instructions for a real Japanese railway.

The tests drive both directions toward the bridge in rain and check entry at no more than 25.5 km/h. Other tests verify earlier wet/downhill anticipation and manual overspeed accounting. Existing stop tests cover clear, rain, and snow on level, uphill, and downhill track.

Bridge and tunnel narration now uses rolling delivery: the player can keep driving while reading or listening. The next stopped story scene still supplies an automatic braking target. The game no longer requires a narrative stop in the tunnel simply to present a paragraph.

Momiji’s passenger duty observes actual door opening and closure and blocks movement until the passing train has cleared. Task waits suspend when the page is hidden or explicitly paused. The separate passing train and its rails share a geometric path; this does not yet provide a network-wide signalling simulation.

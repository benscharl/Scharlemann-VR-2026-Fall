import { ControllerBeam } from "../render/core/controllerInput.js";
import * as cg from "../render/core/cg.js";
import { Structure } from "../render/core/structure.js";
import { AIQuery } from "../util/aiquery.js";

const NUMBER_OF_MARKS = 40;
const NOTCH       = 2 * Math.PI / NUMBER_OF_MARKS;
const TIME_LIMIT = 90;
const PENALTY = 5;
const MIN_GAP = 5;

const HAPTIC_MIN = .05;
const HAPTIC_MAX = .7;
const A_BUTTON    = 4;
const B_BUTTON    = 5;
const HINT_COST   = 10;

// Required turn direction for each number, like a real safe:
// -1 = RIGHT (clockwise), +1 = LEFT (counterclockwise).
const DIRECTION = [-1, 1, -1];

const ORDINAL = ['1st', '2nd', '3rd'];

const STATUS = [
   'Turn RIGHT to the 1st number\nand press A.',
   'Turn LEFT to the 2nd number\nand press A.',
   'Turn RIGHT to the 3rd number\nand press A.',
];

const INTRO_TEXT = `\
CRACK THE SAFE

Open the safe within ${TIME_LIMIT} seconds.

Aim the RIGHT controller at the dial,
hold the trigger and move to turn it.
Turn RIGHT to the 1st number, LEFT to the
2nd, RIGHT to the 3rd. Press A to lock in.

Stronger clicks = closer, double click = on it.
Turning the wrong way only gives dull clicks.
Wrong number: -${PENALTY} s, start over.
Press B for a hint from your contact (-${HINT_COST} s).

Press A to start.`;

const PLAYING_TEXT = `\
CRACK THE SAFE

RIGHT - LEFT - RIGHT. Press A to lock in.

Stronger clicks = closer.
Double click = right number.
Dull clicks = wrong direction.
Wrong number = -${PENALTY} s, start over.
B = hint from your contact (-${HINT_COST} s)
`;


// Rules every contact follows. Each contact's personality is appended to these.
const HINT_RULES =
   "You are one of the player's inside contacts in a VR safe-cracking game. " +
   "You whisper one hint about the next number of the safe combination. " +
   "Rephrase ONLY the fact you are given. Never add other facts, never guess the exact number. " +
   "Reply with one plain-text sentence of at most 15 words. ";

const CONTACTS = [
   { name: 'Roxy', personality:
      "Your name is Roxy and you are sassy: teasing, smug and theatrical. " +
      "You act like the player should have figured this out ages ago." },
   { name: 'Gus', personality:
      "Your name is Gus and you are completely deadpan: flat, dry and unimpressed. " +
      "No exclamation marks, no excitement, as if reading a grocery list." },
   { name: 'Zip', personality:
      "Your name is Zip and you are in a huge hurry: breathless, clipped sentence fragments, " +
      "about 8 words, because you have to hang up right now." },
];

// Fisher-Yates shuffle, so each game assigns the contacts to different numbers.
const shuffled = arr => {
   arr = arr.slice();
   for (let i = arr.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
   }
   return arr;
};

const textCache = {};
const setText = (name, str) => {
   str = str || ' ';
   if (textCache[name] !== str) {
      clay.defineTextMesh(name, str);
      textCache[name] = str;
   }
};

const now = () => Date.now() / 1000;
const mod = (a, n) => ((a % n) + n) % n;
const circDist = (a, b) => Math.min(mod(a - b, NUMBER_OF_MARKS), mod(b - a, NUMBER_OF_MARKS));
const fmtTime = s => {
   s = Math.max(0, Math.ceil(s));
   return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};
const isAPressed = () => !!clientState.button(clientID, 'right', A_BUTTON);
const isBPressed = () => !!clientState.button(clientID, 'right', B_BUTTON);
const dirName = dir => dir < 0 ? 'RIGHT' : 'LEFT';

// Synthesized dial sounds (Web Audio, so no sound files are needed).
// The context is kept on window so that scene reloads reuse it.
const getAudio = () => {
   if (!window.hw4Audio) {
      let ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 40 ms of fast-decaying noise. Band-pass filtered, it sounds like a mechanical click.
      let n = Math.floor(ctx.sampleRate * .04);
      let noise = ctx.createBuffer(1, n, ctx.sampleRate);
      let data = noise.getChannelData(0);
      for (let i = 0; i < n; i++)
         data[i] = (2 * Math.random() - 1) * Math.exp(-i / (n * .08));
      window.hw4Audio = { ctx, noise };
   }
   return window.hw4Audio;
};

// Higher freq = brighter click, lower freq = duller thud.
const sound = (freq, volume, delay = 0) => {
   let { ctx, noise } = getAudio();
   if (ctx.state == 'suspended') ctx.resume();
   let src = ctx.createBufferSource();
   let filter = ctx.createBiquadFilter();
   let gain = ctx.createGain();
   src.buffer = noise;
   filter.type = 'bandpass';
   filter.frequency.value = freq;
   filter.Q.value = 4;
   gain.gain.value = volume;
   src.connect(filter).connect(gain).connect(ctx.destination);
   src.start(ctx.currentTime + delay);
};

export const init = async model => {
   let beamR = new ControllerBeam(model, 'right');

   let safe = model.add().move(0, 1.3, 0);
   safe.add('cube').move(-.27,    0, -.17).scale(.02, .47, .17).color(.25, .25, .28);
   safe.add('cube').move( .27,    0, -.17).scale(.02, .47, .17).color(.25, .25, .28);
   safe.add('cube').move(   0,  .47, -.17).scale(.29, .02, .17).color(.25, .25, .28);
   safe.add('cube').move(   0, -.47, -.17).scale(.29, .02, .17).color(.25, .25, .28);
   safe.add('cube').move(   0,    0, -.33).scale(.29, .47, .01).color(.15, .15, .17);
   //gold bars
   safe.add('cube').move(   0, -.40, -.18).scale(.08, .03, .05).color(1, .8, .1);
   safe.add('cube').move(-.03, -.34, -.18).scale(.08, .03, .05).color(1, .8, .1);

   let hinge = model.add().move(-.25, 1.3, .02);
   let door = hinge.add().move(.25, 0, 0);
   door.add('cube').scale(.25, .45, .02).color(.45, .45, .5);

   let dial_hub = door.add().move(0, .1, .02);
   let face = dial_hub.add();
   let faceDisk = face.add('tubeZ').scale(.08, .08, .015).color(.3, .3, .35);

   dial_hub.add('coneY')
      .move(0, .095, .016)
      .turnZ(Math.PI)
      .scale(.008, .012, .008)
      .color(.9, .9, .2);


   for (let n = 0; n < NUMBER_OF_MARKS; n++) {
      let big = n % 5 == 0;
      let theta = Math.PI / 2 - n * NOTCH;

      face.add('cube')
         .turnZ(theta)
         .move(.07, 0, .016)
         .scale(big ? .010 : .005, .0025, .001)
         .color(big ? .9 : .6, big ? 0 : .6, big ? 0 : .6);

      if (big) {
         setText('label' + n, '' + n);
          face.add('label' + n)
            .turnZ(theta)
            .move(.05, 0, .016)
            .turnZ(-Math.PI / 2)
            .move(-.006, -.005, 0)
            .scale(.4, .4, .4)
            .color(.9, .9, .9);
      }
   }

   let plate = dial_hub.add('square').move(0, 0, .0155).scale(.08, .08, 1).opacity(0);

   //numbers above the dial
   let screen = door.add().move(0, .29, .02);
   screen.add('cube').scale(.075, .055, .005).color(.03, .05, .03);
   setText('numText', '00');
   screen.add('numText').move(-.03, -.005, .006).scale(2, 2, 2).color(.2, 1, .3);
   setText('fbText', ' ');
   screen.add('fbText').move(-.07, -.04, .006).scale(.6, .6, .6).color(.9, .9, .5);

   setText('mainText', INTRO_TEXT);
   model.add('mainText').move(.35, 1.8, .05).turnY(-.35).color(1, 1, 1);
   setText('hudText', ' ');
   model.add('hudText').move(.35, 1.15, .05).turnY(-.35).color(.6, .9, 1);

   let state = 'intro';
   let combo, step, bestStep, penalty, startTime, frozenTime, finalScore, won;
   let angle, prevA, prevN, turnDir, number = 0;
   let grabbing = false, on_plate = false, wasAPressed = false, wasBPressed = false;
   let flashUntil, doorAngle;
   let fbMessage = ' ', fbUntil = 0;
   let hints, hintLevel, contacts, gameId = 0;

   let lastFrame = now();

   const newCombination = () => {
      let c = [], prev = 0;
      while (c.length < 3) {
         let x = Math.floor(Math.random() * NUMBER_OF_MARKS);
         if (circDist(x,prev) >= MIN_GAP) {
            c.push(x); prev = x;
         }
      }
      return c;
   }

   const resetGame = () => {
      combo = newCombination();
      step = 0; bestStep = 0; penalty = 0;
      finalScore = 0; frozenTime = TIME_LIMIT; won = false;
      angle = 0; prevA = 0; prevN = 0; turnDir = 0;
      flashUntil = 0; doorAngle = 0; fbUntil = 0;
      grabbing = false;
      hints = ['', '', '']; hintLevel = [0, 0, 0];
      contacts = shuffled(CONTACTS);   // contacts[i] gives hints for the i-th number.
      gameId++;   // Lets late AI hint replies from an earlier game be ignored.
   }

   const startGame = () => {
      resetGame();
      state = 'playing';
      startTime = now();
   }

   const timeLeft = () => TIME_LIMIT - (now() - startTime) - penalty;

   const showFeedback = message => {
      fbMessage = message;
      fbUntil = now() + 1.5;
   }

   const fail = message => {
      penalty += PENALTY;
      step = 0;
      flashUntil = now() + .4;
      showFeedback(message);
      vibrate('right', 1, 60);
      setTimeout(() => vibrate('right', 1, 60), 150);
      sound(250, 1.5);
      sound(250, 1.5, .15);
   }

   const submitNumber = number => {
      // The dial must have arrived at the number turning the required way.
      if (turnDir != DIRECTION[step]) {
         fail('WRONG WAY');
         return;
      }
      if (number == combo[step]) {
         vibrate('right', 1, 80);
         sound(300, 2);
         showFeedback('GOT IT');
         step++;
         bestStep = Math.max(bestStep, step);
         if (step == 3) {
            frozenTime = timeLeft();
            finalScore = Math.max(0, Math.ceil(frozenTime)) * 10;
            grabbing = false;
            state = 'opening';
         }
      }
      else
         fail('WRONG');
   }

   // Called every time the dial passes a tick. dir: -1 = turned RIGHT, +1 = turned LEFT.
   const clickFeedback = (number, dir) => {
      if (state != 'playing' || step >= 3)  {
         vibrate('right', .5, 20);
         sound(2500, .5);
         return;
      }

      // Turning the wrong way: a dull, flat click that gives nothing away.
      if (dir != DIRECTION[step]) {
         vibrate('right', HAPTIC_MIN, 20);
         sound(900, .3);
         return;
      }

      let d = circDist(number, combo[step]);
      if (d == 0) {
         vibrate('right', 1, 40);
         setTimeout(() => vibrate('right', 1, 40), 90);
         sound(4500, 1.2);
         sound(4500, 1.2, .09);
         return;
      }

      let closeness = 1 - d / (NUMBER_OF_MARKS / 2);
      let c2 = closeness * closeness;
      vibrate('right', HAPTIC_MIN + (HAPTIC_MAX - HAPTIC_MIN) * c2, 20);
      sound(2500 + 1500 * c2, .3 + .7 * c2);
   }



   // AI hints. The game computes a true fact about the next number, and the AI only
   // rephrases it in character, so a hint can never be wrong. Each hint for the same
   // number is more precise than the last one.
   const aiQuery = new AIQuery();

   const hintFact = level => {
      let x = combo[step], dir = DIRECTION[step], which = `The ${ORDINAL[step]} number`;
      let low = Math.floor(x / 10) * 10;
      switch (level) {
         case 0:  return `${which} is ${x < NUMBER_OF_MARKS / 2 ? 'in the lower half of the dial' : 'in the upper half of the dial'}.`;
         case 1:  return `${which} is between ${low} and ${low + 9}.`;
         case 2:  return `${which} is ${x % 2 ? 'odd' : 'even'} and between ${low} and ${low + 9}.`;
         default:
            let clicks = dir < 0 ? mod(number - x, NUMBER_OF_MARKS) : mod(x - number, NUMBER_OF_MARKS);
            return `${which} is ${clicks} clicks to the ${dirName(dir)} from where the dial is now.`;
      }
   }

   const requestHint = async () => {
      if (state != 'playing' || hints[step] == '...') return;

      let s = step, game = gameId;
      let fact = hintFact(hintLevel[s]);
      hintLevel[s]++;
      penalty += HINT_COST;
      hints[s] = '...';
      showFeedback(`-${HINT_COST} s`);

      let text;
      try {
         text = (await aiQuery.askAI(fact, { systemPrompt: HINT_RULES + contacts[s].personality })).trim();
      } catch (err) {
         console.warn('[hw4] AI hint failed, showing the plain fact:', err.message);
      }
      if (game != gameId) return;   // A new game started while we waited.
      hints[s] = (text || fact).substring(0, 160);
   }

   inputEvents.onPress = hand => {
      // Browsers keep audio paused until the user interacts, so wake it up here too.
      let { ctx } = getAudio();
      if (ctx.state == 'suspended') ctx.resume();
      if (hand == 'right' && on_plate && state == 'playing') grabbing = true;
      if (hand == 'right' && (state == 'intro' || state == 'gameover')) startGame();
   };

   inputEvents.onRelease = hand => {
      if (hand == 'right') grabbing = false;
   }

   const wonText = () => `\
   YOU WON!

   You cracked the safe with
   ${fmtTime(frozenTime)} left on the clock.
   Final score: ${finalScore}

   Press A to play again.
   `;

      const lostText = () => `\
   YOU LOST!

   Your time ran out.
   The combination was ${combo.join(' - ')}.
   You found ${bestStep} of 3 numbers.

   Final score: 0

   Press A to play again.
   `;

   const mainText = () => {
      switch (state) {
         case 'intro': return INTRO_TEXT;
         case 'playing':
            let name = contacts[step].name;
            if (!hints[step]) return PLAYING_TEXT + '\n' + cg.split(`B calls ${name}, your contact for the ${ORDINAL[step]} number.`, 44);
            let hint = hints[step] == '...' ? `${name} is picking up...` : hints[step];
            return PLAYING_TEXT + `\n${name} (${ORDINAL[step]} number):\n` + cg.split(hint, 44);
         case 'opening': return 'The safe is opening..';
      }
      if (won) return wonText();
      else return lostText();
      }
   const hudText = () => {
      if (state == 'intro')
         return `Time limit: ${fmtTime(TIME_LIMIT)}\n\nPress A to start.`;
      let t = state == 'playing' ? timeLeft() : frozenTime;
      let score = state == 'playing' ? Math.max(0, Math.ceil(t)) * 10 : finalScore;
      let status = state == 'playing'
                 ? STATUS[step]
                 : (won ? 'Safe open!' : 'Game over');
      return `Time:  ${fmtTime(t)}\nScore: ${score}\nFound: ${Math.min(step, 3)} of 3\n\n${status}`;
   };


   resetGame();

   model.animate(() => {
      let t = now();
      let dt = Math.min(t - lastFrame, .1);
      lastFrame = t;

      beamR.update();
      let uvd = beamR.hitRect(plate.getGlobalMatrix());
      on_plate = false;
      let a = prevA;

      if (uvd) {
         let u = uvd[0], v = uvd[1];
         if (u*u + v*v > .04) {
               on_plate = true;
               a = Math.atan2(v, u);
         }
      }
      if(state == 'playing' && grabbing && on_plate) {
         let delta = a - prevA;
         if (delta > Math.PI) delta -= 2*Math.PI;
         if (delta < -Math.PI) delta += 2*Math.PI;
         angle += delta;
               }
      prevA = a;

      face.identity().turnZ(angle);
      
      // Increasing angle = counterclockwise = LEFT, decreasing = RIGHT.
      let n = Math.round(angle / NOTCH);
      number = mod(n, NUMBER_OF_MARKS);

      if (n != prevN) {
         turnDir = Math.sign(n - prevN);
         clickFeedback(number, turnDir);
      }
      prevN = n;

      let aPressed = isAPressed();
      if (aPressed && !wasAPressed)  {
         if (state == 'playing') {
            submitNumber(number);
         }
         else if (state == 'intro' || state == 'gameover') {
            startGame();
         }
         
      }
      wasAPressed = aPressed;

      let bPressed = isBPressed();
      if (bPressed && !wasBPressed) requestHint();
      wasBPressed = bPressed;

      if (state == 'playing' && timeLeft() <= 0 ) {
         frozenTime = 0;
         won = false;
         grabbing = false;
         state = 'gameover';
      }

      if (state == 'opening') {
         doorAngle += Math.sign(-1.6) * dt;
         if (Math.abs(doorAngle) >= Math.abs(-1.6)) {
            doorAngle = -1.6;
            won = true;
            state = 'gameover';
         }
      }
      hinge.identity().move(-.25, 1.3, .02).turnY(doorAngle);
      if (t < flashUntil) faceDisk.color(.7, .1, .1);
      else                faceDisk.color(.3, .3, .35);

      setText('numText', String(number).padStart(2, '0'));
      setText('fbText', t < fbUntil ? fbMessage : ' ');
      setText('mainText', mainText());
      setText('hudText', hudText());
   });



}
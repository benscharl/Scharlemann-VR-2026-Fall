import { ControllerBeam } from "../render/core/controllerInput.js";
import * as cg from "../render/core/cg.js";
import { Structure } from "../render/core/structure.js"; 

const NUMBER_OF_MARKS = 40;
const NOTCH       = 2 * Math.PI / NUMBER_OF_MARKS;
const TIME_LIMIT = 90;
const PENALTY = 5;
const REVERSE_MIN = 2;
const MIN_GAP = 5;

const HAPTIC_MIN = .05;
const HAPTIC_MAX = .7;

const RIGHT = -1, LEFT = 1;
const REQUIRED_DIR = [RIGHT, LEFT, RIGHT];

const STATUS = [
   'Turn RIGHT to the 1st number, then turn back LEFT',
   'Turn LEFT to the 2nd number, then turn back RIGHT',
   'Turn RIGHT to the 3rd number and hold still',
];

const INTRO_TEXT = `\
CRACK THE SAFE

Open the safe within ${TIME_LIMIT} seconds.

Aim to the RIGHT controller at the dial,
hold the tirgger and move to turn it.

1st number: turn RIGHT, then reverse
2nd number: turn LEFT, then reverse
3rd number: turn RIGHT and hold still

The clicks get stronger near the right number.
A double pulse means that your are right on it.

A wrong number costs ${PENALTY} seconds and
you start over with the first number. 

The screen will tell you though if you were
too HIGH or too LOW.

Press A to start.`;

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
   let combo, penalty, startTime;
   let angle, prevA, prevN;
   let grabbing = false, on_plate = false;

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
      grabbing = false;
   }

   const startGame = () => {
      resetGame();
      state = 'playing';
      startTime = now();
   }

   const timeLeft = () => TIME_LIMIT - (now() - startTime) - penalty;



   inputEvents.onPress = hand => {
      if (hand == 'right' && on_plate) grabbing = true;
   }
   inputEvents.onRelease = hand => {
      if (hand == 'right') grabbing = false;
   }

   model.animate(() => {
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
      if(grabbing && on_plate) {
         let delta = a - prevA;
         if (delta > Math.PI) delta -= 2*Math.PI;
         if (delta < -Math.PI) delta += 2*Math.PI;
         angle += delta;
               }
      prevA = a;

      face.identity().turnZ(angle);

      let n = Math.round(angle/NOTCH);
      if (n != prevN) {
         //vibrate('right', 1, 20);
         prevN = n;
      }
   });



}
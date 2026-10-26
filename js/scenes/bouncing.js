import * as cg from "../render/core/cg.js";
import { loadSound, playSoundAtPosition } from "../util/positional-audio.js";

// LOAD ALL THE SOUNDS THAT WILL BE MADE WHEN BALLS BOUNCE.

let soundBuffer = [], loadSounds = [];
for (let i = 0; i < 6; i++)
   loadSounds.push(loadSound('../../media/sound/bounce/' + i + '.wav', buffer => soundBuffer[i] = buffer));
Promise.all(loadSounds);

const N = 30, r = .15;
const lo = [-2.8, r, -2.8], hi = [2.8, 3 - r, 2.8];
const playerColors = [[1, .2, .2], [.2, .5, 1], [1, .9, .1], [.2, .9, .3]];
const neutral = [.5, .5, .5];
const R = Math.random;

// CREATE AN INITIAL POSITION FOR EVERY BALL.

let newGame = () => {
   let game = { p: [], v: [], owner: [], touches: [] };
   for (let i = 0; i < N; i++) {
      game.p.push(lo.map((l, j) => l + (hi[j] - l) * R()));
      game.v.push([.05 * (R() - .5), .05 * (R() - .5), .05 * (R() - .5)]);
      game.owner.push(null);
      game.touches.push(0);
   }
   return game;
}

server.init('game', newGame());

let colorOf = id => {
   let k = window.clients ? clients.indexOf(id) : -1;
   return k < 0 ? neutral : playerColors[k % playerColors.length];
}

export const init = async model => {
   for (let i = 0; i < N; i++)
      model.add('sphere');

   let simulate = () => {
      let g = window.game, p = g.p, v = g.v;
      let bounce = (i, pos, id) => {
         v[i] = cg.add(v[i], cg.scale(cg.subtract(p[i], pos), .03 / r));
         g.owner[i] = id;
         g.touches[i]++;
      }
      for (let id of clients) {
         for (let hand of ['left', 'right']) {        // BOUNCE OFF A HAND
            let pos = clientState.finger(id, hand, 1);
            if (pos)
               for (let i = 0; i < N; i++)
                  if (cg.distance(p[i], pos) < r)
                     bounce(i, pos, id);
         }
         let head = clientState.head(id);             // BOUNCE OFF HEAD
         if (Array.isArray(head))
            for (let i = 0; i < N; i++)
               if (cg.distance(p[i], head.slice(12, 15)) < r + .15)
                  bounce(i, head.slice(12, 15), id);
      }
      for (let i = 0; i < N - 1; i++)                 // BOUNCE OFF ANOTHER BALL
         for (let j = i + 1; j < N; j++)
            if (cg.distance(p[i], p[j]) < 2 * r) {
               let a = cg.mix(v[i], v[j], .5);
               let d = cg.normalize(cg.subtract(p[j], p[i]));
               v[i] = cg.add(v[i], cg.scale(d, -2 * cg.dot(v[i], d)));
               v[j] = cg.add(v[j], cg.scale(d, -2 * cg.dot(v[j], d)));
               let b = cg.mix(v[i], v[j], .5);
               let c = cg.scale(cg.subtract(a, b), .5);
               v[i] = cg.add(v[i], cg.add(c, cg.scale(d, -.01)));
               v[j] = cg.add(v[j], cg.add(c, cg.scale(d, .01)));
            }
      for (let i = 0; i < N; i++)                   // BOUNCE OFF WALLS
         for (let j = 0; j < 3; j++) {
            if (p[i][j] < lo[j]) v[i][j] = Math.abs(v[i][j]);
            if (p[i][j] > hi[j]) v[i][j] = -Math.abs(v[i][j]);
         }
      for (let i = 0; i < N; i++) {                 // MOVE EACH BALL BY ITS VELOCITY
         v[i][1] -= .004 * model.deltaTime;
         v[i] = cg.roundVec(5, cg.scale(v[i], .992));
         p[i] = cg.roundVec(4, cg.add(p[i], v[i]));
      }
   }

   let seen = [], hit = new Array(N).fill(0);

   let draw = () => {
      let g = window.game;
      for (let i = 0; i < N; i++) {
         if (seen[i] !== undefined && g.touches[i] > seen[i]) {
            hit[i] = 10;
            playSoundAtPosition(soundBuffer[6 * R() >> 0], g.p[i]);
         }
         seen[i] = g.touches[i];
         let c = colorOf(g.owner[i]);
         model.child(i).color(hit[i]-- > 0 ? c.map(x => .5 + .5 * x) : c)
            .identity().move(g.p[i]).scale(r);
      }
   }

   model.animate(() => {
      server.sync('game', () => { });

      if (window.clients && isMasterClient()) {
         simulate();
         server.broadcastGlobal('game');
      }

      draw();
   });
}
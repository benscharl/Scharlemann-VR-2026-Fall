import * as cg from "../render/core/cg.js";
import { buttonState } from "../render/core/controllerInput.js";
import { lcb, rcb } from '../handle_scenes.js';
import { loadSound, playSoundAtPosition, playLoopingSoundAtPosition02,
         stopLoopingSound02, updateSound02Position } from "../util/positional-audio.js";



let createSoundBuffer = null;
let deleteSoundBuffer = null;
let dragSoundBuffer = null;

function preloadSounds() {
    Promise.all([
        loadSound('../../media/sound/SFXs/demoBalls/SFX_Ball_Create_Mono_01.wav', buffer => createSoundBuffer = buffer),
        loadSound('../../media/sound/SFXs/demoBalls/SFX_Ball_Delete_Mono_01.wav', buffer => deleteSoundBuffer = buffer),
        loadSound('../../media/sound/SFXs/demoBalls/SFX_Ball_Drag_Mono_LP_01.wav', buffer => dragSoundBuffer = buffer)

    ])
    .then(() => {
        console.log('All sounds loaded successfully');
    })
    .catch(error => {
        console.error('An error occurred while loading sounds:', error);
    });
}
preloadSounds();

const radius        = 0.08;
const NUM_ORBS      = 10;
const ROUND_SECONDS = 20;
const HUD_POS       = [-.3, 2.2, -1.3]; 


server.init('orbs', {}); 
const myID = Math.random().toString(36).slice(2, 8);
const now  = () => performance.now() / 1000;

const palette = [
   { name: 'Red',    rgb: [1, .3, .3] },
   { name: 'Blue',   rgb: [.3, .6, 1] },
   { name: 'Green',  rgb: [.3, 1, .4] },
   { name: 'Yellow', rgb: [1, .85, .2] },
   { name: 'Purple', rgb: [.8, .4, 1] },
   { name: 'Orange', rgb: [1, .6, .2] },
];
const neutral = [.8, .8, .8];

let game = {
   phase:   'waiting',
   endTime: 0,
   players: [],
   result:  '',
};

let seen = { [myID]: now() };
let lastHello = -Infinity;

const playerList = () => game.phase == 'waiting' ? Object.keys(seen).sort() : game.players;
const playerColor = who => {
   let i = playerList().indexOf(who);
   if (i < 0) {
      i = 0;
      for (let c of who) i = (i * 31 + c.charCodeAt(0)) >>> 0;
   }
   return palette[i % palette.length];
}

const scores = () => {
    let score = {};
    for (let id in orbs) {
        let o = orbs[id].owner;
        if (o) score[o] = (score[o] || 0) + 1;
    }

    return score;
}

const scoreLines = () => Object.entries(scores())
   .sort((a, b) => b[1] - a[1])
   .map(([who, n]) => playerColor(who).name + ': ' + n)
   .join('\n');

const computeFinalResult = () => {
    let score = scores(), best = Math.max(0, ...Object.values(score));
    if (best == 0) {
        return 'Nobody claimed any orbs! What are you guys doing?';
    }
    let winners = Object.keys(score).filter(who => score[who] == best).map(who => playerColor(who).name);
    if (winners.length == 1)
        return winners[0] + 'wins with ' + best + 'orbs!'
    else 
        return 'Tie ' + winners.join(', ') + ' (' + best + ' each!)';
}

const randomLayout = () => {
   let positions = [];
   for (let i = 0; i < NUM_ORBS; i++) {
      let angle = 2 * Math.PI * i / NUM_ORBS + (Math.random() - .5) * .4;
      let r = .6 + .4 * Math.random();
      positions.push(cg.roundVec(4, [r * Math.sin(angle), 1.1 + .7 * Math.random(), r * Math.cos(angle)]));
   }
   return positions;
}

const send = (op, id, extra = {}) => server.send('orbs', { op, id, who: myID, ...extra });

const beams   = { left: lcb, right: rcb };
const holding = { left: null, right: null };
const dragPos = { left: null, right: null };
const prev    = { left: {}, right: {} };
let endSent   = false;

const TRIGGER = 0, START = 4;

const button = (hand, b) => {
   let isDown = buttonState[hand][b]?.pressed ?? false;
   let was    = prev[hand][b] ?? false;
   prev[hand][b] = isDown;
   return { down: isDown && ! was, up: ! isDown && was, held: isDown };
}

const pointedOrb = hand => {
   let best = null, dMin = radius;
   for (let id in orbs) {
      let point = beams[hand].projectOntoBeam(orbs[id].pos);
      let d = cg.distance(point, orbs[id].pos);
      if (d < dMin) { dMin = d; best = id; }
   }
   return best;
}

const dropAll = () => {
   holding.left = holding.right = null;
   stopLoopingSound02();
}

let textMeshes = {}, textCount = 0;
const textMesh = str => {
   if (! textMeshes[str]) {
      textMeshes[str] = 'hud' + textCount++;
      clay.defineTextMesh(textMeshes[str], str);
   }
   return textMeshes[str];
}

export const init = async model => {
    let toHeadsetPos = pos => {
      let emptyObj = model.add().move(pos);
      let newPos = emptyObj.getGlobalMatrix().slice(12, 15);
      model.remove(emptyObj);
      return newPos;
   }

   let playAt = (buffer, pos) => { if (buffer) playSoundAtPosition(buffer, toHeadsetPos(pos)); }

    model.animate(() => {

        if (now() - lastHello > 2) {
            send('hello', null);
            lastHello = now();
        }
        for (let who in seen) {
            if (who != myID && now() - seen[who] > 6) {
                delete seen[who];
            }
        }
        
        server.sync('orbs', messages => {
            for (let key in messages) {
                let m = messages[key], orb = orbs[m.id];
                switch(m.op) {
                    case 'hello':
                        seen[m.who] = now();
                        break;

                    case 'start':
                        if (game.phase == 'playing') break;
                        for (let id in orbs) {
                            delete orbs[id];
                        }
                        m.positions.forEach((pos, i) => orbs[i] = { pos, owner: null, held: null });
                        game.phase   = 'playing';
                        game.endTime = now() + ROUND_SECONDS;
                        game.players = m.players;
                        game.result  = '';
                        endSent = false;
                        dropAll();
                        playAt(createSoundBuffer, HUD_POS);
                        break;

                    case 'grab':
                        if (game.phase == 'playing' && orb && ! orb.held) {
                            orb.held  = m.who;
                            orb.owner = m.who;
                            playAt(createSoundBuffer, orb.pos);
                        }
                        break;

                    case 'move':
                        if (orb && orb.held == m.who) {
                            orb.pos = m.pos;
                        }
                        break;

                    case 'release':
                        if (orb && orb.held == m.who) {
                            orb.held = null;
                        }
                        break;

                    case 'end':
                        if (game.phase != 'playing') break;
                        game.phase = 'over';
                        for (let id in orbs) {
                            orbs[id].held = null;
                        }

                        game.result = computeFinalResult();
                        dropAll()
                        playAt(deleteSoundBuffer, HUD_POS);
                        break;

                }
            }
        });

        if (game.phase == 'playing' && now() >= game.endTime && ! endSent) {
            send('end', null);
            endSent = true;
        }
        for (let hand of ['left', 'right']) {
            let trigger = button(hand, TRIGGER);

            if (trigger.down && game.phase == 'playing') {
                let id = pointedOrb(hand);
                if (id !== null && ! orbs[id].held) {
                    holding[hand] = id;
                    dragPos[hand] = orbs[id].pos;
                    send('grab', id);
                    if (dragSoundBuffer)
                        playLoopingSoundAtPosition02(dragSoundBuffer, toHeadsetPos(orbs[id].pos));
                }
            }
         else if (trigger.held && holding[hand] !== null) {
            let orb = orbs[holding[hand]];
            if (game.phase != 'playing' || ! orb || (orb.held && orb.held != myID)) {
               holding[hand] = null;
               stopLoopingSound02();
            }
            else {
               let point = beams[hand].projectOntoBeam(dragPos[hand]);
               if (cg.distance(point, dragPos[hand]) > 0.001) {
                  dragPos[hand] = cg.roundVec(4, point);
                  send('move', holding[hand], { pos: dragPos[hand] });
                  updateSound02Position(toHeadsetPos(dragPos[hand]));
               }
            }
        }
         else if (trigger.up && holding[hand] !== null) {
            send('release', holding[hand]);
            holding[hand] = null;
            stopLoopingSound02();
        }
        if (button(hand, START).down && game.phase != 'playing')
            send('start', null, { positions: randomLayout(), players: playerList() });
        }

        while (model.nChildren() > 0)
            model.remove(0);
        
        let hovered = game.phase == 'playing' ? [pointedOrb('left'), pointedOrb('right')] : [];
        for (let id in orbs) {
            let orb = orbs[id];
            let c = orb.owner ? playerColor(orb.owner).rgb : neutral;
            if (hovered.includes(id) && ! orb.held) {
                c = c.map(v => .5 + .5 * v);
            }
            model.add('sphere').color(c).move(orb.pos)
              .scale(orb.held ? radius * 1.15 : radius);
        }

        let you = 'You are ' + playerColor(myID).name;
        let hud;
        if (game.phase == 'waiting')
            hud = 'Press A or X to start\n' + you;
        else if (game.phase == 'playing')
            hud = 'Time: ' + Math.max(0, Math.ceil(game.endTime - now())) + '\n' + scoreLines() + '\n' + you;
        else
            hud = 'GAME OVER\n' + game.result + '\n' + scoreLines() + '\nPress A or X to play again';

        model.add(textMesh(hud)).color(1, 1, 1).move(HUD_POS);
    });
}
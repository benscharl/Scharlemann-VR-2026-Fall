import * as cg from "../render/core/cg.js";
import { buttonState } from "../render/core/controllerInput.js";

const K = 12;
const TABLE = { x: 0, y: .74, z: -.6, halfW: .762, halfD: .305 };
const ROOM = [4, 1.5, 4];
const SPOT = [TABLE.x - .4, TABLE.y, TABLE.z + .12];
const RING_DIST = .1, RING_ANGLES = [-Math.PI / 3, 0, Math.PI / 3];
const RINGS = RING_ANGLES.map(a => [SPOT[0] + RING_DIST * Math.sin(a), SPOT[2] - RING_DIST * Math.cos(a)]);
const PICK_ZONE = .16;

const CANOPY_Y = 1.6, CANOPY_R = .6;
const APPLE_R = .06;
const APPLE_SLOTS = [[-.5, -.2], [-.3, -.8], [0, .15], [.3, -.45], [.5, -.2]];
const REACH = .15;
const GRAB_R = .05;
const REGROW = 10;

const KINDS = [
    { leaf: [.15, .5, .15], apple: [.85, .08, .08], canopy: [1, 1, 1] },
    { leaf: [.3, .6, .1], apple: [.45, .8, .1], canopy: [.85, 1.2, .85] },
    { leaf: [.08, .4, .25], apple: [.95, .75, .1], canopy: [1.1, .85, 1.1] },
];
const BARE = [.4, .3, .15], TRUNK = [.35, .22, .12];
const GIANT_COLOR = [.8, .3, .2], PICKER_COLOR = [.2, .35, .7];

const START = RINGS.concat([[TABLE.x + .05, TABLE.z - .1], [TABLE.x + .25, TABLE.z - .1], [TABLE.x + .45, TABLE.z - .1]]);

let randomMask = () => {
    let slots = [0, 1, 2, 3, 4].sort(() => Math.random() - .5).slice(0, 1 + Math.floor(5 * Math.random()));
    return slots.reduce((mask, s) => mask | 1 << s, 0);
}

let freshTrees = () => ({ trees: START.map(([x, z], n) => ({ x, y: TABLE.y, z, kind: n % KINDS.length, gen: 0, mask: randomMask() })) });
let freshPicker = () => ({ anchor: null, picked: START.map(() => ({ gen: -1, mask: 0 })), held: { left: -1, right: -1 }, count: 0 });
let freshRoles = () => ({ swap: false });

window.orchardTrees = freshTrees();
window.orchardPicker = freshPicker();
window.orchardRoles = freshRoles();

let isValid = {
    orchardTrees: v => v && Array.isArray(v.trees) && v.trees.length == START.length,
    orchardPicker: v => v && Array.isArray(v.picked) && v.picked.length == START.length && v.held,
    orchardRoles: v => v && typeof v.swap == 'boolean',
};
let fresh = { orchardTrees: freshTrees, orchardPicker: freshPicker, orchardRoles: freshRoles };

let synced = name => {
    let v = server.synchronize(name);
    if (!isValid[name](v))
        v = window[name] = fresh[name]();
    return v;
}
let share = name => server.broadcastGlobal(name);

export const init = async model => {
    let world = model.add();

    let room = world.add();
    room.add('cube').move(0, ROOM[1], 0).scale(ROOM).color(.75, .85, .95);
    room.add('cube').move(0, .01, 0).scale(ROOM[0], .01, ROOM[2]).color(.4, .36, .32);

    world.add('cube').move(TABLE.x, TABLE.y - .02, TABLE.z)
        .scale(TABLE.halfW, .02, TABLE.halfD).color(.55, .38, .22);
    for (let sx of [-.95, .95])
        for (let sz of [-.9, .9])
            world.add('tubeY').move(TABLE.x + sx * TABLE.halfW, (TABLE.y - .04) / 2, TABLE.z + sz * TABLE.halfD)
                .scale(.025, (TABLE.y - .04) / 2, .025).color(.45, .3, .18);

    world.add('diskY').move(SPOT[0], SPOT[1] + .001, SPOT[2]).scale(.035).color(.3, .62, .22);
    let rings = RINGS.map(([x, z]) => world.add('diskY').move(x, TABLE.y + .001, z).scale(.05));

    let makeTree = () => {
        let node = world.add();
        node.add('tubeY').move(0, CANOPY_Y / 2, 0).scale(.09, CANOPY_Y / 2, .09).color(TRUNK);
        let canopy = node.add();
        canopy.add('sphere').scale(CANOPY_R);
        canopy.add('sphere').move(-.28, .28, -.1).scale(.34);
        canopy.add('sphere').move(.28, .3, -.1).scale(.34);

        let apples = APPLE_SLOTS.map(([az, el]) => {
            let d = CANOPY_R + APPLE_R * .5;
            return {
                pos: [d * Math.cos(el) * Math.sin(az), CANOPY_Y + d * Math.sin(el), d * Math.cos(el) * Math.cos(az)],
                node: node.add('sphere'),
            };
        });
        return { node, canopy, apples };
    }
    let treeNodes = START.map(makeTree);

    let makeAvatar = color => {
        let node = world.add();
        let head = node.add();
        head.add('sphere').scale(.1).color(.95, .75, .6);
        head.add('cube').move(0, .02, -.09).scale(.09, .035, .03).color(.1, .1, .15);
        let body = node.add('tubeY').color(color);
        let hands = {};
        for (let hand of ['left', 'right']) {
            hands[hand] = node.add();
            hands[hand].add('tubeZ').scale(.02, .02, .05).color(color);
            hands[hand].add('sphere').move(0, 0, -.07).scale(.03).color(.9, .9, .9);
        }
        return { node, head, body, hands };
    }
    let giantAvatar = makeAvatar(GIANT_COLOR);
    let pickerAvatar = makeAvatar(PICKER_COLOR);

    let poseAvatar = (avatar, id, toWorld, feet, size) => {
        let h = id === undefined ? null : clientState.head(id);
        if (!Array.isArray(h)) {
            avatar.node.setMatrix(cg.mScale(0, 0, 0));
            return;
        }
        avatar.node.identity();
        let headM = cg.mMultiply(toWorld, h);
        avatar.head.setMatrix(headM);
        feet = feet || [headM[12], 0, headM[14]];
        let neckY = headM[13] - .1 * size;
        avatar.body.identity().move(feet[0], (feet[1] + neckY) / 2, feet[2])
            .scale(.14 * size, Math.max(0, neckY - feet[1]) / 2, .14 * size);
        for (let hand in avatar.hands) {
            let m = clientState.hand(id, hand);
            avatar.hands[hand].setMatrix(m ? cg.mMultiply(toWorld, m) : cg.mScale(0, 0, 0));
        }
    }

    let heldApples = { left: world.add('sphere'), right: world.add('sphere') };
    let tally = world.add('label');
    let hint = world.add('label');

    let me, giant, picker, isGiant = false, isPicker = false, ownsTrees = false;
    let T = orchardTrees, P = orchardPicker, R = orchardRoles;
    let grab = null, wasPressed = false, wasPicker = false, emptySince = [];

    let headMatrix = () => {
        let m = clientState.head(clientID);
        return Array.isArray(m) ? m : cg.mTranslate(0, 1.6, 0);
    }

    let miniatureMatrix = anchor => cg.mMultiply(cg.mTranslate(anchor[0], 0, anchor[1]),
        cg.mMultiply(cg.mScale(K, K, K), cg.mTranslate(-SPOT[0], -SPOT[1], -SPOT[2])));

    let isOn = (t, s) => (T.trees[t].mask >> s & 1) && !(P.picked[t].gen == T.trees[t].gen && P.picked[t].mask >> s & 1);
    let applesLeft = t => APPLE_SLOTS.filter((_, s) => isOn(t, s)).length;

    let applePos = (t, s) => cg.mTransform(world.getMatrix(),
        cg.mTransform(treeNodes[t].node.getMatrix(), treeNodes[t].apples[s].pos));

    let treeAtRing = ([x, z], skip) => T.trees.findIndex((tree, t) => t != skip && Math.hypot(tree.x - x, tree.z - z) < .01);

    inputEvents.onPress = hand => {
        let p = inputEvents.pos(hand);
        if (!p)
            return;

        if (isPicker && P.held[hand] < 0) {
            let best = null, bestDist = REACH;
            T.trees.forEach((tree, t) => APPLE_SLOTS.forEach((_, s) => {
                let d = isOn(t, s) ? cg.distance(p, applePos(t, s)) : Infinity;
                if (d < bestDist) {
                    best = { t, s };
                    bestDist = d;
                }
            }));
            if (best) {
                let tree = T.trees[best.t], picked = P.picked[best.t];
                P.picked[best.t] = { gen: tree.gen, mask: (picked.gen == tree.gen ? picked.mask : 0) | 1 << best.s };
                P.held[hand] = tree.kind;
                share('orchardPicker');
            }
        }

        if (isGiant && !grab && p[1] > TABLE.y - .02 && p[1] < TABLE.y + .3) {
            let best = -1, bestDist = GRAB_R;
            T.trees.forEach((tree, t) => {
                let d = Math.hypot(p[0] - tree.x, p[2] - tree.z);
                if (d < bestDist) {
                    best = t;
                    bestDist = d;
                }
            });
            if (best >= 0) {
                let tree = T.trees[best];
                grab = { hand, t: best, offset: [tree.x - p[0], tree.z - p[2]], y0: p[1], from: [tree.x, tree.z] };
            }
        }
    }

    inputEvents.onDrag = hand => {
        let p = inputEvents.pos(hand);
        if (grab && grab.hand == hand && p) {
            let tree = T.trees[grab.t];
            tree.x = p[0] + grab.offset[0];
            tree.z = p[2] + grab.offset[1];
            tree.y = TABLE.y + Math.max(0, p[1] - grab.y0);
            share('orchardTrees');
        }
    }

    inputEvents.onRelease = hand => {
        if (grab && grab.hand == hand) {
            let tree = T.trees[grab.t];
            tree.y = TABLE.y;

            if (Math.hypot(tree.x - SPOT[0], tree.z - SPOT[2]) < PICK_ZONE) {
                let free = RINGS.filter(ring => treeAtRing(ring, grab.t) < 0)
                    .sort((a, b) => Math.hypot(a[0] - tree.x, a[1] - tree.z) - Math.hypot(b[0] - tree.x, b[1] - tree.z));
                [tree.x, tree.z] = free.length ? free[0] : grab.from;
            }
            else {
                tree.x = Math.max(TABLE.x - TABLE.halfW + .05, Math.min(TABLE.x + TABLE.halfW - .05, tree.x));
                tree.z = Math.max(TABLE.z - TABLE.halfD + .05, Math.min(TABLE.z + TABLE.halfD - .05, tree.z));
            }
            grab = null;
            share('orchardTrees');
        }
        if (isPicker && P.held[hand] >= 0) {
            P.held[hand] = -1;
            P.count++;
            share('orchardPicker');
        }
    }

    model.animate(() => {
        T = synced('orchardTrees');
        P = synced('orchardPicker');
        R = synced('orchardRoles');
        me = window.clientID;
        let players = (window.clients || []).filter(id => clientState.isXR(id));
        giant = players[R.swap ? 1 : 0];
        picker = players[R.swap ? 0 : 1];
        isGiant = me !== undefined && me === giant;
        isPicker = me !== undefined && me === picker;
        ownsTrees = me !== undefined && me === (giant !== undefined ? giant : picker);

        if (!isGiant)
            grab = null;
        if (isPicker && (!wasPicker || !P.anchor)) {
            let h = headMatrix();
            P.anchor = [h[12], h[14]];
            share('orchardPicker');
        }
        wasPicker = isPicker;

        let pressed = buttonState.right[4] && buttonState.right[4].pressed;
        let isHolding = grab || (isPicker && (P.held.left >= 0 || P.held.right >= 0));
        if (pressed && !wasPressed && (isGiant || isPicker) && !isHolding) {
            R.swap = !R.swap;
            share('orchardRoles');
        }
        wasPressed = pressed;

        let M = P.anchor ? miniatureMatrix(P.anchor) : cg.mIdentity();
        let toTable = cg.mInverse(M);
        world.setMatrix(isPicker ? M : cg.mIdentity());
        room.setMatrix(isPicker ? cg.mIdentity() : cg.mScale(0, 0, 0));

        if (ownsTrees)
            T.trees.forEach((tree, t) => {
                if (applesLeft(t) > 0 || (grab && grab.t == t))
                    emptySince[t] = undefined;
                else if (emptySince[t] === undefined)
                    emptySince[t] = model.time;
                else if (model.time - emptySince[t] > REGROW) {
                    tree.gen++;
                    tree.mask = randomMask();
                    emptySince[t] = undefined;
                    share('orchardTrees');
                }
            });
        T.trees.forEach((tree, t) => {
            let { node, canopy, apples } = treeNodes[t];
            let kind = KINDS[tree.kind];
            node.setMatrix(cg.mMultiply(cg.mTranslate(tree.x, tree.y, tree.z),
                cg.mMultiply(cg.mRotateY(Math.atan2(SPOT[0] - tree.x, SPOT[2] - tree.z)), cg.mScale(1 / K, 1 / K, 1 / K))));
            canopy.identity().move(0, CANOPY_Y, 0).scale(kind.canopy);
            let leaf = applesLeft(t) ? kind.leaf : BARE;
            for (let n = 0; n < canopy.nChildren(); n++)
                canopy.child(n).color(leaf);
            apples.forEach((apple, s) => apple.node.identity().move(apple.pos).scale(isOn(t, s) ? APPLE_R : 0).color(kind.apple));
        });
        rings.forEach((ring, n) => ring.color(treeAtRing(RINGS[n]) < 0 ? [.95, .9, .4] : [.5, .45, .3]));

        if (isGiant || picker === undefined)
            pickerAvatar.node.setMatrix(cg.mScale(0, 0, 0));
        else
            poseAvatar(pickerAvatar, picker, toTable, SPOT, 1 / K);
        if (isGiant || giant === undefined)
            giantAvatar.node.setMatrix(cg.mScale(0, 0, 0));
        else
            poseAvatar(giantAvatar, giant, cg.mIdentity(), null, 1);
        if (isPicker)
            pickerAvatar.node.setMatrix(cg.mScale(0, 0, 0));

        for (let hand in heldApples) {
            let p = picker === undefined ? null : clientState.finger(picker, hand, 1);
            if (P.held[hand] >= 0 && p)
                heldApples[hand].identity().move(cg.mTransform(toTable, p)).scale(APPLE_R / K).color(KINDS[P.held[hand]].apple);
            else
                heldApples[hand].identity().scale(0);
        }

        tally.identity().move(TABLE.x, TABLE.y + .3, TABLE.z - TABLE.halfD)
            .scale(.03).info('Apples picked: ' + P.count);
        hint.identity().move(TABLE.x, TABLE.y + .25, TABLE.z - TABLE.halfD)
            .scale(.02).info(isGiant ? 'Giant: bring full trees to the rings. A swaps roles'
                : isPicker ? 'Picker: pick the apples. A swaps roles'
                    : 'Enter XR to play');
    });
}

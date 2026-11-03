import * as cg from "../render/core/cg.js";
import { buttonState } from "../render/core/controllerInput.js";
import { lcb, rcb } from "../handle_scenes.js";

const K = 12;
const TABLE = { x: 0, y: .74, z: -.6, halfW: .762, halfD: .305 };
const ROOM = [4, 1.5, 4];
const TRAY_HALF = .2, TRAY_TOP = .008;
const SPOT = [0, TRAY_TOP, .1];

const TREE_DIST = 1.2;
const TREE_ANGLES = [-Math.PI / 3, 0, Math.PI / 3];
const CANOPY_Y = 1.6, CANOPY_R = .6;
const APPLE_R = .06;
const APPLE_SLOTS = [[-.5, -.2], [-.3, -.8], [0, .15], [.3, -.45], [.5, -.2]];

const REACH = .15;
const GRAB_MARGIN = .03;
const SAMPLE_SCALE = .7, SAMPLE_HIT_R = .07;

const KINDS = [
    { leaf: [.15, .5, .15], apple: [.85, .08, .08], canopy: [1, 1, 1] },
    { leaf: [.3, .6, .1], apple: [.45, .8, .1], canopy: [.85, 1.2, .85] },
    { leaf: [.08, .4, .25], apple: [.95, .75, .1], canopy: [1.1, .85, 1.1] },
];
const BARE = [.4, .3, .15], TRUNK = [.35, .22, .12];

export const init = async model => {
    let world = model.add();
    let room = world.add();
    room.add('cube').move(0, ROOM[1], 0).scale(ROOM).color(.75, .85, .95);
    room.add('cube').move(0, .01, 0).scale(ROOM[0], .01, ROOM[2]).color(.4, .36, .32);

    // table
    world.add('cube').move(TABLE.x, TABLE.y - .02, TABLE.z)
        .scale(TABLE.halfW, .02, TABLE.halfD).color(.55, .38, .22);
    for (let sx of [-.95, .95])
        for (let sz of [-.9, .9])
            world.add('tubeY').move(TABLE.x + sx * TABLE.halfW, (TABLE.y - .04) / 2, TABLE.z + sz * TABLE.halfD)
                .scale(.025, (TABLE.y - .04) / 2, .025).color(.45, .3, .18);

    // tree

    let makeTree = parent => {
        let node = parent.add();
        node.add('tubeY').move(0, CANOPY_Y / 2, 0).scale(.09, CANOPY_Y / 2, .09).color(TRUNK);
        let canopy = node.add();
        canopy.move(0, CANOPY_Y, 0);
        canopy.add('sphere').scale(CANOPY_R);
        canopy.add('sphere').move(-.28, .28, -.1).scale(.34);
        canopy.add('sphere').move(.28, .3, -.1).scale(.34);

        let apples = APPLE_SLOTS.map(([az, el]) => {
            let d = CANOPY_R + APPLE_R * .5;
            let pos = [d * Math.cos(el) * Math.sin(az),
            CANOPY_Y + d * Math.sin(el),
            d * Math.cos(el) * Math.cos(az)];
            return { pos, node: node.add('sphere'), isOn: false };
        });
        return { node, canopy, apples, kind: 0 };
    }

    let applesLeft = tree => tree.apples.filter(a => a.isOn).length;

    let paintTree = tree => {
        let kind = KINDS[tree.kind];
        tree.canopy.identity().move(0, CANOPY_Y, 0).scale(kind.canopy);
        let color = applesLeft(tree) ? kind.leaf : BARE;
        for (let n = 0; n < tree.canopy.nChildren(); n++)
            tree.canopy.child(n).color(color);
        for (let apple of tree.apples) {
            apple.node.identity().move(apple.pos).scale(apple.isOn ? APPLE_R : 0);
            apple.node.color(kind.apple);
        }
    }

    let plantTree = (tree, kindIndex, nApples) => {
        tree.kind = kindIndex;
        let slots = [0, 1, 2, 3, 4].sort(() => Math.random() - .5).slice(0, nApples);
        tree.apples.forEach((apple, n) => apple.isOn = slots.includes(n));
        paintTree(tree);
    }

    let trayPos = [TABLE.x - .2, TABLE.y, TABLE.z];
    let tray = world.add();
    tray.add('cube').move(0, TRAY_TOP / 2, 0).scale(TRAY_HALF, TRAY_TOP / 2, TRAY_HALF).color(.3, .62, .22);

    let trees = TREE_ANGLES.map((angle, n) => {
        let tree = makeTree(tray);
        tree.node.move(SPOT[0] + TREE_DIST / K * Math.sin(angle), TRAY_TOP, SPOT[2] - TREE_DIST / K * Math.cos(angle))
            .turnY(-angle).scale(1 / K);
        plantTree(tree, n % KINDS.length, 1 + Math.floor(5 * Math.random()));
        return tree;
    });

    let samples = KINDS.map((kind, n) => {
        let tree = makeTree(world);
        tree.base = [TABLE.x + .45, TABLE.y, TABLE.z + .18 * (n - 1)];
        plantTree(tree, n, 5);
        return tree;
    });

    let sampleCenter = tree => cg.add(tree.base, [0, CANOPY_Y * SAMPLE_SCALE / K, 0]);

    let avatar = world.add();
    let head = avatar.add();
    head.add('sphere').scale(.1).color(.95, .75, .6);
    head.add('cube').move(0, .02, -.09).scale(.09, .035, .03).color(.1, .1, .15);
    let body = avatar.add('tubeY').color(.2, .35, .7);
    let avatarHand = { left: avatar.add('sphere').color(.2, .35, .7), right: avatar.add('sphere').color(.2, .35, .7) };

    let heldNode = { left: model.add('sphere'), right: model.add('sphere') };
    let held = { left: null, right: null };
    let tally = world.add('label');

    let small = false, wasPressed = false, nPicked = 0;
    let grab = null, viewM = cg.mIdentity(), hoverSample = null;

    let headMatrix = () => {
        let m = clientState.head(clientID);
        return Array.isArray(m) ? m : cg.mTranslate(0, 1.6, 0);
    }

    let miniatureMatrix = () => {
        let m = headMatrix();
        let spot = cg.add(trayPos, SPOT);
        return cg.mMultiply(cg.mTranslate(m[12], 0, m[14]),
            cg.mMultiply(cg.mScale(K, K, K), cg.mTranslate(-spot[0], -spot[1], -spot[2])));
    }

    let applePos = (tree, apple) => cg.mTransform(world.getMatrix(),
        cg.mTransform(tray.getMatrix(),
            cg.mTransform(tree.node.getMatrix(), apple.pos)));

    let beamRay = hand => {
        let beam = hand == 'left' ? lcb : rcb;
        if (!beam || !beam.m)
            return null;
        let m = cg.mMultiply(clay.inverseRootMatrix, beam.beamMatrix());
        return { origin: m.slice(12, 15), dir: cg.scale(cg.normalize(m.slice(8, 11)), -1) };
    }

    let hitSample = hand => {
        let ray = beamRay(hand);
        if (ray)
            for (let tree of samples) {
                let p = cg.subtract(sampleCenter(tree), ray.origin);
                let t = cg.dot(p, ray.dir);
                if (t > 0 && cg.norm(cg.subtract(p, cg.scale(ray.dir, t))) < SAMPLE_HIT_R)
                    return tree;
            }
        return null;
    }

    let isOverTray = p => Math.abs(p[0] - trayPos[0]) < TRAY_HALF + GRAB_MARGIN &&
        Math.abs(p[2] - trayPos[2]) < TRAY_HALF + GRAB_MARGIN &&
        p[1] > trayPos[1] - GRAB_MARGIN && p[1] < trayPos[1] + .1;

    inputEvents.onPress = hand => {
        let p = inputEvents.pos(hand);
        if (!p)
            return;
        if (small) {
            let best = null, bestDist = REACH;
            for (let tree of trees)
                for (let apple of tree.apples)
                    if (apple.isOn && cg.distance(p, applePos(tree, apple)) < bestDist) {
                        best = { tree, apple };
                        bestDist = cg.distance(p, applePos(tree, apple));
                    }
            if (best && !held[hand]) {
                best.apple.isOn = false;
                held[hand] = KINDS[best.tree.kind].apple;
                paintTree(best.tree);
            }
        }
        else if (isOverTray(p)) {
            if (!grab)
                grab = { hand, offset: cg.subtract(trayPos, p) };
        }
        else {
            let empty = trees.find(tree => !applesLeft(tree));
            let sample = hitSample(hand);
            if (empty && sample)
                plantTree(empty, sample.kind, 1 + Math.floor(5 * Math.random()));
        }
    }

    inputEvents.onDrag = hand => {
        let p = inputEvents.pos(hand);
        if (grab && grab.hand == hand && p)
            trayPos = cg.add(p, grab.offset);
    }

    inputEvents.onRelease = hand => {
        if (grab && grab.hand == hand) {
            let limitX = TABLE.halfW - TRAY_HALF, limitZ = TABLE.halfD - TRAY_HALF;
            trayPos = [Math.max(TABLE.x - limitX, Math.min(TABLE.x + limitX, trayPos[0])),
            TABLE.y,
            Math.max(TABLE.z - limitZ, Math.min(TABLE.z + limitZ, trayPos[2]))];
            grab = null;
        }
        if (held[hand]) {
            held[hand] = null;
            nPicked++;
        }
    }

    model.animate(() => {

        let pressed = buttonState.right[4] && buttonState.right[4].pressed;
        if (pressed && !wasPressed && !grab && !held.left && !held.right) {
            small = !small;
            if (small)
                viewM = miniatureMatrix();
        }
        wasPressed = pressed;

        world.setMatrix(small ? viewM : cg.mIdentity());
        room.setMatrix(small ? cg.mIdentity() : cg.mScale(0, 0, 0));
        tray.setMatrix(cg.mTranslate(trayPos[0], trayPos[1], trayPos[2]));

        avatar.setMatrix(small ? cg.mScale(0, 0, 0) : cg.mIdentity());
        if (!small) {
            let toTable = cg.mInverse(miniatureMatrix());
            let headM = cg.mMultiply(toTable, headMatrix());
            head.setMatrix(headM);
            let feet = cg.add(trayPos, SPOT);
            let neckY = headM[13] - .1 / K;
            body.identity().move(feet[0], (feet[1] + neckY) / 2, feet[2])
                .scale(.14 / K, (neckY - feet[1]) / 2, .14 / K);
            for (let hand in avatarHand) {
                let m = clientState.hand(clientID, hand);
                avatarHand[hand].setMatrix(m ? cg.mMultiply(cg.mMultiply(toTable, m), cg.mScale(.05, .05, .05))
                    : cg.mScale(0, 0, 0));
            }
        }

        let hasEmpty = trees.some(tree => !applesLeft(tree));
        hoverSample = null;
        if (!small && hasEmpty)
            hoverSample = hitSample('right') || hitSample('left');
        for (let tree of samples) {
            let s = SAMPLE_SCALE / K * (tree == hoverSample ? 1.25 : hasEmpty ? 1 + .05 * Math.sin(5 * model.time) : 1);
            tree.node.identity().move(tree.base).scale(s);
        }

        for (let hand in heldNode) {
            let p = inputEvents.pos(hand);
            if (held[hand] && p)
                heldNode[hand].identity().move(p).scale(APPLE_R).color(held[hand]);
            else
                heldNode[hand].identity().scale(0);
        }

        tally.identity().move(TABLE.x, TABLE.y + .3, TABLE.z - TABLE.halfD)
            .scale(.03).info('Apples picked: ' + nPicked);
    });
}

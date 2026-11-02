/*
   This shows how to incorporate GLTF models that were
   previously created in external modeling programs.
*/

import * as global from "../global.js";
import { quat } from "../render/math/gl-matrix.js";
import { Node } from "../render/core/node.js";
import { Gltf2Node } from "../render/nodes/gltf2.js";
import { buttonState } from "../render/core/controllerInput.js";

let K = 100;
let SPOT = [0.1, 0.1, 0.1];
let EYE = 1.6;



let world = new Node();
let buddha = new Gltf2Node({ url: './media/gltf/buddha_statue_broken/scene.gltf' });

export const init = async model => {
    buddha.translation = [0, 0, 0];
    buddha.scale = [1.3, 1.3, 1.3];
    world.addNode(buddha);
    global.gltfRoot.addNode(world);

    let sphere = model.add('sphere')
        .move(SPOT[0], EYE / K, SPOT[2])
        .scale(0.05)
        .color(1, 0, 0);

    let small = false, wasPressed = false;

    model.animate(() => {
        let pressed = buttonState.right[0].pressed;
        if (pressed && !wasPressed)
            small = !small;
        wasPressed = pressed;

        let s = small ? K : 1;
        world.scale = [s, s, s];
        world.translation = small ? [-K * SPOT[0], 0, -K * SPOT[2]] : [0, 0, 0];

        sphere.opacity(small ? 0 : 1);
    });
}


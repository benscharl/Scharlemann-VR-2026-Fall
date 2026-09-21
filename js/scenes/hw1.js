import { ControllerBeam } from "../render/core/controllerInput.js";

let NUMBER_OF_MARKS = 40;
const NOTCH = 2*Math.PI / NUMBER_OF_MARKS;

export const init = async model => {
   let beamL = new ControllerBeam(model, 'left');
   let beamR = new ControllerBeam(model, 'right');

   let dial_hub = model.add().move(0, 1.4, 0);
   let face = dial_hub.add();

    face.add('tubeZ').scale(.08, .08, .015).color(.3, .3, .35);

    dial_hub.add('coneY')
        .move(0, .095, .016)
        .turnZ(Math.PI)
        .scale(.008, .012, .008)
        .color(.9,.9,.2);
    
    for (let n = 0; n < NUMBER_OF_MARKS; n++) {
        let big = n % 5 == 0;
        face.add('cube')
            .turnZ(n*2*Math.PI / NUMBER_OF_MARKS)
            .move(.07, 0, .016)
            .scale(big ? .010 : .005, .0025, .001)
            .color(big ? .9 : .6, big ? 0 : .6, big ? 0 : .6);
    }
    let plate = dial_hub.add('square').move(0, 0, .0155).scale(.08, .08, 1).opacity(0);

    let angle = 0, prevA = 0, prevN = 0;
    let grabbing = false, on_plate = false;

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
            if (delta > Math.PI) d -= 2*Math.PI;
            if (delta < -Math.PI) d += 2*Math.PI;
            angle += delta;
                }
        prevA = a;

        face.identity().turnZ(angle);

        let n = Math.round(angle/NOTCH);
        if (n != prevN) {
            vibrate('right', 1, 20);
            prevN = n;
        }
    });
}
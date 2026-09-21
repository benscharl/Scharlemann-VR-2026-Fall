import { ControllerBeam } from "../render/core/controllerInput.js";

let NUMBER_OF_MARKS = 40;

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

    let angle = 0, prevA = 0, hit_previous_frame = false;
    model.animate(() => {
        beamR.update();
        let uvd = beamR.hitRect(plate.getGlobalMatrix());
        let hit_this_frame = false;
        if (uvd) {
            let u = uvd[0], v = uvd[1];
            if (u*u + v*v > .04) {
                hit_this_frame = true;
                let a = Math.atan2(v, u);
                if(hit_previous_frame) {
                    let d = a - prevA;
                    if (d > Math.PI) d -= 2*Math.PI;
                    if (d < -Math.PI) d += 2*Math.PI;
                    angle += d;
                }
                prevA = a;
            }
        }
        hit_previous_frame = hit_this_frame;

        face.identity().turnZ(angle);
    });
}
import * as cg from '../render/core/cg.js';
import { stl } from '../render/core/stl.js';
import { buttonState } from '../render/core/controllerInput.js';

// DIGITAL DOUBLE OF AN SO101 EDUCATIONAL ROBOT ARM

let motion = time => [         // EXAMPLE OF JOINT ANIMATION INPUT FOR THE ROBOT ARM
  .3 * Math.cos(time * 1.2),
  .3 * Math.sin(time * 1.3),
  .3 * Math.cos(time * 1.4),
  .3 * Math.sin(time * 1.5),
  .3 * Math.cos(time * 1.6),
  .2 * Math.sin(time * 1.7)
];

const TABLE_Y = 1.5;
const ARC_R  = .035; 
const ARC_W  = .0015;
const DIAL_COLOR  = [.3,.8,1];
const LABEL_PULL  = .06;
const MIN_EYE_DIST = .15;
const dir = [-1, 1, 1, 1, -1, -1];

const GHOST_COLOR   = [.4,.8,1];
const GHOST_OPACITY = .35;
const MAX_SPEED     = 1;

const poses = [                     // EXAMPLE TARGET POSES
   [  0 ,  0 ,  0 ,  0 ,  0 ,  0 ],
   [ .6 , -.4,  .5,  .6,  0 ,  .8],
   [-.6 , -.6,  .9,  .4,  .5,  0 ],
];

export const init = async model => {
   const printed = [1,.82,.12], motor = [.1,.1,.1];     // COLOR PALETTE FOR THE ROBOT PARTS

   // THE MESH OF EACH LINK IS THE NAME OF A FILE IN media/stl/SO101. EACH LINK'S xyz AND rpy ARE RELATIVE TO THAT LINK'S FRAME.

   const links = {
      base_link: [
         { stl: 'base_motor_holder_so101_v1'       , xyz: [-0.00636471, -0.0000994414, -0.0024], rpy: [1.5708, 0, 1.5708], color: printed },
         { stl: 'base_so101_v2'                    , xyz: [-0.00636471, 0, -0.0024], rpy: [1.5708, 0, 1.5708], color: printed },
         { stl: 'sts3215_03a_v1'                   , xyz: [0.0263353, 0, 0.0437], rpy: [0, 0, 0], color: motor },
         { stl: 'waveshare_mounting_plate_so101_v2', xyz: [-0.0309827, -0.000199441, 0.0474], rpy: [1.5708, 0, 1.5708], color: printed },
      ],
      shoulder_link: [
         { stl: 'sts3215_03a_v1'            , xyz: [-0.0303992, 0.000422241, -0.0417], rpy: [1.5708, 1.5708, 0], color: motor },
         { stl: 'motor_holder_so101_base_v1', xyz: [-0.0675992, -0.000177759, 0.0158499], rpy: [1.5708, -1.5708, 0], color: printed },
         { stl: 'rotation_pitch_so101_v1'   , xyz: [0.0122008, 0.0000222413, 0.0464], rpy: [-1.5708, 0, 0], color: printed },
      ],
      upper_arm_link: [
         { stl: 'sts3215_03a_v1'    , xyz: [-0.11257, -0.0155, 0.0187], rpy: [-3.14159, 0, -1.5708], color: motor },
         { stl: 'upper_arm_s0101_v1', xyz: [-0.065085, 0.012, 0.0182], rpy: [3.14159, 0, 0], color: printed },
      ],
      lower_arm_link: [
         { stl: 'under_arm_so101_v1'         , xyz: [-0.0648499, -0.032, 0.0182], rpy: [3.14159, 0, 0], color: printed },
         { stl: 'motor_holder_so101_wrist_v1', xyz: [-0.0648499, -0.032, 0.018], rpy: [-3.14159, 0, 0], color: printed },
         { stl: 'sts3215_03a_v1'             , xyz: [-0.1224, 0.0052, 0.0187], rpy: [-3.14159, 0, -3.14159], color: motor },
      ],
      wrist_link: [
         { stl: 'sts3215_03a_no_horn_v1'   , xyz: [0, -0.0424, 0.0306], rpy: [1.5708, 1.5708, 0], color: motor },
         { stl: 'wrist_roll_pitch_so101_v2', xyz: [0, -0.028, 0.0181], rpy: [-1.5708, -1.5708, 0], color: printed },
      ],
      gripper_link: [
         { stl: 'sts3215_03a_v1'              , xyz: [0.0077, 0.0001, -0.0234], rpy: [-1.5708, 0, 0], color: motor },
         { stl: 'wrist_roll_follower_so101_v1', xyz: [0, -0.000218214, 0.000949706], rpy: [-3.14159, 0, 0], color: printed },
      ],
      gripper_frame_link: [],
      moving_jaw_so101_v1_link: [
         { stl: 'moving_jaw_so101_v1', xyz: [0, 0, 0.0189], rpy: [0, 0, 0], color: printed },
      ],
   };

   const joints = [
      { name: 'shoulder_pan' , parent: 'robotBaseFrame', xyz: [ 0.0388353,  0          ,  0.0624   ], rpy: [ 3.14159, 0        , -3.14159], lo: -1.91986 , hi: 1.91986, link: 'shoulder_link'            },
      { name: 'shoulder_lift', parent: 'shoulder_pan'  , xyz: [-0.0303992, -0.0182778  , -0.0542   ], rpy: [-1.5708 ,-1.5708   ,  0      ], lo: -1.74533 , hi: 1.74533, link: 'upper_arm_link'           },
      { name: 'elbow_flex'   , parent: 'shoulder_lift' , xyz: [-0.11257  , -0.028      ,  0        ], rpy: [ 0      , 0        ,  1.5708 ], lo: -1.69    , hi: 1.69   , link: 'lower_arm_link'           },
      { name: 'wrist_flex'   , parent: 'elbow_flex'    , xyz: [-0.1349   ,  0.0052     ,  0        ], rpy: [ 0      , 0        , -1.5708 ], lo: -1.65806 , hi: 1.65806, link: 'wrist_link'               },
      { name: 'wrist_roll'   , parent: 'wrist_flex'    , xyz: [ 0        , -0.0611     ,  0.0181   ], rpy: [ 1.5708 , 0.0486795,  3.14159], lo: -2.74385 , hi: 2.84121, link: 'gripper_link'             },
      { name: 'gripper'      , parent: 'wrist_roll'    , xyz: [ 0.0202   ,  0.0188     , -0.0234   ], rpy: [ 1.5708 , 0        ,  0      ], lo: -0.174533, hi: 1.74533, link: 'moving_jaw_so101_v1_link' },
      { name: 'gripper_frame', parent: 'wrist_roll'    , xyz: [-0.0079   , -0.000218121, -0.0981274], rpy: [ 0      , 3.14159  ,  0      ], fixed: true,                link: 'gripper_frame_link'       },
   ];

   for (const meshList of Object.values(links))         // START LOADING THE ROBOT PARTS
      for (let mesh of meshList)
            stl('SO101/' + mesh.stl);

   let robotBaseFrame = model.add().move(-.1,1.5,0).turnX(-Math.PI/2);

   let node = {};                                        // CREATE THE KINEMATIC JOINT HIERARCHY
   node['robotBaseFrame'] = robotBaseFrame;
   for (let j of joints)
      node[j.name] = node[j.parent].add();

      // CREATE THE GRIPPER DROP LINE ANNOTATION: TIP MARKER, VERTICAL LINE, FOOT MARKER AND DISTANCE LABEL.

   clay.defineTextMesh('dropText', '0 mm');

   let drop      = model.add();
   let tipMarker = drop.add('sphere');
   let dropLine  = drop.add('tubeZ');
   let footMark  = drop.add('tubeY');
   let label     = drop.add();
   let labelText = label.add('dropText');
   let lastText  = '0 mm';

   let arcPath = (a0, a1) => {
      let path = [];
      for (let k = 0 ; k <= 24 ; k++) {
         let a = a0 + (a1 - a0) * k / 24;
         path.push([ ARC_R * Math.cos(a), ARC_R * Math.sin(a), 0 ]);
      }
      return path;
   }

   let gauges = [];
   for (let i = 0 ; i < 6 ; i++) {
      let j = joints[i];
      let a0 = Math.min(dir[i] * j.lo, dir[i] * j.hi);
      let a1 = Math.max(dir[i] * j.lo, dir[i] * j.hi);

      clay.definePathsMesh('arc' + i, ARC_W, [ arcPath(a0, a1) ]);

      let frame = node[j.parent].add()
                     .move(j.xyz).turnZ(j.rpy[2]).turnY(j.rpy[1]).turnX(j.rpy[0]);
      frame.add('arc' + i).color(DIAL_COLOR);
      let label = model.add();
      gauges.push({ frame, label,
                    needle: frame.add('tubeZ').color(DIAL_COLOR),
                    text  : label.add('angleText' + i).color(DIAL_COLOR),
                    last  : '0 deg' });
   }

   let pullTowardEye = (p, eye) => {
      let d    = cg.distance(p, eye);
      let pull = Math.max(0, Math.min(LABEL_PULL, d - MIN_EYE_DIST));
      return { pos: cg.mix(p, eye, pull / d), shrink: (d - pull) / d };
   }

   let ghost = { robotBaseFrame: robotBaseFrame.add().opacity(GHOST_OPACITY) };
   for (let j of joints)
      ghost[j.name] = ghost[j.parent].add();

   let current   = [0,0,0,0,0,0]; 
   let target    = [0,0,0,0,0,0];
   let move      = null;
   let poseIndex = 0, wasNext = false, wasGo = false;

   let poseNodes = (nodes, angles) => { 
      let i = 0;
      for (let j of joints) {
         let z = j.rpy[2], y = j.rpy[1], x = j.rpy[0];
         switch (i) {
         case 0: case 2: case 3: z += angles[i]; break;
         case 1: case 4: case 5: y += angles[i]; break;
         }
         nodes[j.name].identity().move(j.xyz).turnZ(z).turnY(y).turnX(x);
         i++;
      }
   }

   model.animate(() => {
      for(let mesh of links['base_link']) {             // CREATE THE ROBOT BASE
         let partName = 'SO101/' + mesh.stl;
         if (clay.formMesh(partName) && ! mesh.part)
            mesh.part = node['robotBaseFrame'].add(partName).move(mesh.xyz)
                                                            .turnZ(mesh.rpy[2])
                                                            .turnY(mesh.rpy[1])
                                                            .turnX(mesh.rpy[0])
                                                            .color(mesh.color);
      }

      for(let j of joints)                              // CREATE THE ALL THE OTHER ROBOT PARTS
      for(let mesh of links[j.link]) {
         let partName = 'SO101/' + mesh.stl;
         if (clay.formMesh(partName) && ! mesh.part)
            mesh.part = node[j.name].add(partName).move(mesh.xyz)
                                                  .turnZ(mesh.rpy[2])
                                                  .turnY(mesh.rpy[1])
                                                  .turnX(mesh.rpy[0])
                                                  .color(mesh.color);
      }

      //let m = [0,0,0,0,0,0];
      //let m = motion(model.time);
      let m = current;

      let i = 0;                                        // ANIMATE THE ROBOT
      for (let j of joints) {  
         let z = j.rpy[2], y = j.rpy[1], x = j.rpy[0];
         switch (i) {
         case 0: case 2: case 3: z += m[i]; break;
         case 1: case 4: case 5: y += m[i]; break;
         }
         node[j.name].identity().move(j.xyz).turnZ(z).turnY(y).turnX(x);
         i++;
      }

      let toModel = cg.mInverse(model.getGlobalMatrix());
      let tip     = cg.mTransform(toModel, node['gripper_frame'].getGlobalPos());
      let foot    = [tip[0], TABLE_Y, tip[2]];
      let h       = tip[1] - TABLE_Y;
      let color   = [1,1,1];
      let eye = cg.mTransform(toModel, clay.root().inverseViewMatrix(0).slice(12,15)); 

      tipMarker.identity().move(tip).scale(.004).color(color);
      footMark .identity().move(foot).scale(.008,.0005,.008).color(color);
      dropLine.identity().link(tip, foot, .0008).color(color);


      let text = Math.round(h * 1000) + ' mm';
      if (text != lastText) {
         clay.defineTextMesh('dropText', text);
         lastText = text;
      }

      label.identity().move(tip[0] + .02, (tip[1] + TABLE_Y) / 2, tip[2])   // BESIDE THE MIDDLE OF THE LINE
           .faceViewer();
      labelText.identity().scale(.5)                                 // HALF SIZE: ~12 mm TALL
               .move(-.019 * text.length / 2, .0125, 0)              // CENTER THE TEXT ON THE LABEL POINT
               .color(color);

      for (let i = 0 ; i < 6 ; i++) {
         let g = gauges[i], q = m[i];

         let a = dir[i] * q;
         g.needle.identity().link([0,0,0], [ ARC_R * Math.cos(a), ARC_R * Math.sin(a), 0 ], .001);

         let text = Math.round(q * 180 / Math.PI) + ' deg';
         if (text != g.last) {
            clay.defineTextMesh('angleText' + i, text);
            g.last = text;
         }

         let tip = cg.mTransform(g.frame.getGlobalMatrix(),
                                 [ 1.4 * ARC_R * Math.cos(a),
                                   1.4 * ARC_R * Math.sin(a), 0 ]);
         let { pos, shrink } = pullTowardEye(cg.mTransform(toModel, tip), eye);

         g.label.identity().move(pos).faceViewer();
         g.text .identity().scale(.35 * shrink)
                .move(-.019 * text.length / 2, .0125, 0);
      }

      for (let j of joints)
         for (let mesh of links[j.link]) {
            let partName = 'SO101/' + mesh.stl;
            if (clay.formMesh(partName) && ! mesh.ghost)
               mesh.ghost = ghost[j.name].add(partName).move(mesh.xyz)
                                                      .turnZ(mesh.rpy[2])
                                                      .turnY(mesh.rpy[1])
                                                      .turnX(mesh.rpy[0])
                                                      .color(GHOST_COLOR);
         }

      let next = buttonState.right[0].pressed;
      if (next && ! wasNext && ! move)
         target = poses[poseIndex = (poseIndex + 1) % poses.length].slice();
      wasNext = next;

      let go = buttonState.left[0].pressed;
      if (go && ! wasGo && ! move) {
         let farthest = Math.max(...target.map((t, i) => Math.abs(t - current[i])));
         move = { from: current.slice(), start: model.time, duration: Math.max(farthest / MAX_SPEED, .3) };
      }
      wasGo = go;

      if (move) { 
         let u = Math.min(1, (model.time - move.start) / move.duration);
         let s = u * u * (3 - 2 * u); 
         current = cg.mix(move.from, target, s);
         if (u == 1)
            move = null;
      }

      poseNodes(ghost, target); 
      let differs = target.some((t, i) => Math.abs(t - current[i]) > .01);
      ghost.robotBaseFrame.opacity(differs ? GHOST_OPACITY : 0);
   });
}

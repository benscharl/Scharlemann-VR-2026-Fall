export const rng = seed => {
   let a = (seed * 2654435761) >>> 0;
   return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
   };
};

const pick  = (random, list) => list[Math.floor(random() * list.length)];
const range = (random, lo, hi) => lo + (hi - lo) * random();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const shade = (c, s) => [c[0] * s, c[1] * s, c[2] * s];
const box = (parent, x, y, z, w, h, d, color) =>
   parent.add('cube').move(x, y + h / 2, z).scale(w / 2, h / 2, d / 2).color(color[0], color[1], color[2]);

const can = (parent, x, y, z, r, h, color) =>
   parent.add('tubeY').move(x, y + h / 2, z).scale(r, h / 2, r).color(color[0], color[1], color[2]);


const glassColors = [[.35,.50,.65], [.25,.40,.45], [.55,.45,.35], [.20,.24,.30], [.45,.60,.70]];
const frameColors = [[.85,.85,.85], [.60,.62,.65], [.15,.15,.17], [.75,.70,.60]];

export const skyscraper = (parent, options = {}) => {
   const random = rng(options.seed ?? 1);
   const width  = clamp(options.width  ?? range(random, 16, 26), 10, 40);
   const depth  = clamp(options.depth  ?? range(random, 16, 26), 10, 40);
   const height = clamp(options.height ?? range(random, 60, 160), 30, 300);
   const shape  = options.shape ?? pick(random, ['stepped', 'stepped', 'slab', 'round']);
   const crown  = options.crown ?? pick(random, ['antenna', 'spire', 'flat']);
   const glass  = options.color ?? pick(random, glassColors);
   const frame  = pick(random, frameColors);
   const bandGap = pick(random, [7, 10.5, 14]);

   const node = parent.add().move(options.x ?? 0, 0, options.z ?? 0).turnY(options.rotation ?? 0);
   box(node, 0, 0, 0, width + 1, 6, depth + 1, shade(frame, .6));

   const tiers = shape == 'stepped' ? 2 + Math.floor(random() * 3) : 1;
   let y = 6, w = width, d = depth;
   for (let t = 0 ; t < tiers ; t++) {
      const h = (height - 6) / tiers;
      if (shape == 'round')
         can(node, 0, y, 0, w / 2, h, glass);
      else
         box(node, 0, y, 0, w, h, d, glass);
      for (let by = y + bandGap ; by < y + h - 1 ; by += bandGap)
         if (shape == 'round')
            can(node, 0, by, 0, w / 2 + .15, .8, frame);
         else
            box(node, 0, by, 0, w + .3, .8, d + .3, frame);

      y += h;
      w *= .75;
      d *= .75;
   }
   w /= .75;
   d /= .75;

   if (crown == 'antenna') {
      box(node, 0, y, 0, w * .5, 3, d * .5, frame);
      can(node, 0, y + 3, 0, .3, height * .15, [.8,.8,.8]);
      node.add('sphere').move(0, y + 3 + height * .15, 0).scale(.6).color(1, .2, .1);
   }
   else if (crown == 'spire') {
      const h = height * .12;
      node.add('pyramidY').move(0, y + h / 2, 0).scale(w * .7071, h / 2, d * .7071).color(frame[0], frame[1], frame[2]);
   }
   else {
      box(node, 0, y, 0, w + .4, 1.2, d + .4, frame);
   }
   return node;
};

export const streetGrid = (parent, options = {}) => {
   const cols      = options.cols ?? 2;
   const rows      = options.rows ?? 2;
   const blockSize = options.blockSize ?? 60;
   const street    = options.street ?? 14;
   const cx = options.x ?? 0, cz = options.z ?? 0;

   const pitch  = blockSize + street;
   const totalW = cols * pitch + street;
   const totalD = rows * pitch + street;

   box(parent, cx, -1, cz, totalW, 1, totalD, [.22,.22,.24]);

   const blocks = [];
   for (let c = 0 ; c < cols ; c++)
      for (let r = 0 ; r < rows ; r++) {
         const x = cx - totalW / 2 + street + blockSize / 2 + c * pitch;
         const z = cz - totalD / 2 + street + blockSize / 2 + r * pitch;
         box(parent, x, 0, z, blockSize, .3, blockSize, [.72,.72,.70]);
         blocks.push({ x, z, size: blockSize, col: c, row: r });
      }
   for (let c = 0 ; c <= cols ; c++)
      box(parent, cx - totalW / 2 + street / 2 + c * pitch, 0, cz, .4, .05, totalD, [.95,.85,.3]);
   for (let r = 0 ; r <= rows ; r++)
      box(parent, cx, 0, cz - totalD / 2 + street / 2 + r * pitch, totalW, .05, .4, [.95,.85,.3]);

   return blocks;
};

export const lots = (block, count = 3, inset = 8) => {
   const result = [];
   const half = block.size / 2;
   const long  = block.size;
   const short = block.size - 4 * inset;
   for (let i = 0 ; i < count ; i++) {
      const t = (i + .5) / count * long - half;
      result.push({ x: block.x + t, z: block.z + half - inset, rotation: 0,       width: long / count });
      result.push({ x: block.x - t, z: block.z - half + inset, rotation: Math.PI, width: long / count });
   }
   if (short > 0)
      for (let i = 0 ; i < count ; i++) {
         const t = (i + .5) / count * short - short / 2;
         result.push({ x: block.x + half - inset, z: block.z - t, rotation:  Math.PI / 2, width: short / count });
         result.push({ x: block.x - half + inset, z: block.z + t, rotation: -Math.PI / 2, width: short / count });
      }
   return result;
};

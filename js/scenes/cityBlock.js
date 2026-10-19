import * as city from '../util/city.js';

export const init = async model => {
   const root = model.add().move(0, .8, -.6).scale(.005);

   const blocks = city.streetGrid(root, { cols: 2, rows: 2, blockSize: 60, street: 14 });

   for (const block of blocks) {
      const seed = 100 * block.col + 10 * block.row;
      const quarters = [[-15, -15], [15, -15], [-15, 15], [15, 15]];
      quarters.forEach(([dx, dz], i) => {
         city.skyscraper(root, {
            x: block.x + dx,
            z: block.z + dz,
            height: 70 + 90 * (1 - block.row) * (dz < 0 ? 1 : .5) + 20 * i,
            seed: seed + i
         });
      });
   }
};

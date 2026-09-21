export default () => {
   return {
      enableSceneReloading: true,
      scenes: [ 
            { name: "simple"   , path: "./simple.js"   , public: true },
            { name: "shapes"   , path: "./shapes.js"   , public: true },
            { name: "jointed"  , path: "./jointed.js"  , public: true },
            { name: "interact" , path: "./interact.js" , public: true },
            { name: "beam"     , path: "./beam.js"     , public: true },
            { name: "dial"     , path: "./hw1.js"      , public: true },
      ]
   };
}

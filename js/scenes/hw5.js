import { AIQuery } from "../util/aiquery.js";
import * as city from "../util/city.js";

const cityImportRegex = /^\s*import \* as city from ['"]\.\.\/util\/city\.js['"];?\s*$/m;

const systemPrompt = [
   "You write layout code for a WebXR tabletop city built from Clay primitives.",
   "Output ONLY JavaScript code (no markdown, no explanations).",
   "The file must start with exactly this line:",
   "import * as city from '../util/city.js';",
   "followed by: export const init = async model => { ... };",
   "",
   "Rules:",
   "- Build with the city.* functions wherever possible (skyscraper, streetGrid, lots, rng).",
   "- Vary buildings through their options and seeds. Same seed = same look; a different seed = a different variant.",
   "- You may write new helper functions inside init for building types the library lacks (houses, parks, trees, bridges, ...).",
   "  Imitate the conventions in city.js: meters, buildings stand on y = 0, local front faces +Z,",
   "  every primitive spans -1..1 so scale by half sizes, and only use add(form), move, turnX/Y/Z, scale, color, opacity, animate.",
   "- Allowed forms: coneX coneY coneZ cube cubeXZ pyramidX pyramidY pyramidZ ringX ringY ringZ sphere square",
   "  octahedron torusX torusY torusZ tubeX tubeY tubeZ diskX diskY diskZ.",
   "- Keep the tabletop root line (move/scale) from the current code unless asked to change it, and add everything under that root.",
   "- Keep the existing parts of the city unless the request says otherwise.",
   "- Keep the scene below roughly 4000 primitives. Floor bands and windows add up quickly.",
   "- No other imports. No window, document, eval, setMatrix or textures."
].join("\n");

const readSource = async relativePath => {
   const url = new URL(relativePath, import.meta.url);
   url.searchParams.set("modid", Date.now());
   const response = await fetch(url);
   return response.ok ? response.text() : "";
};
const extractCode = text => {
   let code = (text || "").trim();
   const fenceStart = code.indexOf("```");
   if (fenceStart >= 0) {
      const lineEnd = code.indexOf("\n", fenceStart);
      const fenceEnd = code.indexOf("```", lineEnd);
      if (lineEnd >= 0 && fenceEnd > lineEnd)
         code = code.substring(lineEnd + 1, fenceEnd).trim();
   }
   return code;
};
const compileCity = code => new Function("city",
   code.replace(cityImportRegex, "").replace("export const init", "const init") + "\nreturn init;")(city);

export const init = async model => {
   const aiQuery = new AIQuery();
   const cityRoot = model.add();

   const example = await readSource("./cityBlock.js");
   let currentCode = example;
   const showCity = async code => {
      const cityInit = compileCity(code);
      while (cityRoot.nChildren())
         cityRoot.remove(0);
      cityRoot.animate(() => {});
      await cityInit(cityRoot);
   };
   window.cityShared = { version: 0, code: example };
   let shownVersion = 0;

   const shareCity = code => {
      cityShared = { version: Date.now(), code };
      shownVersion = cityShared.version;
      server.broadcastGlobal("cityShared");
   };

   window.resetCity = async () => {
      currentCode = example;
      await showCity(currentCode);
      shareCity(currentCode);
   };

   window.askCityCoder = async prompt => {
      console.log(`[aiCity] Sending: ${prompt}`);
      try {
         const library = await readSource("../util/city.js");

         const userContent =
            "Library source (js/util/city.js):\n" + library + "\n\n" +
            "Worked example of a city layout (js/scenes/cityBlock.js):\n" + example + "\n\n" +
            "Current city code to modify:\n" + currentCode + "\n\n" +
            "Request: " + prompt + "\n\n" +
            "Output the complete new file.";

         const response = await aiQuery.askAI("", {
            messages: [
               { role: "system", content: systemPrompt },
               { role: "user", content: userContent }
            ],
            timeout: 180000
         });
         const code = extractCode(response);
         await showCity(code);
         currentCode = code;
         shareCity(code);
         console.log("[aiCity] New city code:\n" + code);
         return code;
      } catch (err) {
         await showCity(currentCode).catch(() => {});
         console.error("[aiCity] Error:", err.message);
      }
   };
   let rebuilding = false;
   model.animate(() => {
      if (cityShared.version == shownVersion || rebuilding)
         return;
      const { version, code } = cityShared;
      shownVersion = version;
      rebuilding = true;
      showCity(code)
         .then(() => currentCode = code)
         .catch(err => console.error("[aiCity] Error building shared city:", err.message))
         .finally(() => rebuilding = false);
   });

   await showCity(currentCode);
};

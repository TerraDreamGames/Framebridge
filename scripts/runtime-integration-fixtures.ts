import { mkdir, readFile, writeFile } from "node:fs/promises";
import { keyframePackage } from "../packages/core/src/keyframe-examples";
import { particlePackage } from "../tests/particle-fixtures";
import { flatten } from "../packages/core/src/types";
import { hasParticles } from "../packages/core/src/particles";
import { advancedControlPackage } from "../packages/core/src/advanced-control-examples";
import { conditionalExamplePackage } from "../packages/core/src/conditional-examples";
import { themePackage } from "../tests/theme-fixtures";
import {
  BEHAVIOR_VERSION,
  PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE,
  selectBehaviorClient,
  BEHAVIOR_CLIENT_SOURCE,
  THEMED_BEHAVIOR_CLIENT_SOURCE,
  BEHAVIOR_BOOTSTRAP_SOURCE,
  behaviorModuleSource,
} from "../packages/core/src/behavior-runtime.mjs";
import { quoteLuau } from "../packages/core/src/source-code";

const out = ".artifacts/runtime-integration";
await mkdir(out, { recursive: true });
const keyframes=keyframePackage();
const animate=flatten(keyframes.roots).find(n=>n.id==="activate")!;
animate.behavior!.keyframes!.trigger="attribute";
animate.behavior!.keyframes!.attribute="FramebridgeAnimate";
delete animate.behavior!.keyframes!.owner;
const fixtures = {
  rules: conditionalExamplePackage(),
  themes: themePackage(),
  controls: advancedControlPackage(),
  keyframes,
  particles: particlePackage(),
};
const header = `assert(game.PlaceId==0,"Blank QA only")\nlocal Importer=(function()\n${await readFile("plugins/studio/src/Importer.luau", "utf8")}\nend)()\nlocal Http=game:GetService("HttpService")\nlocal fixtures=Http:JSONDecode(${quoteLuau(JSON.stringify(fixtures))})\nlocal runtime={version=${quoteLuau(BEHAVIOR_VERSION)},source=${quoteLuau(BEHAVIOR_CLIENT_SOURCE)},themeSource=${quoteLuau(THEMED_BEHAVIOR_CLIENT_SOURCE)},particleSource=${quoteLuau(PARTICLE_BEHAVIOR_CLIENT_SOURCE)},themeParticleSource=${quoteLuau(THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE)}}\nlocal bootstrap=${quoteLuau(BEHAVIOR_BOOTSTRAP_SOURCE)}\nlocal moduleSources=Http:JSONDecode(${quoteLuau(JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([name,pkg])=>[name,behaviorModuleSource(selectBehaviorClient(!!pkg.roots[0].themes,hasParticles(pkg.roots)))]))))})\n`;
await writeFile(
  out + "/native.luau",
  header +
    (await readFile("tests/studio-runtime-integration.test.luau", "utf8")),
);
await writeFile(
  out + "/play-setup.luau",
  header +
    `local starter=game:GetService("StarterGui")\nlocal names={}\nfor name,pkg in pairs(fixtures) do\nlocal id="__FramebridgeRuntimeQA_"..name;assert(not starter:FindFirstChild(id),"QA root exists")\nlocal stage=Importer.stage(Importer.decode(Http:JSONEncode(pkg)),{},false,runtime)\nlocal root=stage.roots[1];root.Name=id;root:SetAttribute("FramebridgeRuntimeQA",true);root.Parent=starter;table.insert(names,id)\nend\nreturn names\n`,
);
await writeFile(
  out + "/play-checks.luau",
  await readFile("tests/studio-runtime-integration-play.luau", "utf8"),
);
await writeFile(
  out + "/syntax.luau",
  `local fs=require("@lune/fs");local luau=require("@lune/luau")\nfor _,name in ipairs({"native","play-setup","play-checks"}) do luau.compile(fs.readFile("${out}/"..name..".luau")) end\nluau.compile(${quoteLuau(behaviorModuleSource(BEHAVIOR_CLIENT_SOURCE))})\nluau.compile(${quoteLuau(behaviorModuleSource(THEMED_BEHAVIOR_CLIENT_SOURCE))})\nluau.compile(${quoteLuau(behaviorModuleSource(PARTICLE_BEHAVIOR_CLIENT_SOURCE))})\nluau.compile(${quoteLuau(behaviorModuleSource(THEMED_PARTICLE_BEHAVIOR_CLIENT_SOURCE))})\nprint("Seven combined runtime fixtures compile")\n`,
);
console.log("Prepared combined runtime Edit/Play teardown fixtures");

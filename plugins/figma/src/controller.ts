import { startClassicController } from "./classic-controller";
import { startCodegenController } from "./codegen";

if (figma.editorType === "dev" && figma.mode === "codegen") {
  startCodegenController(figma);
} else {
  startClassicController();
}

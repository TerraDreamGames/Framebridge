import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
// Figma needs one self-contained HTML file. Expand the same Tailwind stylesheet
// used by Vite before esbuild embeds the UI and font assets.
export const shadcnStyles = {
  name: "framebridge-tailwind",
  setup(build) {
    build.onLoad(
      { filter: /plugins\/figma\/src\/ui\.css$/ },
      async ({ path }) => {
        const source = await readFile(path, "utf8");
        const output = await postcss([
          tailwindcss({ base: process.cwd(), optimize: true }),
        ]).process(source, { from: path });
        return {
          contents: output.css,
          loader: "css",
          resolveDir: new URL("../plugins/figma/src/", import.meta.url)
            .pathname,
        };
      },
    );
  },
};

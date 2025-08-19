import {defineConfig} from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm", "cjs"],
  target: "node18",
  platform: "node",
  sourcemap: true,
  clean: true,
  treeshake: true,
});

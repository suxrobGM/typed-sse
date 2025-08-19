import {defineConfig} from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  dts: true,
  format: ["esm", "cjs"],
  target: "es2022",
  platform: "browser",
  sourcemap: true,
  clean: true,
  treeshake: true,
  external: ["react"],
});

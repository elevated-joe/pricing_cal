import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  // Relative asset paths so the build works when served from a GitHub Pages
  // project subpath (e.g. https://<user>.github.io/pricing_cal/) as well as
  // from the domain root. The app has no client-side routing, so "./" is safe.
  base: command === "build" ? "./" : "/",
  plugins: [react()],
  test: {
    globals: true,
    environment: "node",
  },
}));

import { defineConfig } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";

// https://astro.build/config
export default defineConfig({
  output: "static",
  adapter: cloudflare({
    prerenderEnvironment: "node",
  }),
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
  },
});

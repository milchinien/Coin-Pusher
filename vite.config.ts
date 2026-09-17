import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    port: 5275,
    strictPort: true,
  },
});

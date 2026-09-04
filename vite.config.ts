/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// GitHub Pages serves from /<repo>/ ; a custom domain would use "/".
const base = process.env.VITE_BASE ?? "/madeira-bus-planner/";

export default defineConfig({
  base,
  plugins: [react()],
  worker: { format: "es" },
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

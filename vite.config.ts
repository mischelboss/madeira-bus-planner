/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// GitHub Pages serves from /<repo>/ ; a custom domain would use "/".
const base = process.env.VITE_BASE ?? "/madeira-bus-planner/";

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        // the routing blob is ~1.3 MB — precache it so repeat / offline use is instant
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        globPatterns: ["**/*.{js,css,html,json}", "data/timetable.bin.gz"],
        // shapes.json is ~4 MB and only the map needs it — cache it on first use
        globIgnores: ["**/data/shapes.json"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes("tile.openstreetmap.org"),
            handler: "CacheFirst",
            options: { cacheName: "osm-tiles", expiration: { maxEntries: 400, maxAgeSeconds: 604800 } },
          },
          {
            urlPattern: ({ url }) => url.pathname.endsWith("/data/shapes.json"),
            handler: "StaleWhileRevalidate",
            options: { cacheName: "route-shapes", expiration: { maxEntries: 2, maxAgeSeconds: 604800 } },
          },
        ],
      },
      manifest: {
        name: "Madeira Buses",
        short_name: "Madeira Buses",
        description: "Plan a bus trip across Madeira — all operators, one timetable.",
        theme_color: "#0b1c14",
        background_color: "#0b1c14",
        display: "standalone",
        start_url: base,
        scope: base,
        icons: [
          { src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" },
        ],
      },
    }),
  ],
  worker: { format: "es" },
  build: { target: "es2022" },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    globals: true,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});

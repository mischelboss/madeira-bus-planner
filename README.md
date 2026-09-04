# Madeira Bus Planner

A mobile-first journey planner for Madeira's buses — all operators (Horários do
Funchal, Rodoeste, CAM, Aerobus) merged into one timetable. Enter From/To, get
itineraries with transfers and walking legs, expand any result to its stop
sequence, flip to a map with live location. Free, no accounts, works offline
after first load.

Two tabs: **Search** (the journey planner + results) and **Browse** (the whole
route network — routes grouped by region, a live filter matching line numbers
and place names, and a per-route detail screen with weekday/weekend service
hours, the full stop list, and a route map).

Consumes the GTFS feed produced by
[`madeira-gtfs`](https://github.com/mischelboss/madeira-gtfs).

## How it works

- **Client-side routing.** `scripts/build-data.ts` packs the feed into
  `public/data/` — a binary connection table (`timetable.bin.gz`) plus small
  JSON indexes. A Connection Scan Algorithm runs in a Web Worker
  (`src/planner/csa.worker.ts`); no backend.
- **`TripPlanner` interface** (`src/planner/types.ts`) — `LocalPlanner` today, a
  hosted `RemotePlanner` can drop in later with no UI change.
- **Edge states** — past date, beyond the published timetable horizon, no more
  buses today — are explicit flags on the plan result
  (`src/planner/deriveFlags.ts`), shared with any future server.
- Stop → town names come from a one-time Nominatim reverse-geocode cached in
  `data/geocode-cache.json`.
- **Browse data** (`public/data/browse.json`) — route catalogue for the Browse
  tab: each route's fullest stop pattern, weekday/weekend hours + typical
  headway (sampled over the whole horizon), and a region grouping derived from
  the reverse-geocoded municipality of each route's outer endpoint. Off the
  `TripPlanner` interface — it's reference data, not trip planning.

## Develop

```bash
npm install
npm run build:data      # feed -> public/data/  (uses the madeira-gtfs release, or --url)
npm run geocode         # one-time: reverse-geocode stops -> data/geocode-cache.json (~34 min)
npm run dev
npm test
```

`npm run build` produces a static site (`dist/`) for GitHub Pages. The map
(`maplibre-gl`) is code-split and only loads when the user taps **Map**.

```bash
npm run build && npm run smoke:browser        # check dist/ in a real browser
npm run smoke:browser -- https://…/           # or check a deployed URL
```

`smoke:browser` drives the built site in the system Chrome and asserts the map
actually draws a route line. jsdom has no WebGL, so unit tests cannot see
MapLibre failures — and the ones that matter are bundler-level and only appear
in a production build (see `src/map/maplibreWorker.ts`).

## Data refresh

`.github/workflows/refresh-data.yml` rebuilds `public/data/` daily and whenever
`madeira-gtfs` publishes a new feed (`repository_dispatch: gtfs-published`),
opening a PR when the output changes. The cold geocode is run locally once and
committed, so CI only ever does fast incremental runs.

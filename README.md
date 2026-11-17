# Madeira Bus Planner

A mobile-first journey planner for the buses of Madeira. All four operators —
Horários do Funchal, Rodoeste, CAM and Aerobus — are merged into one timetable,
so a single search can combine lines from different companies.

**Live demo: <https://mischelboss.github.io/madeira-bus-planner/>**

[![Deploy](https://github.com/mischelboss/madeira-bus-planner/actions/workflows/deploy.yml/badge.svg)](https://github.com/mischelboss/madeira-bus-planner/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

> **Unofficial hobby project.** Not affiliated with or endorsed by any bus
> operator or public authority. Timetables can be outdated or wrong — check the
> official sources before you travel. See [Data and disclaimer](#data-and-disclaimer).

## Features

- **Journey planner.** Pick a start and a destination (autocomplete is fuzzy
  and accent-insensitive) and get several itineraries with transfers and
  walking legs. Expand any result to see its full stop sequence.
- **Honest edge cases.** A date in the past, a date beyond the published
  timetable, or "no more buses today" are shown explicitly, with the next
  departure, instead of an empty list.
- **Browse the network.** Every route grouped by region, a live filter for line
  numbers and place names, and a detail page per route with weekday and weekend
  service hours, the stop list, a timetable and a map.
- **Map.** Each leg of a journey is drawn in its line's colour; your live
  location can be shown on it.
- **Offline-capable PWA.** After the first visit, planning works without a
  connection.
- **No accounts, no tracking, no backend.** Everything runs in your browser.

## How it works

- **Client-side routing.** The timetable is packed at build time into a compact
  binary connection table (~1.3 MB gzipped). A
  [Connection Scan Algorithm](https://arxiv.org/abs/1703.05997) runs in a Web
  Worker, so the UI never blocks and no server is needed.
- **`TripPlanner` interface** (`src/planner/types.ts`). The UI only talks to
  this interface. `LocalPlanner` is the current implementation; a server-backed
  one could replace it without UI changes.
- **Explicit edge states.** Past date, beyond the timetable horizon, no more
  buses today — each is a flag on the plan result
  (`src/planner/deriveFlags.ts`), not something the UI has to infer.
- **Readable stop names.** Operator stop names like `AV Mar  E E M (11)` are
  paired with a town and, where the operator's wording matches, the real street
  name from OpenStreetMap — derived, never invented.

For the long version — data path, binary format, algorithm, time zones, UI
decisions and limitations — read **[docs/how-it-works.md](docs/how-it-works.md)**.

## Tech stack

React 19 · TypeScript · Vite · MapLibre GL · MiniSearch · vite-plugin-pwa ·
Vitest + Testing Library · Playwright (production smoke test) · oxlint ·
GitHub Actions + GitHub Pages

## Getting started

Requires Node.js 22 or newer. The packed timetable is committed in
`public/data/`, so there is nothing else to set up.

```bash
git clone https://github.com/mischelboss/madeira-bus-planner.git
cd madeira-bus-planner
npm install
npm run dev        # open the URL Vite prints (the app lives under /madeira-bus-planner/)
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm test` | Run the unit and component tests (Vitest, jsdom) |
| `npm run lint` | Lint with oxlint |
| `npm run build` | Type-check and build the static site into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run smoke:browser` | Drive `dist/` in a real Chrome and check that the map draws a route line |
| `npm run build:data` | Rebuild `public/data/` from a GTFS feed (see below) |
| `npm run geocode` | Look up the town and street of new stops via Nominatim |

The map is code-split and only loads when you tap **Map**. `smoke:browser`
exists because jsdom has no WebGL: the MapLibre failures that matter are
bundler-level and only show up in a production build (see
`src/map/maplibreWorker.ts`).

## Updating the timetable data

`npm run build:data` turns a [GTFS](https://gtfs.org) zip into the files under
`public/data/`. The output is deterministic — the same feed and geocode cache
always produce byte-identical files — so a refresh without real changes produces
no diff.

```bash
npm run build:data -- --url path/to/feed.zip        # a local zip or an https URL
```

Without `--url`, the script uses `data/feed-snapshot/latest.zip` if it exists
and otherwise downloads the feed published by `madeira-gtfs`, the companion
project that builds the island-wide feed from the operators' published
timetables. That repository is not public, so the default download only works
with an access token (`GTFS_REPO_TOKEN`). **You do not need it to run, develop
or deploy the app** — pass your own feed with `--url` if you want to rebuild.

`npm run geocode` reverse-geocodes stops through
[Nominatim](https://nominatim.org/) at no more than one request per second and
caches the result in `data/geocode-cache.json`. A cold run takes about 30
minutes; later runs only fetch new stops. Set `NOMINATIM_CONTACT` to your own
contact (e-mail or URL) when you run it, as the Nominatim usage policy asks.

### Automation

- `.github/workflows/deploy.yml` tests, builds and deploys to GitHub Pages on
  every push to `main`.
- `.github/workflows/refresh-data.yml` rebuilds `public/data/` daily and when a
  new feed is published, then opens a pull request if the output changed — data
  changes are reviewed like code changes.

## Project structure

```
src/
  planner/    Connection Scan Algorithm, Web Worker, TripPlanner interface
  screens/    Search, Results, Browse and Route detail screens
  components/ Itinerary cards, line badges, timeline, tab bar, …
  map/        MapLibre views (loaded on demand)
  lib/        Stop search, stop names, colours, formatting, data loaders
  state/      URL-based navigation state (no router library)
scripts/      Feed → packed data, geocoding, browser smoke test
public/data/  Packed timetable and JSON indexes (generated, committed)
docs/         Long-form explanation of the design
```

## Data and disclaimer

- **Unofficial.** This project is not affiliated with, authorised by or endorsed
  by Horários do Funchal, Rodoeste, CAM, Aerobus, SIGA or any other operator or
  authority. Their names are used only to say whose timetables are shown. The
  timetable data belongs to them.
- **No guarantee.** The data may be incomplete, outdated or wrong. This is a
  hobby project, provided as is. Check the official timetables
  ([SIGA](https://siga.madeira.gov.pt), [Horários do Funchal](https://www.horariosdofunchal.pt))
  before you rely on a connection.
- **Removal on request.** If an operator or authority does not want its data
  shown here, please [open an issue](https://github.com/mischelboss/madeira-bus-planner/issues).
  The affected lines will be removed from the published data within 7 days.
- **Map and place names.** Map tiles and the street and town names of stops come
  from [OpenStreetMap](https://www.openstreetmap.org/copyright), © OpenStreetMap
  contributors, available under the
  [ODbL](https://opendatacommons.org/licenses/odbl/). The basemap is loaded from
  the community-run `tile.openstreetmap.org` only when you open a map, which
  means your browser contacts that server then. Reverse geocoding uses the public
  Nominatim service at build time only.
- **Code licence.** The source code is released under the [MIT License](LICENSE).
  That licence covers the code only, not the timetable data in `public/data/`
  or the OpenStreetMap-derived data in `data/geocode-cache.json`.

## Limitations

- The planner is only as complete as the underlying feed; some lines may be
  missing, and some arrival times are estimates.
- There is no real-time data — everything comes from the published timetable.
- The planning horizon is the feed's validity period; the app says so when you
  search beyond it.
- The public OpenStreetMap tile server is fine for a hobby project, but a
  service with real traffic would need its own tile provider.

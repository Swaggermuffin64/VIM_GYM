# Vim Racing Frontend

A React + Vite application for practicing Vim motions through racing challenges.

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

## Available Scripts

| Command           | Description                                       |
| ----------------- | ------------------------------------------------- |
| `npm run dev`     | Start development server at http://localhost:3000 |
| `npm run build`   | Build for production                              |
| `npm run preview` | Preview production build locally                  |
| `npm run test`    | Run tests with Vitest                             |

## Environment Variables

Create a `.env` file in the frontend directory:

```bash
VITE_BACKEND_URL=http://localhost:3001
VITE_MATCHMAKING_URL=ws://localhost:3002
```

## Public pages and prerendering

`/`, `/about`, `/practice` and `/multiplayer` are public. Visitors see the
same screens as members -- the home menu, the practice Ready screen, the
multiplayer lobby -- and every button that would start a run or a race sends
them to sign in instead. Each screen carries a one-sentence description of the
mode, which is the crawlable copy. The branch is on session state, never on
user-agent, which would be cloaking and is a Google spam policy violation.

`scripts/prerender.mts` renders the public screens to static HTML at build
time, in Node. **Anything reachable from `src/PublicApp.tsx` must render
without a browser**: no CodeMirror, socket.io, Supabase, or `window` at module
scope, or the build fails. The practice Ready screen lives inside the editor
module, which imports CodeMirror, so `/practice` is listed in
`HEAD_ONLY_ROUTES` and gets its metadata over an empty root; the client fills
in the body. Google renders JavaScript, and link unfurlers only read `<head>`.

Per-route titles and descriptions live in one place, `src/seo/routeMeta.ts`.
Add a route there and it flows to the page metadata, the prerender, and
sitemap.xml automatically. Titles and descriptions must be unique per route;
`routeMeta.test.ts` enforces it, because identical metadata across pages is
what caused Google to collapse our search results in the first place.

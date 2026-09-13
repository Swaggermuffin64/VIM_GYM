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

`/`, `/about`, `/practice` and `/multiplayer` are public: logged-out visitors
(and search crawlers) see a marketing view, signed-in users get the app. The
route component picks the branch on session state -- never on user-agent, which
would be cloaking and is a Google spam policy violation.

The public views are rendered to static HTML at build time by
`scripts/prerender.mts`, running in Node. **Anything reachable from
`src/PublicApp.tsx` must render without a browser.** Do not import CodeMirror,
socket.io, Supabase, or anything touching `window` at module scope in a
`*Public.tsx` file or its dependencies -- the build will fail.

Per-route titles and descriptions live in one place, `src/seo/routeMeta.ts`.
Add a route there and it flows to the page metadata, the prerender, and
sitemap.xml automatically. Titles and descriptions must be unique per route;
`routeMeta.test.ts` enforces it, because identical metadata across pages is
what caused Google to collapse our search results in the first place.

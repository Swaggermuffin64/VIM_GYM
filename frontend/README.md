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

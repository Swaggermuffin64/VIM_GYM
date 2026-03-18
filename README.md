# VIM_GYM

Competitive vim motion racing. Practice alone or race others in real time.

**Play now at [vimgym.app](https://vimgym.app)**

## Features

- Real-time multiplayer racing via WebSocket
- Vim navigation and deletion tasks
- Solo practice mode
- Quick match and private rooms

## Tech Stack

- **Frontend:** React 19, Vite, CodeMirror 6 with [@replit/codemirror-vim](https://github.com/replit/codemirror-vim)
- **Backend (game server):** Fastify, Socket.IO, deployed on [Fly.io](https://fly.io)
- **Matchmaking:** Node.js, WebSocket (ws), deployed on [Fly.io](https://fly.io)

## Local Development

### Prerequisites

- Node.js 20+

### Environment Variables

Each service needs its own `.env` file:

**frontend/.env**

```
VITE_BACKEND_URL=http://localhost:3001
VITE_MATCHMAKING_URL=ws://localhost:3002
```

**backend/.env**

```
MATCH_TOKEN_SECRET=any-shared-secret-for-dev
```

**matchmaking/.env**

```
MATCH_TOKEN_SECRET=any-shared-secret-for-dev
GAME_SERVER_URL=http://localhost:3001
```

### Running

Start each service in its own terminal:

```bash
# Frontend (localhost:3000)
cd frontend && npm install && npm run dev

# Backend (localhost:3001)
cd backend && npm install && npm run dev

# Matchmaking (localhost:3002)
cd matchmaking && npm install && npm run dev
```

Solo practice works with just the frontend and matchmaking server. Matchmaking is only needed for quick match multiplayer.

## Deployment

Both the backend and matchmaking services deploy to Fly.io via GitHub Actions on push to `main`. See `.github/workflows/` for details.

## License

This project is licensed under the [GNU Affero General Public License v3.0](./LICENSE).

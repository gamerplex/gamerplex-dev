# @gamerplex/dev

Sovereign Game Development environment. Build games by chatting with AI at localhost:42069.

## Quick Start

```bash
npm install
npm start ./games/my-game
```

Open http://localhost:42069 — chat on the left, game preview on the right.

## How It Works

1. Type a game change in the chat input
2. Claude Code CLI edits the game files
3. File watcher detects the change
4. Black cat runs across the screen (meow)
5. Click "Restart Game" to apply changes
6. Repeat

## Features

- **Chat with AI** — Claude Code CLI (future: Ollama for sovereign/local)
- **Live game preview** — iframe auto-reloads on file changes
- **Screenshot capture** — grab game canvas, send with bug reports
- **Black cat** — crosses screen + meows on code changes
- **Update toast** — "Restart Game" button, never silent reloads
- **Markdown rendering** — AI responses render properly
- **Edit counter** — tracks how many changes AI has made

## Folder Structure

```
gamerplex-dev/
├── dev-server.js       — localhost:42069 (the whole app)
├── package.json
└── games/
    └── mario-test/     — test game built via the dev server
        └── index.html
```

## Related

- `gamerplex-mcp/` — MCP server with game design tools (patterns, juice, deploy)
- Port: 42069
- Thesis: Sovereign Game Development — your machine, your wallet, your game

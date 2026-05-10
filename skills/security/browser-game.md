# Browser Game Security — The Client is a Liar

## Rule #1: Never Trust the Client

The browser is the enemy's territory. Every value the client sends — score, position, health, match result — can be fabricated. Build as if every player is a hacker.

## Server-Authoritative Architecture

```
CLIENT sends:     INTENTS     { action: "move", direction: "north" }
CLIENT never:     STATE       { position: {x:100, y:200}, health: 100 }

SERVER validates:  "Can this player move north from their current position?"
SERVER updates:    Canonical game state
SERVER sends:      New state to clients
```

## Input Validation (Server-Side)

```
// Reject physically impossible inputs:
if (distance(oldPos, newPos) > MAX_SPEED * deltaTime) reject();
if (actionTimestamp < lastActionTimestamp + COOLDOWN) reject();
if (score > theoreticalMaxScore) reject();
if (health > MAX_HEALTH) reject();
```

## Score Verification (On-Chain)

For games with on-chain scores (SOAR leaderboard, wagered matches):

```
COMMIT-REVEAL PATTERN:
1. Client computes: hash = SHA256(score + nonce)
2. Client sends: hash (commits to a score without revealing it)
3. Server verifies: replays the game from input log
4. If server score matches: reveal and accept
5. If mismatch: reject, flag player

OR (simpler for Gamerplex):
- Game runs on MagicBlock ER — state is on-chain
- Score is computed by the on-chain program, not the client
- Client cannot lie because the program validates every move
```

## WebSocket Security
- Authenticate on first message (JWT, not query params)
- Rate limit: max 30 messages/second per client
- Sequence numbering: reject duplicate or out-of-order
- Heartbeat: disconnect silent clients after 10s

## Anti-Cheat Basics
- Minify/mangle JS (obfuscation, not security)
- Server-side replay validation for high scores
- Statistical anomaly detection (impossible patterns)
- Never store secrets in client code (API keys, admin tokens)

## Accessibility & Safety
- `prefers-reduced-motion`: disable screen shake, reduce particles
- Color-blind modes: shape + color, never color alone
- Volume controls: master, SFX, music separately
- Content warnings for horror/violence themes
- Report mechanism for multiplayer toxicity

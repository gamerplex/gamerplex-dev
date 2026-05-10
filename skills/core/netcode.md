# Multiplayer Netcode — MagicBlock ER Is Your Netcode

## Gamerplex Advantage: We Already Have This

MagicBlock Ephemeral Rollups IS the multiplayer infrastructure. Solana is a global state machine. Every game account is shared state that any client can read and write to via transactions. This is NOT a gap — it's our strongest technical differentiator.

Real examples already in our submodules:
- `submodules/Kamikaze-Joe/` — Real-time PvP arena, on-chain, Unity client
- `submodules/magicblock-chess/` — Multiplayer chess, on-chain state, Unity rendering
- `submodules/bolt/examples/` — BOLT ECS with position, velocity, movement systems
- `submodules/magicblock-dev-skill/` — Full Claude Code skill for ER integration
- `submodules/magicblock-engine-examples/` — 20+ examples (counter, RPS, dice, chats, sessions)

## How MagicBlock ER Replaces Traditional Netcode

## Why MagicBlock ER > Traditional Netcode

Traditional multiplayer: you build a game server, handle WebSocket connections, implement prediction/reconciliation, manage authoritative state, pay for hosting. Months of work.

MagicBlock ER: game state is an on-chain account. Both players send transactions. The blockchain IS the authoritative server. Anti-cheat is free (program validates every move). State is permanent. No server to host.

```
TRADITIONAL:                           MAGICBLOCK ER:
  Build game server       (weeks)       Write Anchor program    (days)
  WebSocket connections   (complex)     Solana RPC              (standard)
  Custom anti-cheat       (endless)     Program validates moves (built-in)
  Server hosting          ($$$)         ER runs on MagicBlock   (pennies)
  State in RAM            (lost)        State on-chain          (permanent)
  Scales with servers     (ops pain)    Scales with Solana      (not your problem)
```

## Architecture: On-Chain Multiplayer

```
Player A (browser) ──tx──→ MagicBlock ER ←──tx── Player B (browser)
                              │
                         Game Account PDA
                         (shared state, 50ms blocks)
                              │
                     On game end: commit to Solana L1
                     (permanent, verifiable)
```

## Implementation Patterns

### Client-Side Prediction
Client applies input immediately (responsive feel). Server validates later. If server disagrees, client snaps to server state.
```
client: I pressed right → move player right immediately → send input to server
server: receives input → validates → sends authoritative position
client: receives server position → if different, lerp toward it
```

### Entity Interpolation
Render remote players slightly in the past (100-200ms behind). Smoothly interpolate between known positions. Hides jitter.
```
render time = server time - 100ms
position = lerp(lastKnownPos, nextKnownPos, t)
```

### Lag Compensation
Server rewinds time when processing a player's shot to account for their latency. "Did this hit at the time the player FIRED, not when the server received it?"

## MagicBlock ER and Netcode

MagicBlock Ephemeral Rollups provide a unique netcode model:
```
- Game state is ON-CHAIN on the ER (50ms block time)
- Both clients send transactions to the ER
- ER is the authoritative server
- No custom netcode needed for turn-based games
- Real-time games (fighting, racing): still need client prediction on top
```

## Bandwidth Rules
- Send inputs (bytes), not state (kilobytes)
- Delta compression: only send what changed
- Quantize positions to integers (not floats)
- Max 20-30 packets/second per client
- Packet size under 1200 bytes (MTU safe, no fragmentation)

## BOLT ECS — The Multiplayer Framework

BOLT Entity Component System makes composable on-chain games:
```
Entity:    A game object (player, enemy, projectile) — just a u64 ID
Component: Data attached to an entity (Position { x, y }, Velocity { vx, vy }, Health { hp })
System:    Logic that operates on components (ApplyVelocity reads Velocity, writes Position)
```

Systems are Solana programs. Components are account data. Entities are PDAs. 
Multiple games can share the same components (Position is universal).

See: `submodules/bolt/examples/system-apply-velocity/` for real implementation.

## When You Still Need Client-Side Prediction

For ultra-fast games (fighting, FPS) where 50ms block time isn't fast enough:
- Client predicts locally (apply input immediately for responsiveness)
- Send transaction to ER (authoritative state updates)
- On ER response: reconcile client state with on-chain state
- Lerp to correct position if mismatch (smooth, no snap)

This is the same pattern as traditional client-side prediction, but the "server" is a blockchain.

## Install the MagicBlock Dev Skill

```bash
npx add-skill https://github.com/magicblock-labs/magicblock-dev-skill
```

This skill teaches Claude Code: delegation, undelegation, cranks, VRF, dual-connection, session keys.

## What We Don't Know Yet
- ER latency characteristics under 1000+ concurrent players
- Optimal block time for different genres (50ms good for chess, maybe too slow for FPS)
- Cross-ER communication (two ERs talking to each other for massive worlds)
- WebRTC fallback for truly latency-sensitive games (sub-16ms)

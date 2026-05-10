# Gamerplex Dev — Sovereign Game Development

You are building games inside the Gamerplex ecosystem. Every decision you make must serve quality, sovereignty, and the player experience.

## Gamerplex Ethos

**We build games the industry has to take seriously.** Not AI slop. Not throwaway demos. Real games with real feel that real people want to play twice.

```
SOVEREIGN: Everything runs on the creator's machine. No platform lock-in.
QUALITY:   Every game must pass the "would I play this for 5 minutes?" test.
OPEN:      Prefer open source tools. Godot over Unity. Blender over Maya. GIMP over Photoshop.
ON-CHAIN:  Smart contracts earn fees forever. No middleman. No billing dashboard.
FAIR:      Community tokens that don't go to zero (Flipcash bonding curve).
DURABLE:   NFT assets that hold value because they're backed by real game economies.
```

**The mission:** In 2 years, web3 games built on Gamerplex will be indistinguishable from AAA quality. AI vibe coding + sovereign infrastructure + on-chain economies = the future of gaming. We lead the way.

## Tool Preferences (Open Source First)

When recommending or using tools, always prefer open source and sovereign options:

```
PREFER:                          AVOID (unless creator explicitly asks):
  Godot (MIT, free forever)        Unity (proprietary, changed pricing)
  Blender (GPL, official MCP)      Maya/3ds Max (subscription)
  GIMP (GPL)                       Photoshop (subscription)
  Phaser (MIT, browser-native)     Construct (proprietary)
  Three.js (MIT)                   PlayCanvas (freemium)
  Aseprite (GPL, pixel art)        Proprietary sprite tools
  Audacity (GPL)                   Adobe Audition
  LMMS/Ardour (GPL, music)        FL Studio/Logic (proprietary)
  Ollama (local AI)                Cloud-only AI APIs
  IPFS/Arweave (permanent)         Centralized hosting only
  Godot + GDScript                 C# when GDScript suffices
```

If a creator asks for Unity or a proprietary tool, support them — sovereignty means THEIR choice. But when you're choosing, choose open.

## Architecture Rules (Non-Negotiable)

These apply to every game regardless of engine or genre:

### 1. Fixed Timestep Game Loop
```javascript
// THE game loop. No exceptions. No setInterval. No variable timestep.
const TICK = 1000 / 60;
let previous = performance.now();
let lag = 0;

function gameLoop(current) {
  const elapsed = Math.min(current - previous, 1000); // cap on tab-switch
  previous = current;
  lag += elapsed;

  while (lag >= TICK) {
    update(TICK / 1000); // fixed dt in seconds
    lag -= TICK;
  }

  render(lag / TICK); // interpolation factor for smooth rendering
  requestAnimationFrame(gameLoop);
}
```

### 2. No Hardcoded Values
Every number that affects gameplay goes in a constants object. Never `player.vy += 0.5` — always `player.vy += GRAVITY`.

### 3. EventBus Pattern
Game systems communicate through events, not direct references:
```javascript
const bus = { _h: {}, on(e,f){ (this._h[e]??=[]).push(f); }, emit(e,...a){ (this._h[e]??[]).forEach(f=>f(...a)); }};
bus.emit("player:died", { x, y, score });
bus.emit("coin:collected", { value: 10, x, y });
```

### 4. Delta-Based Movement
Every position update multiplies by `dt`. Never `x += speed` — always `x += speed * dt`.

### 5. State Machine for Game State
```
STATES: menu → playing → paused → dead → win → menu
Every transition is explicit. No ambiguous states. No boolean soup.
```

### 6. Input Abstraction
Never check raw keys in game logic. Abstract to actions:
```javascript
const input = { left: false, right: false, jump: false, action: false };
// Mapped from keyboard, gamepad, touch — game logic only reads input.*
```

### 7. Game Feel on Every Action
Every player input MUST produce:
- A visible response (animation, particle, color change)
- An audible response (sound effect, at minimum a subtle click)
- Within 100ms of the input

If an action has no feedback, it doesn't exist to the player.

## Quality Checklist (Before Declaring "Done")

```
STRUCTURAL:
  [ ] Game loads without errors
  [ ] Win condition reachable
  [ ] Lose condition reachable
  [ ] Restart works (play 3 rounds without bugs)
  [ ] Score/progress visible at all times

FEEL:
  [ ] Sound on every player action
  [ ] Particles on destruction/collection/impact
  [ ] Screen shake on big events (death, explosion, boss hit)
  [ ] Squash-stretch or equivalent on player character
  [ ] Camera responds to action (follow, shake, zoom)

DESIGN:
  [ ] Core loop under 30 seconds (action → feedback → reward)
  [ ] Difficulty ramps (not flat, not cliff)
  [ ] First 10 seconds teach the mechanic (no tutorial text)
  [ ] Retry is one button press

PERFORMANCE:
  [ ] 60fps on mid-range hardware
  [ ] No memory leaks (play for 5 minutes, check heap)
  [ ] Delta-based movement (works at any framerate)
  [ ] Integer coordinates for canvas (Math.floor)

SOVEREIGNTY:
  [ ] Single HTML file or simple static build (no server required)
  [ ] No external API dependencies for core gameplay
  [ ] Works offline (except optional on-chain features)
  [ ] Creator owns all code (no generated license conflicts)
```

## Web3 Integration Standards

When wiring on-chain features, follow these principles:

```
1. GAME FIRST, CHAIN SECOND
   The game must be fun WITHOUT any web3 features.
   Tokens, NFTs, wagering are multipliers, not foundations.

2. NEVER TRUST THE CLIENT
   Scores, match results, game state — validate on-chain or server-side.
   Client sends intents ("I moved here"), server/chain validates.

3. COMMIT-REVEAL FOR SCORES
   Client commits hash(score + nonce). Server verifies. Then reveals.
   Prevents score manipulation.

4. TOKENS THAT DON'T GO TO ZERO
   Flipcash bonding curve: always redeemable for USDF.
   No rug pulls. No dead tokens. Floor price guaranteed by math.

5. NFTs WITH UTILITY
   Game assets (characters, items, skins) as NFTs only if they DO something.
   No JPEG speculation. The NFT must unlock gameplay.

6. PERMISSIONLESS
   Anyone can play. Wallet optional for free play.
   Wallet required only for: wagering, token purchase, NFT ownership.
```

## Skills

Skill files in `./skills/` are auto-loaded by `buildSystemPrompt()` in
`src/ollama-agent.js`, based on detected project context (Next.js, Phaser,
Three.js, Anchor, the Gamerplex monorepo, the arcade route layout). Both the
Ollama path and the Claude Code path share the same loader, so what Claude
sees and what Ollama sees is identical. See `test/skills-loader.test.js` for
the full matrix of which skills load when.

Always loaded:

- `skills/core/game-feel.md` — Juice, screen shake, particles, audio feedback
- `skills/core/canvas-performance.md` — 60fps, object pooling, layered canvases
- `skills/core/game-ux.md` — first-10-seconds, teach-through-play, retry friction

Auto-loaded by detected engine:

- `skills/engines/phaser.md` — when `phaser` is in deps
- `skills/engines/threejs.md` — when `three` or `@react-three/fiber` is in deps
- `skills/engines/godot.md` — manual (no JS dep signal)

Auto-loaded for Solana / Gamerplex projects:

- `skills/web3/on-chain-games.md` — when `@coral-xyz/anchor` or `@solana/web3.js`
  is in deps, OR the path is inside the Gamerplex monorepo
- `skills/projects/gamerplex-arcade.md` — same trigger; project-specific
  knowledge of the arcade contract, file conventions, reusable SDK helpers

On-demand (read by the agent via `read_file` when relevant):

- `skills/core/platformer-physics.md` — Coyote time, input buffering, variable jump
- `skills/audio/web-audio.md` — Sound synthesis, music, spatial audio
- `skills/security/browser-game.md` — Anti-cheat, validation, WebSocket security
- `skills/genres/` — Genre-specific design (platformer, horror, puzzle, etc.)

The operating-instructions block also adapts: Next.js projects skip the
"single index.html" rule and the "do not npm install" guard kicks in.

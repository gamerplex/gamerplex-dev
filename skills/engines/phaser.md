# Phaser — Browser-Native 2D Game Engine (MIT License)

Phaser is the recommended engine for Gamerplex Level 1-2 fidelity browser games. Open source, massive community, works everywhere.

## Architecture

### Scene Lifecycle (execute in this order)
1. `init(data)` — receive data from previous scene
2. `preload()` — load assets (images, audio, spritesheets)
3. `create(data)` — set up game objects, physics, input
4. `update(time, delta)` — game loop (called every frame)

### Separation of Concerns
Keep gameplay state OUTSIDE Phaser scenes:
```javascript
// GameState.js — standalone, testable, no Phaser dependency
class GameState {
  score = 0;
  lives = 3;
  level = 1;
  reset() { this.score = 0; this.lives = 3; this.level = 1; }
}

// GameScene.js — only rendering and input
class GameScene extends Phaser.Scene {
  update(time, delta) {
    this.player.x += gameState.velocity.x * (delta / 1000);
  }
}
```

### Camera Strategies
- **Locked**: Camera doesn't move (single screen games)
- **Follow**: `this.cameras.main.startFollow(player, true, 0.08, 0.08)` — smooth lerp
- **Room-based**: Transition between screen-sized rooms
- **Tactical pan**: Lerp to point of interest, return to player

### Physics System Selection
- **Arcade**: AABB only, fastest, use for most 2D games
- **Matter.js**: Full physics (rotation, friction, joints) — use sparingly, heavier
- **None**: Manual collision for tile-based games (often better control)

### Frame-Rate Independence
ALWAYS multiply by delta:
```javascript
update(time, delta) {
  const dt = delta / 1000; // seconds
  player.x += speed * dt;
}
```

## Anti-Patterns (Never Do These)

| Bad | Good | Why |
|-----|------|-----|
| Guess spritesheet frame size | Measure actual pixel dimensions | Wrong frames = visual glitches |
| `setInterval` for game logic | Phaser's `update()` | Framerate-independent |
| Load assets in `update()` | Load in `preload()` | Blocks rendering |
| Deep class inheritance | Composition with components | Flexibility |
| Global mutable state | EventBus + GameState singleton | Predictable |

## Phaser + Gamerplex

Phaser games are static HTML — perfect for sovereign deployment. Export as a single bundle, deploy to Vercel/IPFS, wire Contention Markets via the Gamerplex SDK.

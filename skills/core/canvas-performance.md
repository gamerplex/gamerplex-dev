# Canvas Game Performance — Hitting 60fps Every Frame

## The Loop

Fixed timestep with variable rendering. No exceptions:
- Physics: fixed 60Hz (deterministic, reproducible)
- Rendering: as fast as the browser allows (smooth)
- Cap elapsed time to 1000ms (prevents death spiral on tab-switch)

## Object Pooling

NEVER use `new` in the game loop. Pre-allocate arrays for bullets, particles, enemies:

```javascript
const POOL_SIZE = 200;
const particles = new Array(POOL_SIZE);
let particleCount = 0;

function spawnParticle(x, y) {
  if (particleCount >= POOL_SIZE) return;
  particles[particleCount++] = { x, y, vx: 0, vy: 0, life: 1 };
}

function removeParticle(i) {
  particles[i] = particles[--particleCount]; // swap with last
}
```

## Canvas Optimization

1. **Disable alpha**: `getContext("2d", { alpha: false })` — 20-30% faster
2. **Integer coordinates**: `Math.floor(x)` for all draw calls — avoids sub-pixel anti-aliasing
3. **Batch draw calls**: One `beginPath()` + multiple `rect()` + one `fill()` — not individual `fillRect()` per object
4. **Layered canvases**: Background (rarely redraws), game (every frame), UI (on change only)
5. **Minimize state changes**: Sort draw calls by fillStyle to reduce ctx switches
6. **Avoid shadowBlur**: Extremely expensive. Use pre-rendered glow images instead
7. **Cache text**: Draw text to offscreen canvas once, blit the image each frame
8. **Viewport culling**: Only draw objects within camera bounds ± one tile margin

## Memory

- Never create objects in the game loop (no `{ }` or `new` per frame)
- Reuse arrays: `array.length = 0` to clear, not `array = []`
- Watch for string concatenation in hot paths (creates garbage)
- Profile with Chrome DevTools → Performance → check GC pauses

## DPR Handling

```javascript
const dpr = Math.min(window.devicePixelRatio || 1, 2); // cap at 2
canvas.width = displayWidth * dpr;
canvas.height = displayHeight * dpr;
ctx.scale(dpr, dpr);
canvas.style.width = displayWidth + "px";
canvas.style.height = displayHeight + "px";
```

## Mobile Performance

- Reduce particle counts by 50% on mobile (detect via touch events)
- Skip post-processing effects (bloom, blur)
- Use `will-change: transform` on canvas element for GPU compositing
- Test on a real phone, not just Chrome DevTools throttling

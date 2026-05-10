# Three.js — 3D Browser Games (MIT License)

Three.js is the recommended engine for Gamerplex Level 3 fidelity (low-poly 3D browser games).

## Architecture (4 Mandatory Modules)

Every Three.js game needs these four singletons:

### 1. EventBus
```javascript
// domain:action naming — bus.emit("player:died"), bus.emit("score:changed")
const EventBus = {
  _handlers: {},
  on(event, fn) { (this._handlers[event] ??= []).push(fn); },
  off(event, fn) { this._handlers[event] = (this._handlers[event] ?? []).filter(f => f !== fn); },
  emit(event, ...args) { (this._handlers[event] ?? []).forEach(fn => fn(...args)); },
};
```

### 2. GameState
All mutable game state in one object with a mandatory `reset()` method. Never scatter state across objects.

### 3. Constants
Zero hardcoded values. Every gameplay number in one place:
```javascript
const C = {
  GRAVITY: 9.8, PLAYER_SPEED: 5, JUMP_FORCE: 12,
  CAMERA_LERP: 0.08, PARTICLE_COUNT: 50,
};
```

### 4. Orchestrator
Sequences game phases (intro → gameplay → gameover → restart). Calls init/update/cleanup on subsystems.

## Performance Rules

1. **Cap delta time**: `Math.min(clock.getDelta(), 0.1)` — prevents physics explosion on tab-switch
2. **Cap pixel ratio**: `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`
3. **Shadows OFF by default**: Only enable if visually critical. Use baked shadows when possible
4. **No postprocessing on first pass**: Get gameplay working, add bloom/DOF later
5. **Dispose everything**: `geometry.dispose()`, `material.dispose()`, `texture.dispose()` when removing objects
6. **Instance meshes**: 1000 identical objects → `InstancedMesh`, not 1000 `Mesh` objects
7. **Frustum culling**: Enabled by default, but ensure large objects have correct bounding spheres

## Renderer Selection
- **WebGLRenderer**: Works everywhere. Default choice.
- **WebGPURenderer**: 10-100x performance for compute-heavy scenes. Check `navigator.gpu` support.

## Mobile-First Input
- Abstract all input to an `inputState` object
- Support touch: virtual joystick (left screen = move, right screen = aim)
- Gyroscope for tilt controls (optional)
- 60/40 rule: 60% of players will be mobile, design for touch first

## Gamerplex Integration

Three.js games export as static HTML + JS bundles. 3D assets (.glb) served from CDN or bundled. On-chain integration same as any browser game — Solana web3.js calls.

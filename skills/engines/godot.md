# Godot 4 — Sovereign Game Engine (MIT License, Free Forever)

Godot is the recommended engine for Gamerplex games at fidelity level 3+. It's open source, free, and nobody can change the pricing.

## Why Godot for Sovereign Game Dev

- MIT licensed — no fees, no revenue share, no telemetry
- Export to web (HTML5), mobile, desktop, console
- GDScript is purpose-built for games (faster iteration than C#)
- Active community, 90K+ GitHub stars
- Godot 4.x has modern rendering (Vulkan, compute shaders)

## Architecture Principles

### Composition Over Inheritance
Use nodes as components. Don't create deep inheritance hierarchies:
```
# YES: Small, composable nodes
Player/
  ├── Sprite2D
  ├── CollisionShape2D
  ├── HealthComponent      (custom, reusable)
  ├── HitboxComponent      (custom, reusable)
  └── StateMachine         (custom, reusable)

# NO: God classes
class Player extends CharacterBody2D extends Damageable extends Collectible...
```

### Signal Best Practices
- Name signals in past tense: `health_depleted`, `coin_collected`, `enemy_died`
- Use an EventBus autoload for cross-scene communication
- Never connect signals in `_ready` to nodes that might not exist yet — use `call_deferred`

### Strict Typing
Always type variables and function signatures:
```gdscript
var speed: float = 200.0
var health: int = 100
func take_damage(amount: int) -> void:
```

### Resource Management
- `preload()` for small, always-needed resources (sounds, small textures)
- `load()` for large or conditional resources (levels, cutscenes)
- Never load in `_process()` — always in `_ready()` or on scene enter

## Performance Rules

- Use object pooling for bullets/particles (queue_free is expensive at scale)
- Physics layers: only enable collision between layers that need it
- Use `PackedFloat32Array` / `PackedVector2Array` for large data sets
- AnimationPlayer over Tween for complex sequences
- Tween for simple UI animations (faster to code)

## Scene Organization
```
res://
├── scenes/
│   ├── player/
│   ├── enemies/
│   ├── levels/
│   └── ui/
├── scripts/
│   ├── components/     (reusable behaviors)
│   ├── resources/      (custom Resource types)
│   └── autoloads/      (singletons: EventBus, GameState, AudioManager)
├── assets/
│   ├── sprites/
│   ├── audio/
│   └── fonts/
└── project.godot
```

## Gamerplex Integration

Godot games connect to Gamerplex via HTTP calls to Solana RPC or the resolver API. Use HTTPRequest node for on-chain interactions. Web export uses JavaScript bridge for wallet connection.

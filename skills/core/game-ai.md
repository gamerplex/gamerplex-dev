# Game AI — Making Enemies and NPCs Feel Alive

## The Spectrum

```
DUMB:    Walk left. Walk right. Turn at edge.         (our current enemies)
BASIC:   Chase player when in range. Patrol otherwise.
SMART:   Pathfind around obstacles. Flank. Retreat when low HP.
SCARY:   Adapt to player behavior. Learn patterns. Surprise.
```

Every Gamerplex game should be at least BASIC. 1v1 games should be SMART (the AI opponent must feel fair).

## Finite State Machine (FSM)

The simplest AI worth implementing. Enemy has states with transitions:

```
IDLE → (sees player) → CHASE → (reaches player) → ATTACK → (player escapes) → CHASE
                                                  → (health low) → FLEE → (safe) → IDLE
                                                  → (player dies) → IDLE
```

Implementation:
```javascript
const states = {
  idle: {
    enter() { velocity = 0; playAnimation("idle"); },
    update(dt) { if (distToPlayer < SIGHT_RANGE) return "chase"; },
  },
  chase: {
    enter() { playAnimation("run"); },
    update(dt) {
      moveToward(player.x, player.y, CHASE_SPEED * dt);
      if (distToPlayer < ATTACK_RANGE) return "attack";
      if (distToPlayer > SIGHT_RANGE * 1.5) return "idle";
    },
  },
  attack: {
    enter() { playAnimation("attack"); attackTimer = ATTACK_DURATION; },
    update(dt) {
      attackTimer -= dt;
      if (attackTimer <= 0) return "chase";
    },
  },
};
```

## Behavior Trees

More flexible than FSMs for complex AI. Tree of nodes that return SUCCESS, FAILURE, or RUNNING.

```
Root (Selector — try each child until one succeeds)
├── Sequence: Attack
│   ├── Condition: playerInRange?
│   ├── Action: facePlayer
│   └── Action: attack
├── Sequence: Chase
│   ├── Condition: playerVisible?
│   └── Action: moveTowardPlayer
├── Sequence: Patrol
│   ├── Action: moveToNextWaypoint
│   └── Condition: atWaypoint?
└── Action: idle
```

## Pathfinding: A*

For any game where enemies navigate around obstacles:

```
Grid-based A*:
  1. Create a grid from your tilemap (walkable/blocked)
  2. Start node = enemy position, goal = target position
  3. For each node, calculate: f = g (distance from start) + h (heuristic to goal)
  4. Always expand the lowest f node
  5. Heuristic: Manhattan distance for 4-way, Euclidean for 8-way

OPTIMIZATION:
  - Don't pathfind every frame. Every 10-30 frames is enough
  - Cache paths. Only recalculate when target moves significantly
  - Limit search depth (max 200 nodes) to prevent lag spikes
  - Use hierarchical pathfinding for large maps (rooms → doors → rooms)
```

## Steering Behaviors

For smooth, natural-looking movement (not grid-snapping):

```
SEEK:    accelerate toward target
FLEE:    accelerate away from target  
ARRIVE:  seek but decelerate near target (no overshoot)
WANDER:  slight random steering changes (organic patrol)
AVOID:   steer away from obstacles (raycast ahead)
FLOCK:   separation + alignment + cohesion (group behavior)
```

Combine behaviors with weights: `finalForce = seek * 0.6 + avoid * 0.8 + separate * 0.3`

## AI for Gamerplex Agents

Gamerplex agents play games 24/7 for real money. They need to be:
- Good enough to provide a challenge (not trivially beaten)
- Not so good they're unbeatable (players must feel they can win)
- Varied in skill level (ELO 1200-3000 range)
- Deterministic given the same game state (for on-chain verification)

## What We Don't Know Yet
- Utility AI (scoring all possible actions) — more nuanced than behavior trees
- GOAP (Goal-Oriented Action Planning) — used in AAA stealth games
- Monte Carlo Tree Search for strategy games (used in AlphaGo)
- Machine learning for game AI (training bots via self-play)
- How to make AI feel "fair" in 1v1 matches (perceived fairness ≠ optimal play)

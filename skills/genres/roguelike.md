# Roguelike Design — Permadeath, Procedural Generation, and "One More Run"

## Why Roguelikes Are Perfect for Web3

Every run is unique. Death is permanent. Progress is knowledge, not items. This maps perfectly to on-chain games: each run is a transaction, death burns the NFT character, and the leaderboard is the permanent record.

## Core Elements

### 1. Procedural Generation
- Levels generated from templates + randomization, not fully random
- Use "room templates" stitched together — 20 hand-designed rooms shuffled > infinite random noise
- Seed-based: same seed = same dungeon (enables challenge links: "beat MY dungeon")
- Always verify path from start to exit exists (flood fill after generation)

### 2. Permadeath
- Character dies → run over → start fresh
- Optionally: meta-progression (unlock new starting items/classes between runs)
- The pain of losing must be proportional to the thrill of winning

### 3. Meaningful Choices
Every floor: choose between 2-3 paths/items/upgrades. Each choice must have clear tradeoffs:
- More damage vs more health
- New ability vs upgrade existing
- Safe path vs risky path with better rewards

### 4. Difficulty Scaling
- Enemies scale with floor number
- Player power scales with item choices
- The gap between player power and enemy power = difficulty
- Easy runs feel powerful. Hard runs feel desperate. Both are fun.

### 5. Item Synergies
The magic of roguelikes: items that combine in unexpected ways.
- Item A: "bullets bounce off walls" (okay alone)
- Item B: "bullets split into 3 on bounce" (okay alone)
- A + B: "bullets bounce AND split" (INCREDIBLE)
- Design items as modifiers to a base system, not standalone effects

## Run Structure
```
Floor 1-3:   Tutorial (weak enemies, basic items, teach mechanics)
Floor 4-6:   Ramping (harder enemies, better items, first mini-boss)
Floor 7-9:   Challenging (enemy combos, must use items wisely)
Floor 10:    Boss (tests everything learned)
Floor 11+:   Harder loops (optional, for leaderboard chasers)
```

## Gamerplex Fit
- Seed as challenge link: "Beat run #7F3A2B" (same dungeon, compete on score)
- On-chain run history (GPX1 memo format)
- Wagered runs: "I bet $5 I go further than you on this seed"
- Character NFTs: unique starting loadouts, burned on permadeath
- SOAR leaderboard: deepest floor + score

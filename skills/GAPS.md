# Gamerplex Dev — Skills Gap Analysis

**Updated:** 2026-04-10
**Purpose:** Honest assessment of what we know and what we don't. Every gap here is a risk to game quality.

---

## What We're Good At (21 skill files)

```
STRONG:
  ✅ Game feel / juice (screen shake, particles, audio, squash-stretch)
  ✅ Platformer physics (coyote time, input buffering, variable jump)
  ✅ Canvas performance (60fps, object pooling, optimization)
  ✅ Engine fundamentals (Phaser, Godot, Three.js architecture)
  ✅ Genre design (platformer, horror, puzzle, fighting, roguelike, racing, rhythm)
  ✅ Web Audio synthesis (zero-dependency sound)
  ✅ Browser security (server-authoritative, anti-cheat)
  ✅ On-chain integration (Solana, MagicBlock, Contention Markets, Flipcash)
  ✅ Sovereign architecture (open source, local-first, no lock-in)
  ✅ Multiplayer netcode (MagicBlock ER IS the multiplayer layer — not a gap, a STRENGTH)
  ✅ Game AI (pathfinding, behavior trees, FSMs, steering)
  ✅ Game UX/UI (onboarding, HUD, menus, accessibility, input)
  ✅ Testing/QA (automated smoke tests, playtesting protocols, performance profiling)

UNIQUELY STRONG (nobody else has this):
  ✅ MagicBlock ER — blockchain IS the game server (no netcode to write)
  ✅ BOLT ECS — composable on-chain game logic
  ✅ Contention Markets — atomic wagering settlement
  ✅ Flipcash — tokens that can't go to zero
  ✅ SOAR — portable on-chain leaderboards
  ✅ PER — hidden information via Intel TDX TEE
  ✅ 20+ real multiplayer examples in submodules/ (Kamikaze Joe, chess, RPS, dice, etc.)
  ✅ MagicBlock Dev Skill already written (delegation, cranks, VRF, sessions)
```

## What We're Missing (Gaps = Risk)

### PREVIOUSLY CRITICAL — Now written

| Gap | Skill File | Status |
|-----|------------|--------|
| **Multiplayer Netcode** | `skills/core/netcode.md` | ✅ WRITTEN — and MagicBlock ER means this was never really a gap, just undocumented |
| **Game AI** | `skills/core/game-ai.md` | ✅ WRITTEN |
| **Game Testing/QA** | `skills/core/testing-qa.md` | ✅ WRITTEN |
| **Game UX/UI** | `skills/core/game-ux.md` | ✅ WRITTEN |

### IMPORTANT — Professional quality requires these

| Gap | What It Is | Why It Matters | Skill File | Status |
|-----|-----------|---------------|------------|--------|
| **Game Design Documents** | Scope, specs, milestones, feature lists | Scope creep is #1 indie killer | `skills/core/game-design-doc.md` | ❌ TODO |
| **Procedural Generation** | WFC, noise, L-systems, dungeon algorithms | Core to roguelikes, replayability | `skills/core/procgen.md` | ❌ TODO |
| **Game Economy Design** | Currency sinks/faucets, inflation, loot tables | Broken economies destroy engagement. Critical for token games | `skills/web3/game-economy.md` | ❌ TODO |
| **Narrative Design** | Branching dialogue, env storytelling, pacing | Differentiates memorable from forgettable | `skills/genres/narrative.md` | ❌ TODO |
| **Accessibility (IGDA)** | Remappable controls, colorblind, subtitles, difficulty | Industry standard. Legal requirements emerging | `skills/core/accessibility.md` | ❌ TODO |
| **Game Analytics** | Funnels, session length, retention, heatmaps | Can't improve what you don't measure | `skills/core/analytics.md` | ❌ TODO |

### NICE-TO-HAVE — Polish and reach

| Gap | What It Is | Why It Matters | Status |
|-----|-----------|---------------|--------|
| **Localization/i18n** | String externalization, RTL, cultural adaptation | Global reach | ❌ TODO |
| **Pixel Art Fundamentals** | Sprites, palettes, subpixel animation | Art quality for 2D games | ❌ TODO |
| **Shader Effects** | Water, lighting, outlines, dissolves | Visual polish for 3D | ❌ TODO |
| **Marketing/Launch** | Wishlists, trailers, press, community | Don't launch into silence | ❌ TODO |
| **Monetization Ethics** | Fair F2P, cosmetic-only, anti-predatory | Gamerplex ethos demands this | ❌ TODO |

---

## Honest Weaknesses (Updated)

```
FIXED (were critical, now written):
  ✅ Netcode — was undocumented, not actually missing. MagicBlock ER + 20 examples in submodules.
  ✅ Enemy AI — skill written (FSM, behavior trees, A*, steering)
  ✅ QA — skill written (Playwright smoke tests, playtesting protocol)
  ✅ UX — skill written (10-second rule, HUD, menus, accessibility)

BUILT 2026-04-18 (sovereignty layer):
  ✅ Custom sovereign agent (ollama-agent.js) — tested working with qwen3.5:9b + tool calls
  ✅ Dual-mode support: Ollama native + OpenAI-compat (Gemini, OpenXAI, OpenAI)
  ✅ Router dispatches Anthropic → Claude Code CLI, everything else → sovereign agent
  ✅ 128K context Modelfiles (qwen3.5-coding-128k, gemma4-31b-128k)

REMAINING REAL WEAKNESSES:
  1. ECONOMY: We have Flipcash token integration but zero knowledge of
     virtual economy design — inflation, sinks, reward curves.
     Token economies without this knowledge WILL break.
     This is now our #1 gap.

  2. PROCEDURAL GENERATION: Roguelike genre skill exists but
     no actual PCG algorithms (WFC, noise, dungeon gen).
     Can't build real roguelikes without this.

  3. ACCESSIBILITY: We mention it in game-ux.md but don't have
     the full IGDA guidelines or implementation patterns.
     Industry is moving toward legal requirements.

  4. ANALYTICS: No skill for measuring whether a game is actually
     fun (retention, session length, funnel analysis).
     Building blind without this.

  5. ART DIRECTION: All our games use programmer art.
     No pixel art fundamentals, no color theory, no visual hierarchy.
     Games look "made by AI" instead of "made with care."
```

## Priority Order for Writing Missing Skills

```
NEXT SESSION:
  1. Game Design Documents template
  2. Procedural Generation (WFC + noise + dungeon gen)
  3. Game Economy Design (critical for token games)
  4. Accessibility (IGDA guidelines)

FOLLOWING SESSION:
  5. Narrative Design
  6. Game Analytics
  7. Pixel Art Fundamentals
  8. Monetization Ethics
```

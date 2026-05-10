# Gamerplex Benchmarks

Automated tests that build games through the dev server to benchmark AI backends.

## Space Invaders Build

The reference test. Builds a classic 1980s Space Invaders through 6 sequential chat prompts:

1. **Setup** — Canvas, black background, green player ship, keyboard movement
2. **Enemies** — 5x11 grid of aliens with classic sweep movement
3. **Shooting** — Space to shoot, collision detection, score counter
4. **Enemy fire** — Aliens shoot back, lives system
5. **Game states** — Game over, win, restart
6. **Juice** — Screen shake, particles, Web Audio SFX

## Usage

```bash
# Test currently active backend (default: Claude Code OAuth)
node benchmark/space-invaders.js

# Test all configured backends
node benchmark/space-invaders.js --all

# Test a specific backend
node benchmark/space-invaders.js --backend=ollama:qwen3.5:9b
```

## What Gets Measured

For each prompt:
- Duration (seconds to complete)
- File size before/after (did the AI actually edit?)
- Tool calls (Edit, Write, Read, Bash)
- Expected keywords found in output
- Validation (canvas exists? script? game loop?)

For each full run:
- Total build time
- Final file size
- Prompts completed vs failed
- **Quality score 0-100** (completion + edits + size growth)

## Results

JSON reports saved to `results/`. Games saved to `games/`.

View a game: open `games/<backend_id>/index.html` in a browser.

Compare backends: the runner prints a comparison table at the end of `--all` runs.

## Interpreting Scores

```
90-100: Production ready, all prompts completed, rich code
70-89:  Good, most prompts worked, game is playable
50-69:  Partial, some prompts failed, game may be broken
30-49:  Weak, significant failures, manual fixup needed
0-29:   Broken, couldn't follow instructions, unusable output
```

## Adding a New Benchmark

Copy `space-invaders.js`, change `PROMPTS` to the sequence for your game type (platformer, puzzle, etc.), run it. The framework handles backend switching, dev server restart, and reporting automatically.

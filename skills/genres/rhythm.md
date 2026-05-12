# Rhythm Game Design — Timing, Music, and Flow State

## Core Mechanic: Hit the Beat
Player inputs must align with music beats. The window of acceptance determines difficulty.

## Timing Windows
```
Perfect:  ±30ms   (frame-perfect, highest score)
Great:    ±60ms   (good, most players hit this)
Good:     ±100ms  (acceptable, beginners)
Miss:     >100ms  (no score, combo breaks)
```

## Audio Sync (THE Most Important Technical Challenge)
- Use Web Audio API `audioContext.currentTime` for timing — NOT `Date.now()` or `performance.now()`
- Pre-calculate beat timestamps from BPM: `beatTime = startTime + (beatIndex * 60 / BPM)`
- Visual elements must lead audio by ~50ms (brain processes visual slower than audio)
- Latency calibration option: let player tap to a beat, measure offset, apply globally

## Combo System
- Consecutive perfect/great hits build a combo multiplier
- One miss resets the multiplier (not the score)
- Visual feedback scales with combo: larger hit effects, more particles, screen pulse
- At combo milestones (10, 25, 50, 100): special celebration effect

## Chart/Map Design
- Easy: notes on strong beats only (quarter notes)
- Medium: add off-beats (eighth notes)
- Hard: sixteenth notes, holds, multi-lane
- Expert: polyrhythms, speed changes, cross-lane patterns

## Gamerplex Fit
- On-chain score verification (input timestamps provable via MagicBlock ER)
- 1v1 score battles: same song, who scores higher?
- Community charts: creators upload beat maps, earn from plays
- Music NFTs: own the chart, earn when others play it

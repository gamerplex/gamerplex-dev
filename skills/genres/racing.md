# Racing Game Design — Speed, Risk, and Ghost Data

## Core Feel
The player must FEEL fast even when the car isn't going fast. Speed is a visual trick:
- FOV increases with speed (tunnel vision effect)
- Motion blur on environment (not the car)
- Speed lines/particles stream past
- Camera pulls back slightly at high speed
- Engine sound pitch rises with speed

## Steering
- Analog steering (not binary left/right): map to mouse X position or tilt
- Drift mechanic: hold brake + turn = slide, release = boost (reward skill)
- Speed-dependent turning radius: faster = wider turns = more planning

## Track Design
- Alternate straights and curves (rhythm)
- Wide corners early, tight corners later (difficulty ramp)
- Shortcuts that are risky (jump gap, narrow passage)
- Visual guides: road markings, barriers, shadows indicate the path

## Ghost System (Critical for Gamerplex)
- Record player inputs per frame (not positions — deterministic replay)
- Ghost = translucent replay of best run
- Challenge link: "Race my ghost on Track 3"
- On-chain: ghost data stored as compressed input array via GPX1 memo

## Gamerplex Fit
- Ghost races as challenge links (async multiplayer via on-chain replays)
- 1v1 time trials via Contention Markets
- Vehicle NFTs with different stats
- SOAR leaderboard: best lap times per track

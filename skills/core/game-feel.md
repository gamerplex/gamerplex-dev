# Game Feel — The Difference Between a Toy and a Game

Every technique here is engineering, not art. Each is a function you can implement in <20 lines.

## The Rule

If the player does something and nothing happens for 100ms, the game is broken. Every input needs:
1. Visual feedback (immediate)
2. Audio feedback (immediate)
3. Physical feedback (next frame)

## Screen Shake

Displace the camera by a random offset that decays over time. Use for: impacts, explosions, death, landing.

```
shake(intensity, duration):
  each frame:
    offset.x = random(-1, 1) * intensity
    offset.y = random(-1, 1) * intensity
    intensity *= 0.85  (decay)
  apply offset to camera/canvas translate
```

Intensity guide: landing = 2px, enemy death = 3px, player death = 6px, boss hit = 8px.

## Hitstop (Freeze Frames)

Pause the game for 2-4 frames on big impacts. Creates "weight." The most underused technique in indie games.

```
hitstop(frames):
  gameSpeed = 0
  after frames: gameSpeed = 1

// In update loop:
if (gameSpeed === 0) { hitstopTimer--; if (hitstopTimer <= 0) gameSpeed = 1; return; }
```

Use for: killing an enemy, taking damage, landing a combo, parrying.

## Squash and Stretch

Deform the player sprite based on velocity. Makes movement feel alive.

```
jumping up:   scaleX = 0.8,  scaleY = 1.2   (stretched tall)
falling:      scaleX = 0.9,  scaleY = 1.1   (slightly stretched)
landing:      scaleX = 1.3,  scaleY = 0.7   (squashed wide)
idle:         scaleX = 1.0,  scaleY = 1.0
```

Transition smoothly (lerp) between states. Duration: 6-10 frames.

## Particles

Burst of small colored squares/circles on events. Every game needs these:

| Event | Count | Color | Spread | Gravity |
|-------|-------|-------|--------|---------|
| Jump | 4 | dust brown | narrow, downward | light |
| Land | 8 | dust brown | wide, upward | medium |
| Coin collect | 10 | gold | radial | light |
| Enemy death | 12 | enemy color | radial | medium |
| Player death | 20 | red | radial, wide | heavy |
| Explosion | 30 | orange+yellow | radial, wide | none (fade) |

Each particle: position, velocity, life (0-1), size, color. Update: move, apply gravity, decay life. Draw: fill rect with alpha = life.

## Score Popups

"+100" text that floats up and fades. Always accompany a score change with a popup at the event location.

## Easing

Never use linear interpolation for anything the player sees. Use ease-out for responsive feel:
```
easeOut(t) = 1 - (1 - t) ** 3
```

## Camera Follow

Never snap. Always lerp toward target with lookahead in movement direction:
```
cam.x += (target.x + lookahead - cam.x) * 0.08
```

## Sound Design Minimum

Every game needs at minimum these synthesized sounds (Web Audio API, no files):
- Jump: short high-pitched square wave blip
- Land: short low-pitched thud
- Collect: two-tone ascending chime
- Hit/damage: sawtooth buzz
- Death: descending tone
- Win: ascending three-note arpeggio
- UI click: tiny sine blip

## The Juice Checklist

Before shipping, verify every item:
- [ ] Screen shake on at least 3 events
- [ ] Particles on at least 5 events
- [ ] Sound on every player input
- [ ] Score popups on score changes
- [ ] Squash-stretch on player character
- [ ] Camera follow with smoothing
- [ ] At least one hitstop moment
- [ ] Easing on all UI transitions
- [ ] Background responds to gameplay (color shift, parallax, pulse)

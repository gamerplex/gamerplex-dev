# Game UX/UI — The First 10 Seconds Decide Everything

## The 10-Second Rule

A player decides within 10 seconds whether to keep playing. In those 10 seconds they must:
1. Understand what they control
2. Understand the goal
3. Successfully do something (move, jump, interact)
4. Receive positive feedback (sound, particle, score)

If any of these fail, they leave. No tutorial text can save a bad first 10 seconds.

## Teach Through Play, Not Text

```
BAD:  "Press SPACE to jump. Collect coins. Avoid enemies."
GOOD: (flat ground) → (gap requiring jump) → (coin above gap) → (enemy after coin)

Level design IS the tutorial:
  Screen 1: Only action possible is "move right" (walls left and above)
  Screen 2: Must jump (gap in floor)
  Screen 3: Jump to reach reward (coin on platform)
  Screen 4: Jump to avoid threat (enemy on ground)
  
  4 screens. 4 mechanics taught. Zero words.
```

## HUD Design

### What Must ALWAYS Be Visible
- Score/progress (top-left or top-center)
- Health/lives (top-left, below score)
- Timer (top-right, if applicable)
- Current state indicator (paused, game over, etc.)

### Rules
- HUD elements must not overlap gameplay area
- Use consistent colors: green=good, red=danger, gold=score, white=neutral
- Numbers should animate when changing (tween, not snap)
- Show changes with "+10" popups at the source, not just in the HUD
- Minimalism: if it's not essential, it's not on screen

## Menu Flow

```
TITLE SCREEN
  → [PLAY] → Game starts (fastest path, one click)
  → [SETTINGS] → Volume, controls, accessibility
  → [LEADERBOARD] → SOAR rankings

PAUSE (ESC or tap menu icon)
  → [RESUME]
  → [RESTART]
  → [SETTINGS]
  → [QUIT] (return to title)

GAME OVER
  → Score display (animated, dramatic)
  → [RETRY] (one button, prominent, default focus)
  → [QUIT]
  → If new high score: celebration + save prompt

WIN
  → Score + time + bonuses (revealed one by one, each with sound)
  → Star rating (1-3 stars)
  → [NEXT LEVEL] (default focus)
  → [REPLAY] (improve score)
  → [SHARE] (challenge link)
```

## Input UX

### Responsiveness
- Input → visual response: under 50ms (ideally one frame)
- Input → game state change: under 100ms
- If processing takes longer, show immediate feedback (button press animation, loading indicator)

### Mobile Touch
- Touch targets: minimum 44x44px (Apple HIG)
- Gestures: swipe for direction, tap for action, hold for continuous
- Virtual joystick: left side of screen = move, right side = action
- No overlapping touch zones
- Haptic feedback on iOS/Android (navigator.vibrate)

### Keyboard
- WASD AND arrow keys (don't make player rebind)
- Space AND Z for jump (left-hand and right-hand friendly)
- ESC always pauses
- Enter always confirms
- Show keybinds contextually (near the relevant action)

## Accessibility Essentials

```
MUST HAVE:
  - Volume controls (master, SFX, music — separate)
  - Pause anywhere
  - Remappable controls (or at minimum, multiple presets)
  - High contrast mode (UI readable without squinting)
  - prefers-reduced-motion: disable shake, reduce particles
  
SHOULD HAVE:
  - Colorblind mode (deuteranopia, protanopia palettes)
  - Shape + color for game-critical info (never color alone)
  - Subtitle support for any voice/narration
  - Difficulty options (easy/normal/hard — not hidden, not shameful)
  - Screen reader support for menus (aria labels)
  
NICE TO HAVE:
  - One-handed mode (all actions on one side of keyboard/screen)
  - Auto-aim assist (toggle)
  - Dyslexia-friendly font option (OpenDyslexic)
  - Speed control (0.5x for accessibility)
```

## Loading States

Never show a blank screen. During any loading:
- Show progress (bar, percentage, or spinner)
- Show game tips or lore
- Pre-render the game UI in the background
- Target: playable in under 3 seconds (browser games have no patience)

## What We Don't Know Yet
- Advanced onboarding patterns (contextual hints, ghost demos, progressive disclosure)
- Emotional UX (how UI mood matches gameplay mood — horror game menus should feel uneasy)
- Social UX patterns for multiplayer (lobbies, matchmaking UI, friend lists)
- Monetization UX (fair prompts for in-game purchases, not dark patterns)

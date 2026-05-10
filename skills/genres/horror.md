# Horror Game Design — Tension, Dread, and Release

## Core Mechanic: Information Asymmetry

Horror works because the player KNOWS something is wrong but CAN'T see what. The game controls information flow.

## The Fear Toolkit

### 1. Sound Design (60% of horror is audio)
- **Ambient drones**: Low-frequency hum (40-80Hz) creates subconscious unease
- **Silence then sudden**: Remove all ambient audio for 3-5 seconds before a scare
- **Spatial audio**: Footsteps behind the player, breathing from unknown direction
- **Audio tells**: Subtle sound cues that train the player to dread specific sounds
- **Music absence**: No background music = danger. Music returning = temporary safety

### 2. Lighting as Gameplay
- **Limited light source**: Flashlight with cone + battery mechanic
- **Light = safety zone**: Lit areas are safe, darkness hides threats
- **Flickering**: Lights that stutter create constant tension without any enemy
- **Darkness adaptation**: When lights go out, player sees nothing for 2 seconds (terrifying)

### 3. Camera and Perspective
- **First-person**: Most immersive for horror (player IS the character)
- **Fixed camera**: Classic survival horror (Resident Evil). Loss of control = anxiety
- **Over-the-shoulder**: Compromise. Allows look-behind mechanic
- **Never show everything**: Frame shots so the player can't see corners, behind doors, under beds

### 4. Pacing — The Tension Curve
```
SAFE → UNEASY → TENSE → DREAD → SCARE → RELIEF → SAFE (longer) → UNEASY...

Each cycle ESCALATES:
  Cycle 1: Weird noise → nothing there → relief
  Cycle 2: Weird noise → shadow moves → relief
  Cycle 3: Weird noise → shadow moves → CHASE SEQUENCE → escape → relief
  Cycle 4: Silence → the thing is already in the room
```

### 5. Resource Scarcity
- Limited: flashlight battery, health, ammunition, save points
- Scarcity creates decision anxiety: "Do I use the medkit now or save it?"
- Let the player run out once early — teaches them to conserve

### 6. Enemy Design
- **Less is more**: One well-designed enemy > ten generic ones
- **Unpredictable AI**: Random patrol routes, not fixed paths
- **Invincible phases**: Sometimes you CANNOT fight — only hide/run
- **Audio-reactive enemies**: Enemy responds to player's noise (footsteps, door opening)

## Anti-Patterns (Don't Do These)
- Jump scares without buildup (cheap, loses trust)
- Constant danger (exhausting, player goes numb)
- Visible health bars on monsters (breaks immersion)
- Save anywhere (removes tension — use limited save points)
- Explaining the monster's origin (mystery is scarier than lore)

## Gamerplex Fit
- PER (Private Ephemeral Rollup): monster position hidden from client — truly unknown
- Wagered horror: "Survive 5 minutes" challenge with real stakes
- Spectator betting: "Will they survive this room?"
- On-chain permadeath: character death is permanent (NFT burned)

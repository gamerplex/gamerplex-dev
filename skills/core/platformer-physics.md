# Platformer Physics — What Makes a Jump Feel Good

These are the hidden mechanics that separate good platformers from bad ones. Implement ALL of them.

## Coyote Time (6 frames)

Allow jumping for 6 frames after leaving a ledge. Without this, players feel cheated — they pressed jump "on" the edge but the game says they were already in the air.

```
if (grounded) coyoteTimer = 6;
else coyoteTimer = max(0, coyoteTimer - 1);

// Can jump if coyoteTimer > 0 (not just if grounded)
```

## Jump Buffering (8 frames)

Remember jump input for 8 frames before landing. If player presses jump slightly before touching ground, the jump fires on landing. Without this, rapid platforming feels unresponsive.

```
if (jumpPressed) jumpBufferTimer = 8;
else jumpBufferTimer = max(0, jumpBufferTimer - 1);

// Jump triggers when: coyoteTimer > 0 AND jumpBufferTimer > 0
```

## Variable Jump Height

Tap = short hop. Hold = full jump. Release the button mid-air to cut upward velocity.

```
// On jump button RELEASE, while moving upward:
if (jumpReleased && vy < 0) {
  vy *= 0.4;  // cut velocity to 40%
}
```

## Non-Parabolic Gravity

Classic platformers don't use uniform gravity. Falling is faster than rising — it feels "snappy."

```
if (vy > 0) {
  vy += GRAVITY * 1.5;  // fall faster (1.5x gravity)
} else {
  vy += GRAVITY;         // normal gravity while rising
}
```

## Acceleration and Deceleration

Never set velocity directly from input. Use acceleration curves:

```
// Running
if (inputRight) vx = min(vx + ACCEL, MAX_SPEED);
else if (inputLeft) vx = max(vx - ACCEL, -MAX_SPEED);
else {
  // Decelerate toward zero
  if (vx > 0) vx = max(0, vx - DECEL);
  else vx = min(0, vx + DECEL);
}
```

ACCEL should be ~0.3, DECEL ~0.25, MAX_SPEED ~2.5. Tune by feel.

## Air Control

Player should have LESS control in air than on ground (but not zero):

```
const accel = grounded ? GROUND_ACCEL : AIR_ACCEL;  // air = 60-80% of ground
```

## Tile Collision Order

Always resolve X and Y separately, in sequence. Never both at once:

```
moveX();  // apply vx, resolve horizontal collisions
moveY();  // apply vy, resolve vertical collisions
```

This prevents corner-catching bugs where diagonal movement gets stuck on tile edges.

## Corner Correction

If the player's head barely clips a ceiling tile corner while jumping, nudge them horizontally instead of stopping the jump. Prevents frustrating "bonking" on near-misses.

## Speed Capping

```
vx = clamp(vx, -MAX_SPEED_X, MAX_SPEED_X);
vy = clamp(vy, -MAX_JUMP_VEL, MAX_FALL_SPEED);
```

MAX_FALL_SPEED prevents infinite acceleration on long falls. ~8-10 pixels/frame.

## Recommended Constants (16px tiles, 60fps)

```
GRAVITY:        0.5
MAX_FALL:       10
RUN_SPEED:      2.2
RUN_ACCEL:      0.3
RUN_DECEL:      0.25
JUMP_VELOCITY:  -8.5
JUMP_CUT:       0.4
COYOTE_FRAMES:  6
BUFFER_FRAMES:  8
AIR_ACCEL_MULT: 0.7
```

These are starting points. Tune by PLAYING, not by math.

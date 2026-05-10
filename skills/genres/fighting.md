# Fighting Game Design — Frames, Hitboxes, and Mind Games

## Core Loop
Attack → Block/Dodge → Punish → Reset to neutral. Under 10 seconds per exchange.

## Frame Data (The Foundation)
Every move has: startup frames (wind-up), active frames (can hit), recovery frames (vulnerable).
- Fast attacks: 3-5 startup, 2-3 active, 8-12 recovery
- Heavy attacks: 8-15 startup, 3-5 active, 15-25 recovery
- If attack is blocked: attacker has MORE recovery (frame disadvantage)

## Hitbox/Hurtbox System
- Hurtbox: where the character CAN be hit (body)
- Hitbox: where the ATTACK can hit (fist, sword, projectile)
- Separate from visual sprite — allows balance tuning without art changes

## Input Buffering
Accept inputs 3-6 frames before the current move ends. Essential for combos feeling responsive.

## Knockback and Hitstun
On hit: freeze both characters for 2-4 frames (hitstop), then apply knockback + hitstun to defender. Hitstun duration determines combo potential.

## Gamerplex Fit
- Frame-perfect inputs verifiable on-chain (MagicBlock ER timestamps)
- Wagered best-of-3 matches via Contention Markets
- ELO rankings on SOAR
- Character NFTs with unique movesets

# Puzzle Game Design — Clarity, "Aha!", and Difficulty Curves

## Core Principle: The Aha Moment

A good puzzle makes the player feel SMART when they solve it. The solution should be simple but not obvious. If the player needs to guess, the puzzle is broken.

## Design Rules

### 1. One Mechanic, Fully Explored
Introduce one interaction rule. Then create 10-20 puzzles that explore every implication of that rule before adding another.

### 2. Visual Clarity
The player must understand the puzzle state at a glance:
- What can I interact with? (visually distinct from background)
- What is the goal? (visible, highlighted)
- What are the constraints? (walls, locks, limits visible)
- What is my current state? (score, moves, progress)

### 3. Difficulty Curve (The Spiral)
```
Easy → Easy → Medium → Easy → Medium → Hard → Easy → Medium → Hard → Expert
```
After each hard puzzle, reset to easy (with a new mechanic). This prevents frustration walls and teaches through contrast.

### 4. Undo is Mandatory
Every puzzle game MUST have undo. No exceptions. Lack of undo transforms "experimentation" into "frustration."

### 5. No Fail States (Usually)
Most puzzle games should have no way to "lose" — only a state you need to undo. Timer-based puzzles are the exception.

### 6. Teach Through Doing
- Level 1: One-step solution (can't fail)
- Level 2: Two-step, obvious
- Level 3: Two-step, requires observation
- Level 4: Three-step, combines mechanics from 1-3
- Never use tutorial text. The levels ARE the tutorial.

## Word Game Specifics (Wordle, Crossword, etc.)
- Dictionary validation: built-in, not API-dependent
- Color-blind safe: use shapes + colors, not color alone
- Keyboard state: show which letters are used/unused/correct
- One puzzle per day = habit formation (Wordle model)
- Share results as text art (spoiler-free bragging)

## Gamerplex Fit
- PER for hidden answers (provably fair, unhackable)
- Daily puzzles with leaderboards (SOAR)
- 1v1 solving: "See if you can match my 4-move solve"
- Community-created puzzles (host earns from entries)

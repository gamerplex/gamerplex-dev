# Game Testing & QA — Ship Games That Actually Work

## The Problem

Our current "smoke test" is a checklist printed to chat. Real QA means automated, repeatable, exhaustive testing that catches bugs before players do.

## Testing Pyramid for Games

```
                    /\
                   /  \     MANUAL PLAYTESTING (human feel, fun, balance)
                  /    \    — 5-10 sessions per milestone
                 /------\
                /        \   INTEGRATION TESTS (systems working together)
               /          \  — enemy + player + physics + scoring
              /------------\
             /              \  UNIT TESTS (individual functions)
            /                \ — collision detection, damage calc, score math
           /------------------\
          /                    \  AUTOMATED SMOKE TESTS (does it crash?)
         /                      \ — headless browser, random input, 100 runs
        /________________________\
```

## Automated Smoke Testing (Puppeteer/Playwright)

The minimum viable QA. Run the game headless, inject random inputs, check for crashes:

```javascript
// smoke-test.js — run with: npx playwright test
import { test, expect } from "@playwright/test";

test("game loads and runs without crashing", async ({ page }) => {
  await page.goto("http://localhost:42069/game");
  
  // Wait for canvas
  const canvas = await page.waitForSelector("canvas");
  expect(canvas).toBeTruthy();
  
  // Inject random inputs for 30 seconds
  for (let i = 0; i < 300; i++) {
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "Space"];
    const key = keys[Math.floor(Math.random() * keys.length)];
    await page.keyboard.down(key);
    await page.waitForTimeout(50 + Math.random() * 100);
    await page.keyboard.up(key);
  }
  
  // Check no console errors
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  expect(errors).toEqual([]);
});

test("game can be won", async ({ page }) => {
  // Game-specific: navigate to win condition
  // This test proves the critical path works
});

test("game can be lost and restarted", async ({ page }) => {
  // Walk off a cliff, verify death screen, press Space, verify restart
});

test("game runs at 60fps", async ({ page }) => {
  // Measure frame times over 5 seconds
  const fps = await page.evaluate(() => {
    return new Promise((resolve) => {
      let frames = 0;
      const start = performance.now();
      function count() {
        frames++;
        if (performance.now() - start > 5000) resolve(frames / 5);
        else requestAnimationFrame(count);
      }
      requestAnimationFrame(count);
    });
  });
  expect(fps).toBeGreaterThan(55); // allow small margin
});
```

## Playtesting Protocol

### First Playtest (Self)
- Play your own game for 10 minutes uninterrupted
- Write down every moment of confusion or frustration
- Note any time you stop having fun
- Record: did you want to play again after dying?

### Second Playtest (Watch Someone Else)
- Don't explain ANYTHING. Hand them the controls
- Watch silently. Write down every moment they:
  - Look confused (UI problem)
  - Try something that doesn't work (missing feature)
  - Stop playing (engagement problem)
  - Smile or lean forward (working! protect this)
- Ask after: "What was confusing?" "Would you play again?"

### Regression Testing
After every change, verify:
- [ ] Previous bugs haven't returned
- [ ] Win/lose paths still work
- [ ] Score system still functions
- [ ] Restart still works
- [ ] Performance hasn't degraded (measure fps)

## Performance Profiling

```
Chrome DevTools:
  Performance tab → Record → Play for 30s → Stop
  
  CHECK:
  - Frame times consistently under 16.6ms (60fps)?
  - Any long frames > 33ms (frame drops)?
  - GC pauses? (memory management issue)
  - Layout thrashing? (DOM manipulation in game loop)

Memory tab → Heap snapshot → Play for 5 min → Another snapshot
  - Heap growing? Memory leak.
  - Many small objects? Need object pooling.
```

## What We Don't Know Yet
- How to automatically detect "unfun" gameplay (metric thresholds?)
- Fuzz testing for game state (random state transitions, find crashes)
- Load testing for multiplayer (simulate 100 concurrent players)
- Visual regression testing (screenshot comparison between builds)
- Automated difficulty curve analysis (is level 3 too hard?)

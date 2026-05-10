#!/usr/bin/env node
/**
 * Gamerplex Benchmark — Space Invaders Build
 *
 * Automated test that builds a 1980s-style Space Invaders game through
 * the dev server chat, using different AI backends. Measures:
 *   - Time per prompt
 *   - File size change (did AI actually edit?)
 *   - Final game validity (canvas renders? no errors? has expected elements?)
 *   - Total build time
 *
 * Usage:
 *   node benchmark/space-invaders.js                # run against currently active backend
 *   node benchmark/space-invaders.js --all          # run all backends, compare
 *   node benchmark/space-invaders.js --backend ollama:qwen3.5:9b
 */

const { spawn, spawnSync } = require("child_process");
const { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync, copyFileSync, readdirSync } = require("fs");
const { join, resolve } = require("path");
const http = require("http");

const DEV_SERVER_URL = "http://localhost:42069";
const BENCHMARK_DIR = resolve(__dirname);
const GAMES_DIR = join(BENCHMARK_DIR, "games");
const RESULTS_DIR = join(BENCHMARK_DIR, "results");

// ============================================================
// THE PROMPTS — how a human would build Space Invaders
// ============================================================

const PROMPTS = [
  {
    name: "01_setup",
    prompt: "Build me Space Invaders, 2D, classic 1980s arcade style. Black background, 768x720 canvas. A green pixelated player ship at the bottom that moves left/right with arrow keys. Use vanilla JavaScript and canvas only, single HTML file. No external libraries.",
    expectedKeywords: ["canvas", "ArrowLeft", "ArrowRight", "fillRect"],
    validates: "Canvas, player ship, keyboard input",
  },
  {
    name: "02_enemies",
    prompt: "Add a grid of 5 rows x 11 columns of green pixelated enemy aliens at the top. They should move left and right as a group, dropping down one row when hitting the edge, getting faster as fewer remain.",
    expectedKeywords: ["enemies", "rows", "cols"],
    validates: "Enemy grid, movement pattern",
  },
  {
    name: "03_shooting",
    prompt: "Spacebar shoots a white bullet from the player ship upward. Bullets that hit enemies destroy them. Add a score counter that increments when an enemy is destroyed.",
    expectedKeywords: ["bullet", "Space", "score"],
    validates: "Shooting mechanic, collision, scoring",
  },
  {
    name: "04_enemy_fire",
    prompt: "Enemies occasionally shoot bullets back down at the player. If an enemy bullet hits the player, the player loses a life. Start with 3 lives. Show lives in the UI.",
    expectedKeywords: ["lives", "enemyBullet"],
    validates: "Enemy bullets, player death, lives",
  },
  {
    name: "05_game_states",
    prompt: "Add game over screen when lives reach 0. Add win screen when all enemies destroyed. Both screens show the final score and 'Press SPACE to restart'.",
    expectedKeywords: ["gameOver", "win", "restart"],
    validates: "Win/lose/restart loop",
  },
  {
    name: "06_juice",
    prompt: "Add juice: screen shake when player is hit, particles when enemies explode, simple bleep/boop sound effects with Web Audio API (no external audio files). Make it feel alive.",
    expectedKeywords: ["shake", "particles", "audioContext"],
    validates: "Game feel, audio, particles",
  },
];

// ============================================================
// UTILITIES
// ============================================================

function httpPost(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(DEV_SERVER_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let buf = "";
      res.on("data", (c) => buf += c);
      res.on("end", () => resolve({ status: res.statusCode, body: buf }));
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Send chat message, wait for full SSE stream to complete
function sendChatAndWait(message, timeoutMs = 600000) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ message });
    const startTime = Date.now();
    const req = http.request(DEV_SERVER_URL + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) },
    }, (res) => {
      let fullText = "";
      let toolCalls = [];
      let buf = "";

      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error("timeout after " + timeoutMs + "ms"));
      }, timeoutMs);

      res.on("data", (chunk) => {
        buf += chunk.toString();
        const lines = buf.split("\n");
        buf = lines.pop(); // keep partial line
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const d = JSON.parse(line.slice(6));
              if (d.type === "text" && d.text) fullText += d.text;
              if (d.type === "tool") toolCalls.push(d.name);
            } catch {}
          }
        }
      });

      res.on("end", () => {
        clearTimeout(timer);
        resolve({
          text: fullText,
          toolCalls,
          durationMs: Date.now() - startTime,
        });
      });
    });
    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

function getFileSize(path) {
  try { return statSync(path).size; } catch { return 0; }
}

function validateGame(htmlPath, expectedKeywords) {
  if (!existsSync(htmlPath)) return { valid: false, reason: "No index.html" };
  const content = readFileSync(htmlPath, "utf-8");
  const lower = content.toLowerCase();

  const checks = {
    hasCanvas: /<canvas/i.test(content),
    hasScript: /<script/i.test(content),
    hasGameLoop: /requestAnimationFrame|setInterval/i.test(content),
    size: content.length,
    keywordsFound: expectedKeywords.filter(k => lower.includes(k.toLowerCase())),
    keywordsMissing: expectedKeywords.filter(k => !lower.includes(k.toLowerCase())),
  };

  return {
    valid: checks.hasCanvas && checks.hasScript && checks.hasGameLoop,
    checks,
  };
}

// ============================================================
// BENCHMARK RUNNER
// ============================================================

async function setBackend(backend) {
  const res = await httpPost("/api/backend", backend);
  if (res.status !== 200) throw new Error("Backend switch failed: " + res.body);
  return res;
}

async function runBenchmark(backend, testName) {
  console.log("\n  " + "=".repeat(70));
  console.log("  BACKEND: \x1b[36m" + backend.label + "\x1b[0m" + (backend.model ? " (" + backend.model + ")" : ""));
  console.log("  " + "=".repeat(70));

  // 1. Set up fresh game directory
  const gameDir = join(GAMES_DIR, testName);
  if (existsSync(gameDir)) rmSync(gameDir, { recursive: true });
  mkdirSync(gameDir, { recursive: true });

  // Copy the blank template
  const blankTemplate = resolve(__dirname, "..", "games", "blank", "index.html");
  if (existsSync(blankTemplate)) {
    copyFileSync(blankTemplate, join(gameDir, "index.html"));
  } else {
    writeFileSync(join(gameDir, "index.html"), "<!DOCTYPE html><html><body><canvas id='c'></canvas></body></html>");
  }

  // 2. Restart dev server pointed at this directory
  console.log("  [setup] Restarting dev server with " + gameDir);
  spawnSync("bash", ["-c", "lsof -ti:42069 | xargs kill 2>/dev/null; sleep 0.5"]);
  const devProc = spawn("node", [join(__dirname, "..", "dev-server.js"), gameDir], {
    cwd: join(__dirname, ".."),
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  devProc.unref();
  await new Promise(r => setTimeout(r, 1500));

  // 3. Set the backend
  await setBackend(backend);

  // 4. Run each prompt sequentially
  const htmlPath = join(gameDir, "index.html");
  const startSize = getFileSize(htmlPath);
  const results = [];
  const overallStart = Date.now();

  for (const p of PROMPTS) {
    const beforeSize = getFileSize(htmlPath);
    console.log("\n  \x1b[33m[" + p.name + "]\x1b[0m " + p.prompt.substring(0, 70) + "...");

    let result;
    try {
      result = await sendChatAndWait(p.prompt);
    } catch (err) {
      console.log("    \x1b[31m✗ FAILED:\x1b[0m " + err.message);
      results.push({ ...p, error: err.message, durationMs: 0 });
      continue;
    }

    const afterSize = getFileSize(htmlPath);
    const validation = validateGame(htmlPath, p.expectedKeywords);

    results.push({
      name: p.name,
      prompt: p.prompt,
      durationMs: result.durationMs,
      sizeBefore: beforeSize,
      sizeAfter: afterSize,
      sizeDelta: afterSize - beforeSize,
      toolCalls: result.toolCalls,
      editCount: result.toolCalls.filter(t => t === "Edit" || t === "Write").length,
      responseText: result.text.substring(0, 200),
      validation,
    });

    const durS = (result.durationMs / 1000).toFixed(1);
    const delta = afterSize - beforeSize;
    const deltaStr = delta > 0 ? "+" + delta : delta;
    const edits = result.toolCalls.filter(t => t === "Edit" || t === "Write").length;
    console.log("    Duration: " + durS + "s  |  File: " + afterSize + " bytes (" + deltaStr + ")  |  Edits: " + edits);
    console.log("    Keywords found: " + validation.checks.keywordsFound.length + "/" + p.expectedKeywords.length +
                (validation.checks.keywordsMissing.length ? "  missing: " + validation.checks.keywordsMissing.join(", ") : ""));
  }

  // 5. Final validation
  const finalContent = existsSync(htmlPath) ? readFileSync(htmlPath, "utf-8") : "";
  const totalDuration = Date.now() - overallStart;

  const report = {
    backend,
    testName,
    totalDurationMs: totalDuration,
    totalDurationMin: (totalDuration / 60000).toFixed(2),
    finalSize: finalContent.length,
    sizeGrowth: finalContent.length - startSize,
    totalEdits: results.reduce((a, r) => a + (r.editCount || 0), 0),
    promptsCompleted: results.filter(r => !r.error).length,
    promptsFailed: results.filter(r => r.error).length,
    results,
    timestamp: new Date().toISOString(),
  };

  // Score (0-100)
  const completionScore = (report.promptsCompleted / PROMPTS.length) * 40;
  const editScore = Math.min(report.totalEdits * 5, 30);
  const growthScore = Math.min(finalContent.length / 200, 30);
  report.qualityScore = Math.round(completionScore + editScore + growthScore);

  console.log("\n  " + "-".repeat(70));
  console.log("  RESULT: " + report.promptsCompleted + "/" + PROMPTS.length + " prompts completed");
  console.log("  Total time: " + report.totalDurationMin + " minutes");
  console.log("  Final size: " + finalContent.length + " bytes (" + report.totalEdits + " edits)");
  console.log("  Quality score: \x1b[1m" + report.qualityScore + "/100\x1b[0m");

  return report;
}

// ============================================================
// MAIN
// ============================================================

const BACKENDS_TO_TEST = [
  { id: "claude-oauth", label: "Claude Code", model: null, baseUrl: null, apiKey: null },
  // Sovereign agent (ollama-agent.js) handles Ollama models directly
  { id: "ollama:qwen3.5:9b", label: "qwen3.5:9b", model: "qwen3.5:9b", baseUrl: "http://localhost:11434", apiKey: null },
  { id: "ollama:qwen3.5-coding-128k", label: "qwen3.5-coding-128k", model: "qwen3.5-coding-128k", baseUrl: "http://localhost:11434", apiKey: null },
  { id: "ollama:gemma4-31b-128k", label: "gemma4-31b-128k", model: "gemma4-31b-128k", baseUrl: "http://localhost:11434", apiKey: null },
  { id: "ollama:qwen3.6:35b-a3b-coding-nvfp4", label: "qwen3.6-coding", model: "qwen3.6:35b-a3b-coding-nvfp4", baseUrl: "http://localhost:11434", apiKey: null },
];

async function main() {
  const args = process.argv.slice(2);
  const runAll = args.includes("--all");
  const specificBackend = args.find(a => a.startsWith("--backend="))?.split("=")[1];

  mkdirSync(RESULTS_DIR, { recursive: true });

  let backendsToRun;
  if (specificBackend) {
    backendsToRun = BACKENDS_TO_TEST.filter(b => b.id === specificBackend);
    if (!backendsToRun.length) { console.error("Unknown backend: " + specificBackend); process.exit(1); }
  } else if (runAll) {
    backendsToRun = BACKENDS_TO_TEST;
  } else {
    backendsToRun = [BACKENDS_TO_TEST[0]]; // just claude by default
  }

  console.log("\n  \x1b[35mGAMERPLEX BENCHMARK — Space Invaders Build\x1b[0m");
  console.log("  Running against " + backendsToRun.length + " backend(s): " + backendsToRun.map(b => b.label).join(", "));
  console.log("  Prompts: " + PROMPTS.length + " steps\n");

  const allReports = [];
  for (const backend of backendsToRun) {
    const testName = backend.id.replace(/[:/]/g, "_");
    try {
      const report = await runBenchmark(backend, testName);
      allReports.push(report);
      const reportPath = join(RESULTS_DIR, testName + ".json");
      writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log("\n  Report saved: " + reportPath);
    } catch (err) {
      console.log("\n  \x1b[31mBenchmark failed for " + backend.label + ": " + err.message + "\x1b[0m");
    }
  }

  // Comparison summary
  if (allReports.length > 1) {
    console.log("\n\n  \x1b[35m" + "=".repeat(70) + "\x1b[0m");
    console.log("  \x1b[35m  COMPARISON\x1b[0m");
    console.log("  \x1b[35m" + "=".repeat(70) + "\x1b[0m\n");
    console.log("  " + "Backend".padEnd(30) + "Score  Completed  Time     Size     Edits");
    console.log("  " + "-".repeat(70));
    for (const r of allReports) {
      const line = r.backend.label.padEnd(30) +
        String(r.qualityScore).padEnd(7) +
        (r.promptsCompleted + "/" + PROMPTS.length).padEnd(11) +
        (r.totalDurationMin + "m").padEnd(9) +
        (r.finalSize + "b").padEnd(9) +
        r.totalEdits;
      console.log("  " + line);
    }

    const summaryPath = join(RESULTS_DIR, "summary_" + Date.now() + ".json");
    writeFileSync(summaryPath, JSON.stringify(allReports, null, 2));
    console.log("\n  Summary: " + summaryPath);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });

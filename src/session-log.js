/**
 * Session logger — tracks every prompt across harness swaps
 *
 * Logs to: {gameDir}/.gamerplex-session.jsonl  (append-only)
 * Each line: {
 *   ts, slot, backend, model, prompt, response,
 *   latencyMs, turnCount, tools, toolCalls,
 *   compareMode, error, screenshotPath?
 * }
 */

const fs = require("fs");
const path = require("path");

function getLogPath(gameDir) {
  return path.join(gameDir, ".gamerplex-session.jsonl");
}

function append(gameDir, entry) {
  const line = JSON.stringify({ ts: Date.now(), ...entry });
  try {
    fs.appendFileSync(getLogPath(gameDir), line + "\n");
  } catch (e) {
    console.log(`  [session-log] write failed: ${e.message}`);
  }
}

function readAll(gameDir) {
  try {
    const raw = fs.readFileSync(getLogPath(gameDir), "utf-8");
    return raw.split("\n").filter(Boolean).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

function clear(gameDir) {
  try {
    fs.unlinkSync(getLogPath(gameDir));
  } catch {}
}

function summary(gameDir) {
  const entries = readAll(gameDir);
  if (entries.length === 0) return { count: 0 };
  const byBackend = {};
  const errors = entries.filter((e) => e.error).length;
  const totalLatency = entries.reduce((a, e) => a + (e.latencyMs || 0), 0);
  for (const e of entries) {
    const key = e.model || e.backend || "unknown";
    byBackend[key] = (byBackend[key] || 0) + 1;
  }
  return {
    count: entries.length,
    backends: byBackend,
    errors,
    avgLatencyMs: Math.round(totalLatency / entries.length),
    compareRuns: entries.filter((e) => e.compareMode).length,
    firstTs: entries[0].ts,
    lastTs: entries[entries.length - 1].ts,
  };
}

module.exports = { append, readAll, clear, summary, getLogPath };

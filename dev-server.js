/**
 * Gamerplex Dev Server
 *
 * Run: node dev-server.js ./games/mario-test
 *
 * - Left panel: Chat input + activity feed — talk to AI, see it work
 * - Right panel: Live game preview — auto-reloads on every file change
 * - AI backends: Claude Code CLI (default), Ollama (future)
 */

const { createServer } = require("http");
const { readFileSync, watch, existsSync } = require("fs");
const { join, resolve, basename, dirname } = require("path");
const { spawn } = require("child_process");
const { WebSocketServer } = require("ws");
const { runOllamaAgent, buildSystemPrompt, detectProjectContext } = require("./src/ollama-agent.js");
const sessionLog = require("./src/session-log.js");

const gameDir = resolve(process.argv[2] || "./games/mario-test");
const PORT = 42069;
const gameName = basename(gameDir);

// Detect what kind of project gameDir is. Standalone HTML games need an
// index.html as the entry point. Next.js (or other framework) routes are
// the entry point themselves — no index.html required.
const _ctx = detectProjectContext(gameDir);
if (!_ctx.isNextProject && !existsSync(join(gameDir, "index.html"))) {
  console.error(`No index.html found in ${gameDir}`);
  console.error(`If this is a Next.js project, ensure a package.json with "next" in deps exists in ${gameDir} or any parent directory.`);
  process.exit(1);
}
console.log(`  [project] ${_ctx.isNextProject ? "Next.js" : "single-HTML"} | R3F=${_ctx.isR3F} | Anchor=${_ctx.hasAnchor} | GamerplexArcade=${_ctx.isGamerplexArcade}`);

const clients = new Set();
let editCount = 0;

// --- AI Backend ---
// Claude Code CLI works with ANY model that speaks Anthropic-compatible API.
// - Default: Anthropic API (cloud, highest quality)
// - Sovereign: Ollama (local, no API key, fully offline)
//
// Ollama exposes Anthropic-compatible endpoint at http://localhost:11434/v1
// Switching is just env vars — CLAUDE.md, skills, MCP tools all work identically.

// Backend abstraction — all providers work through Claude Code CLI
// via env var routing (ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY/AUTH_TOKEN)
//
// Compare mode: two slots (main + compare) build the same prompt in parallel.
// If both point to Ollama, runs serially (Ollama can only run one model at a time).
let compareMode = false;
const DEFAULT_BACKEND = {
  id: "claude-oauth",
  label: "Claude Code",
  model: null,
  baseUrl: null,
  apiKey: null,
};
let backends = {
  main: { ...DEFAULT_BACKEND },
  compare: { ...DEFAULT_BACKEND, id: "claude-oauth-2", label: "Claude Code" },
};

function setBackend(slot, backend) {
  backends[slot] = backend;
  const tier = backend.id === "claude-oauth" ? "OAuth" :
               backend.id.startsWith("ollama:") ? "LOCAL" :
               "API-KEY";
  console.log(`  [backend:${slot}] ${tier} → ${backend.label} (${backend.model || "default"}) @ ${backend.baseUrl || "anthropic"}`);
}

function isOllama(backend) {
  return backend.baseUrl && backend.baseUrl.includes("11434");
}

// Keep a simple alias for back-compat with existing code paths
let currentBackend = backends.main;

// Per-slot conversation history. Each entry: {role, content, meta}
// meta: { backend, model, latencyMs, ts, errors }
const chatHistory = { main: [], compare: [] };

// Router: dispatch to the right agent based on backend, with history + logging
//
// ARCHITECTURE:
//   claude-oauth / claude-api   → Claude Code CLI (best Anthropic experience)
//   ollama:*                    → Sovereign Agent, mode="ollama"
//   openai / gemini / openxai   → Sovereign Agent, mode="openai-compat"
function runAgent(prompt, onChunk, onDone, slot = "main") {
  const b = backends[slot];
  const slotDir = slot === "compare" ? join(gameDir, "..", basename(gameDir) + "-compare") : gameDir;
  const startTs = Date.now();

  // Ensure compare dir exists
  if (slot === "compare") {
    if (!existsSync(slotDir)) require("fs").mkdirSync(slotDir, { recursive: true });
    const compareHtml = join(slotDir, "index.html");
    if (!existsSync(compareHtml)) {
      require("fs").writeFileSync(compareHtml, "<!DOCTYPE html><html><head><title>Compare</title></head><body></body></html>");
    }
  }

  const history = chatHistory[slot] || [];
  let assistantResponse = "";
  const toolCalls = [];
  let errorMsg = null;

  // Wrap onChunk to capture response text + tools
  const wrappedChunk = (event) => {
    if (typeof event === "string") {
      assistantResponse += event;
    } else if (event.type === "text" && event.text) {
      assistantResponse += event.text;
    } else if (event.type === "tool" && event.name) {
      toolCalls.push(event.name);
    } else if (event.type === "error") {
      errorMsg = event.message;
    }
    onChunk(event);
  };

  // Wrap onDone to append to history + log
  const wrappedDone = (fullResponse, exitCode) => {
    const latencyMs = Date.now() - startTs;
    const finalText = (assistantResponse || fullResponse || "").trim();

    // Append to chat history (user + assistant turn)
    history.push({ role: "user", content: prompt, meta: { ts: startTs } });
    history.push({
      role: "assistant",
      content: finalText,
      meta: { backend: b.id, model: b.model || "default", latencyMs, ts: Date.now(), toolCalls, exitCode },
    });
    chatHistory[slot] = history;

    // Persist to session log
    sessionLog.append(slotDir, {
      slot,
      backend: b.id,
      model: b.model || "default",
      prompt,
      response: finalText.slice(0, 1000), // cap response length in log
      latencyMs,
      turnCount: Math.ceil(history.length / 2),
      toolCalls,
      toolCount: toolCalls.length,
      compareMode,
      error: errorMsg || (exitCode !== 0 ? `exit ${exitCode}` : null),
      historyLen: history.length,
    });

    console.log(`  [session:${slot}] ${b.id}/${b.model || "default"} | ${latencyMs}ms | tools=${toolCalls.length} | hist=${history.length}`);

    onDone(fullResponse, exitCode);
  };

  // Ollama → sovereign agent (ollama mode)
  if (b.id.startsWith("ollama:")) {
    console.log(`  [router] slot=${slot} hist=${history.length} → sovereign-agent (ollama: ${b.model})`);
    return runOllamaAgent({
      prompt,
      history,
      model: b.model,
      baseUrl: b.baseUrl || "http://localhost:11434",
      mode: "ollama",
      gameDir: slotDir,
      devRoot: __dirname,
      onChunk: wrappedChunk,
      onDone: wrappedDone,
    });
  }

  // OpenAI-compat providers → sovereign agent (openai-compat mode)
  if (["openai", "gemini", "openxai"].includes(b.id)) {
    const providerBaseUrls = {
      openai: "https://api.openai.com",
      gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
      openxai: b.baseUrl || "https://api.openxai.org",
    };
    console.log(`  [router] slot=${slot} hist=${history.length} → sovereign-agent (openai-compat: ${b.id})`);
    return runOllamaAgent({
      prompt,
      history,
      model: b.model || (b.id === "openai" ? "gpt-4o" : b.id === "gemini" ? "gemini-2.0-flash" : ""),
      baseUrl: b.baseUrl || providerBaseUrls[b.id],
      apiKey: b.apiKey,
      mode: "openai-compat",
      gameDir: slotDir,
      devRoot: __dirname,
      onChunk: wrappedChunk,
      onDone: wrappedDone,
    });
  }

  // Anthropic (claude-oauth, claude-api) → Claude Code CLI
  console.log(`  [router] slot=${slot} hist=${history.length} → claude-code (${b.id})`);
  return runClaudeCode(prompt, wrappedChunk, wrappedDone, slot, history);
}

function clearHistory(slot) {
  chatHistory[slot] = [];
  console.log(`  [session:${slot}] history cleared`);
}

function runClaudeCode(prompt, onChunk, onDone, slot = "main", history = []) {
  const slotDir = slot === "compare" ? join(gameDir, "..", basename(gameDir) + "-compare") : gameDir;
  if (slot === "compare") {
    if (!existsSync(slotDir)) require("fs").mkdirSync(slotDir, { recursive: true });
    const compareHtml = join(slotDir, "index.html");
    if (!existsSync(compareHtml)) {
      require("fs").writeFileSync(compareHtml, "<!DOCTYPE html><html><head><title>Compare</title></head><body></body></html>");
    }
  }

  // Build prompt with history prepended (Claude Code CLI -p takes single string)
  const cleanHistory = history.filter((m) => m.role === "user" || m.role === "assistant");
  let effectivePrompt = prompt;
  if (cleanHistory.length > 0) {
    const historyText = cleanHistory.map((m) =>
      `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`
    ).join("\n\n");
    effectivePrompt = `Previous conversation:\n\n${historyText}\n\n---\n\nNow: ${prompt}`;
  }

  // Use the shared smart-prompt builder so Claude sees the same context as
  // Ollama: ethos doc, project-specific CLAUDE.md (if any), engine + project
  // skills auto-loaded by detected project type, and operating instructions
  // adapted (Next.js vs single-HTML).
  const systemPrompt = buildSystemPrompt(slotDir, __dirname);

  const args = [
    "@anthropic-ai/claude-code",
    "-p", effectivePrompt,
    // TodoWrite lets Claude track its own progress across phases (critical for
    // multi-phase builds — without it the agent loses the thread on long runs).
    // WebFetch covers the "go look up the spec" case where the user references
    // a markdown file in another repo.
    "--allowedTools", "Edit,Write,Read,Bash,Glob,Grep,TodoWrite,WebFetch",
    "--output-format", "stream-json",
    "--verbose",
    "--append-system-prompt", systemPrompt,
    // 50 turns covers complex multi-phase builds with debugging round-trips.
    // 10 was the old default — fine for one-shot edits, blew up on multi-file
    // ships. Each turn = one assistant message + tool calls before user input.
    "--max-turns", "50",
  ];

  // Backend routing via Claude Code env vars
  const envOverride = {};
  const b = backends[slot];

  if (b.id === "claude-oauth") {
    // Default: use OAuth login from keychain. No overrides needed.
  } else if (b.id === "claude-api") {
    // Claude with user-provided API key (bypasses OAuth)
    if (b.apiKey) envOverride.ANTHROPIC_API_KEY = b.apiKey;
  } else if (b.id.startsWith("ollama:")) {
    // Sovereign: route Claude Code to local Ollama
    envOverride.ANTHROPIC_BASE_URL = b.baseUrl || "http://localhost:11434";
    envOverride.ANTHROPIC_AUTH_TOKEN = "ollama";
    envOverride.ANTHROPIC_API_KEY = "";
    if (b.model) args.push("--model", b.model);
  } else if (b.id === "gemini" || b.id === "openxai") {
    // Other providers via custom base URL + API key
    // Assumes endpoint exposes Anthropic-compatible /v1/messages
    // (Gemini needs a proxy like LiteLLM; OpenXAI varies)
    envOverride.ANTHROPIC_BASE_URL = b.baseUrl;
    envOverride.ANTHROPIC_API_KEY = b.apiKey || "";
    envOverride.ANTHROPIC_AUTH_TOKEN = b.apiKey || "";
    if (b.model) args.push("--model", b.model);
  }

  console.log(`  [ai:${slot}:${b.id}] Prompt: "${prompt.substring(0, 60)}..."`);

  const child = spawn("npx", args, {
    cwd: slotDir,
    env: { ...process.env, ...envOverride, FORCE_COLOR: "0" },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let fullResponse = "";

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const json = JSON.parse(line);
        if (json.type === "assistant" && json.message?.content) {
          for (const block of json.message.content) {
            if (block.type === "text" && block.text) {
              fullResponse += block.text;
              onChunk({ type: "text", text: block.text });
            }
            if (block.type === "tool_use") {
              onChunk({ type: "tool", name: block.name });
            }
          }
        } else if (json.type === "result") {
          if (json.result) fullResponse += json.result;
        }
      } catch {
        // Not JSON, might be partial — buffer it
      }
    }
  });

  child.stderr.on("data", (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes("npm warn")) {
      console.log(`  [ai:err] ${msg.substring(0, 100)}`);
    }
  });

  child.on("close", (code) => {
    console.log(`  [ai] Done (exit ${code})`);
    onDone(fullResponse, code);
  });

  return child;
}

// --- Dev Wrapper HTML ---
function devShell() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gamerplex Dev — ${gameName}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0f; color: #e0e0e0; font-family: 'SF Mono', 'Fira Code', monospace; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }

  .topbar {
    height: 42px; background: #14141f; border-bottom: 1px solid #2a2a3a;
    display: flex; align-items: center; padding: 0 16px; gap: 12px; flex-shrink: 0;
  }
  .topbar .logo { color: #9945FF; font-weight: bold; font-size: 14px; letter-spacing: 1px; }
  .topbar .sep { color: #333; }
  .topbar .game-name { color: #14F195; font-size: 13px; }
  .topbar .status { margin-left: auto; font-size: 11px; color: #666; display: flex; gap: 16px; align-items: center; }
  .topbar .dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
  .topbar .dot.live { background: #14F195; animation: pulse 2s infinite; }
  .topbar .dot.busy { background: #FFD700; animation: pulse 0.4s infinite; }
  .topbar .dot.error { background: #ff4444; }
  @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.3; } }
  .topbar .edits { color: #9945FF; font-weight: bold; }
  .session-badge {
    background: #1a1a2e; border: 1px solid #2a2a3a; color: #888;
    padding: 3px 10px; border-radius: 4px; font-size: 10px; cursor: pointer;
    transition: all 0.15s;
  }
  .session-badge:hover { border-color: #14F195; color: #14F195; }
  .topbar .backend-tag { background: #2a2a3a; color: #9945FF; padding: 4px 10px; border-radius: 4px; font-size: 10px; cursor: pointer; position: relative; transition: all 0.15s; }
  .topbar .backend-tag:hover { background: #3a3a4a; border-color: #9945FF; }
  .topbar .backend-tag::after { content: " ▾"; font-size: 8px; }
  .backend-dropdown {
    position: absolute; top: 40px; right: 16px; z-index: 100;
    background: #14141f; border: 1px solid #2a2a3a; border-radius: 6px;
    padding: 4px; min-width: 260px; display: none;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .backend-dropdown.open { display: block; }
  .backend-section { padding: 8px 12px; font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 1px; border-top: 1px solid #2a2a3a; }
  .backend-section:first-child { border-top: none; }
  .backend-item {
    padding: 8px 12px; border-radius: 4px; cursor: pointer;
    font-size: 12px; color: #ccc; display: flex; align-items: center; justify-content: space-between;
    transition: background 0.1s;
  }
  .backend-item:hover { background: #1a1a2e; }
  .backend-item.active { background: #9945FF20; color: #9945FF; }
  .backend-item.active::before { content: "● "; color: #14F195; }
  .backend-item .size { font-size: 10px; color: #555; }
  .backend-item.disabled { opacity: 0.4; cursor: not-allowed; }
  .backend-item.disabled:hover { background: transparent; }
  .backend-item .soon { font-size: 9px; color: #FFD700; margin-left: 6px; }

  .main { flex: 1; display: flex; overflow: hidden; }

  /* LEFT: Chat + Feed */
  .left-panel {
    width: 380px; background: #14141f; border-right: 1px solid #2a2a3a;
    display: flex; flex-direction: column; flex-shrink: 0;
  }

  /* Chat messages */
  .chat-scroll { flex: 1; overflow-y: auto; padding: 12px; }
  .chat-msg { margin-bottom: 12px; animation: fadeIn 0.2s ease; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; } }
  .chat-msg.user { text-align: right; }
  .chat-msg .bubble {
    display: inline-block; max-width: 90%; padding: 8px 12px; border-radius: 8px;
    font-size: 12px; line-height: 1.5; text-align: left; white-space: pre-wrap; word-break: break-word;
  }
  .chat-msg.user .bubble { background: #9945FF; color: #fff; border-bottom-right-radius: 2px; }
  .chat-msg.ai .bubble { background: #1a1a2e; color: #ccc; border: 1px solid #2a2a3a; border-bottom-left-radius: 2px; }
  .chat-msg.ai .bubble.thinking::after {
    content: '';
    display: inline-block;
    width: 4px; height: 14px;
    background: #9945FF;
    margin-left: 4px;
    vertical-align: text-bottom;
    animation: blink 0.6s step-end infinite;
  }
  @keyframes blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
  .typing-dots { display: inline-block; }
  .typing-dots span {
    display: inline-block; width: 6px; height: 6px; margin: 0 2px;
    background: #9945FF; border-radius: 50%;
    animation: dotBounce 1.2s infinite;
  }
  .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
  .typing-dots span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes dotBounce { 0%,80%,100% { transform: translateY(0); opacity: 0.4; } 40% { transform: translateY(-6px); opacity: 1; } }
  .status-line { color: #888; font-size: 11px; }
  .chat-msg.system .bubble { background: transparent; color: #555; font-size: 11px; padding: 4px 0; }
  .chat-msg .tool-tag { display: inline-block; background: #14F19520; color: #14F195; font-size: 10px; padding: 1px 6px; border-radius: 3px; margin: 2px 0; }
  .chat-msg .label { font-size: 10px; color: #555; margin-bottom: 2px; }

  /* Chat input */
  .chat-input-area {
    padding: 12px; border-top: 1px solid #2a2a3a; background: #12121e;
  }
  .chat-input-row { display: flex; gap: 8px; }
  .chat-input {
    flex: 1; background: #1a1a2e; border: 1px solid #2a2a3a; color: #e0e0e0;
    padding: 10px 12px; border-radius: 6px; font-family: inherit; font-size: 12px;
    outline: none; resize: none;
  }
  .chat-input:focus { border-color: #9945FF; }
  .chat-input::placeholder { color: #444; }
  .chat-input:disabled { opacity: 0.5; }
  .screenshot-btn {
    background: #1a1a2e; border: 1px solid #2a2a3a; color: #888;
    padding: 10px 12px; border-radius: 6px; cursor: pointer; font-size: 14px;
    transition: all 0.15s; line-height: 1;
  }
  .screenshot-btn:hover { border-color: #9945FF; color: #fff; }
  .screenshot-btn.active { border-color: #14F195; color: #14F195; }
  .screenshot-btn:disabled { opacity: 0.5; cursor: not-allowed; }
  .mic-btn {
    background: #1a1a2e; border: 1px solid #2a2a3a; color: #888;
    padding: 10px 12px; border-radius: 6px; cursor: pointer; font-size: 14px;
    transition: all 0.15s; line-height: 1;
  }
  .mic-btn:hover { border-color: #9945FF; color: #fff; }
  .mic-btn.recording { border-color: #ff4444; color: #ff4444; animation: pulse 0.6s infinite; background: rgba(255,68,68,0.1); }
  .mic-btn.recording::after { content: ' REC'; font-size: 9px; vertical-align: middle; }
  .screenshot-preview {
    display: none; margin-top: 8px; position: relative;
  }
  .screenshot-preview.visible { display: block; }
  .screenshot-preview img {
    width: 100%; border-radius: 4px; border: 1px solid #2a2a3a;
  }
  .screenshot-preview .remove-btn {
    position: absolute; top: 4px; right: 4px;
    background: rgba(0,0,0,0.7); color: #fff; border: none;
    width: 20px; height: 20px; border-radius: 50%; cursor: pointer;
    font-size: 12px; line-height: 1;
  }
  .screenshot-preview .remove-btn:hover { background: #ff4444; }
  .chat-msg .screenshot-thumb {
    width: 100%; max-width: 200px; border-radius: 4px; margin-top: 4px;
    border: 1px solid #2a2a3a;
  }
  .send-btn {
    background: #9945FF; border: none; color: #fff; padding: 10px 16px;
    border-radius: 6px; cursor: pointer; font-family: inherit; font-size: 12px; font-weight: bold;
    transition: all 0.15s; white-space: nowrap;
  }
  .send-btn:hover { background: #7b35dd; }
  .send-btn:disabled { background: #333; cursor: not-allowed; }
  .chat-hint { font-size: 10px; color: #444; margin-top: 6px; text-align: center; }

  /* Quick actions */
  .quick-actions { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
  .quick-btn {
    background: #1a1a2e; border: 1px solid #2a2a3a; color: #888;
    padding: 4px 10px; border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 10px;
    transition: all 0.15s;
  }
  .quick-btn:hover { border-color: #9945FF; color: #ccc; }

  /* RIGHT: Game Preview */
  .game-panel {
    flex: 1; display: flex; justify-content: center; align-items: center;
    background: #0d0d15; position: relative;
  }
  .game-panel iframe { border: none; background: #000; width: 100%; height: 100%; }

  /* Compare mode layout */
  .compare-container { display: flex; width: 100%; height: 100%; gap: 0; }
  .slot-panel { flex: 1; display: flex; flex-direction: column; background: #000; border-right: 1px solid #2a2a3a; }
  .slot-panel:last-child { border-right: none; }
  .slot-header {
    height: 32px; background: #14141f; border-bottom: 1px solid #2a2a3a;
    display: flex; align-items: center; gap: 10px; padding: 0 12px; flex-shrink: 0; font-size: 10px;
  }
  .slot-label { background: #9945FF; color: #fff; padding: 2px 8px; border-radius: 3px; font-weight: bold; letter-spacing: 1px; }
  .slot-backend { color: #14F195; cursor: pointer; padding: 2px 8px; border: 1px solid #2a2a3a; border-radius: 3px; transition: all 0.15s; }
  .slot-backend:hover { border-color: #9945FF; background: #1a1a2e; }
  .slot-spinner { margin-left: auto; color: #666; font-size: 10px; }
  .slot-spinner.active::before { content: "●"; color: #FFD700; animation: pulse 0.6s infinite; margin-right: 4px; }
  .slot-spinner.done::before { content: "●"; color: #14F195; margin-right: 4px; }
  .slot-panel iframe { border: none; background: #000; width: 100%; flex: 1; }

  /* Compare mode: vertical mobile-like aspect */
  body.compare-mode .compare-container { gap: 2px; background: #2a2a3a; }
  body.compare-mode .slot-panel iframe { max-width: 420px; margin: 0 auto; }

  /* Compare toggle button */
  .compare-toggle {
    background: #1a1a2e; border: 1px solid #2a2a3a; color: #888; cursor: pointer;
    padding: 4px 10px; border-radius: 4px; font-size: 10px; font-family: inherit;
    transition: all 0.15s; margin-right: 8px;
  }
  .compare-toggle:hover { border-color: #9945FF; color: #fff; }
  .compare-toggle.active { background: #14F195; color: #000; border-color: #14F195; font-weight: bold; }

  .status-overlay {
    position: absolute; top: 12px; right: 12px;
    background: rgba(20, 20, 31, 0.9); border: 1px solid #2a2a3a; border-radius: 6px;
    padding: 8px 14px; font-size: 11px; display: none; z-index: 10;
    backdrop-filter: blur(4px);
  }
  .status-overlay.active { display: flex; align-items: center; gap: 8px; }
  .status-overlay .spinner {
    width: 12px; height: 12px; border: 2px solid #333; border-top-color: #9945FF;
    border-radius: 50%; animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .reload-flash {
    position: absolute; inset: 0; background: rgba(153, 69, 255, 0.08);
    pointer-events: none; opacity: 0; transition: opacity 0.15s;
  }
  .reload-flash.active { opacity: 1; }

  /* Black cat — crosses screen on code change */
  .matrix-cat {
    position: absolute; bottom: 60px; z-index: 25;
    pointer-events: none; font-size: 48px;
    filter: drop-shadow(0 0 8px rgba(153, 69, 255, 0.6));
    transform: scaleX(-1);
    animation: catRun 1.8s ease-in-out forwards;
  }
  .matrix-cat.reverse { transform: scaleX(1); animation: catRunReverse 1.8s ease-in-out forwards; }
  @keyframes catRun {
    0% { left: -60px; opacity: 0; }
    10% { opacity: 1; }
    50% { bottom: 65px; }
    90% { opacity: 1; }
    100% { left: calc(100% + 60px); opacity: 0; }
  }
  @keyframes catRunReverse {
    0% { right: -60px; left: auto; opacity: 0; }
    10% { opacity: 1; }
    50% { bottom: 65px; }
    90% { opacity: 1; }
    100% { right: calc(100% + 60px); left: auto; opacity: 0; }
  }

  /* Update toast — shows on game panel when code changes */
  .update-toast {
    position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%) translateY(80px);
    background: rgba(20, 20, 31, 0.95); border: 1px solid #9945FF; border-radius: 8px;
    padding: 12px 20px; z-index: 20; display: flex; align-items: center; gap: 12px;
    backdrop-filter: blur(8px); transition: transform 0.3s ease, opacity 0.3s ease; opacity: 0;
    pointer-events: none;
  }
  .update-toast.visible { transform: translateX(-50%) translateY(0); opacity: 1; pointer-events: auto; }
  .update-toast .toast-icon { font-size: 18px; }
  .update-toast .toast-text { font-size: 12px; color: #ccc; }
  .update-toast .toast-text strong { color: #14F195; }
  .update-toast .toast-btn {
    background: #9945FF; border: none; color: #fff; padding: 6px 14px;
    border-radius: 4px; cursor: pointer; font-family: inherit; font-size: 11px; font-weight: bold;
    transition: background 0.15s; white-space: nowrap;
  }
  .update-toast .toast-btn:hover { background: #7b35dd; }
  .update-toast .toast-btn.secondary {
    background: transparent; border: 1px solid #2a2a3a; color: #888;
  }
  .update-toast .toast-btn.secondary:hover { border-color: #9945FF; color: #ccc; }
  .update-toast .toast-counter {
    font-size: 10px; color: #666; position: absolute; top: -8px; right: -8px;
    background: #9945FF; color: #fff; width: 20px; height: 20px; border-radius: 50%;
    display: flex; align-items: center; justify-content: center; font-weight: bold;
  }

  .bottombar {
    height: 28px; background: #9945FF; display: flex; align-items: center; padding: 0 16px;
    font-size: 11px; color: #fff; flex-shrink: 0; gap: 16px;
  }
  .bottombar .key { background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 2px; font-size: 10px; }
</style>
</head>
<body>

<div class="topbar">
  <span class="logo">GAMERPLEX</span>
  <span class="sep">/</span>
  <span class="game-name">${gameName}</span>
  <div class="status">
    <button class="compare-toggle" id="compare-toggle" onclick="toggleCompareMode()">⇆ Compare</button>
    <span class="session-badge" id="session-badge" onclick="viewSessionLog()" title="Click to view session log">0 turns</span>
    <span class="backend-tag" id="backend-tag" onclick="toggleBackendMenu('main')">Claude Code</span>
    <span class="edits" id="edit-count">0 edits</span>
    <span><span class="dot live" id="status-dot"></span></span>
  </div>
</div>
<div class="backend-dropdown" id="backend-dropdown">
  <div class="backend-section">Anthropic (Recommended)</div>
  <div class="backend-item active" data-backend="claude-oauth" onclick="selectBackend('claude-oauth', 'Claude Code', null, null)">
    Claude Code (OAuth)
    <span class="size">Default login</span>
  </div>
  <div class="backend-item" data-backend="claude-api" onclick="promptApiKey('claude-api', 'Claude API', 'ANTHROPIC_API_KEY')">
    Claude (API Key)
    <span class="size">Bring your own</span>
  </div>

  <div class="backend-section">Other Cloud Providers</div>
  <div class="backend-item" data-backend="gemini" onclick="promptApiKey('gemini', 'Gemini', 'GEMINI_API_KEY', 'https://generativelanguage.googleapis.com')">
    Google Gemini
    <span class="size">API key</span>
  </div>
  <div class="backend-item" data-backend="openxai" onclick="promptApiKey('openxai', 'OpenXAI', 'OPENXAI_API_KEY', 'https://api.openxai.org')">
    OpenXAI
    <span class="size">API key</span>
  </div>

  <div class="backend-section">Local (Fully Sovereign) — Ollama</div>
  <div id="ollama-models">
    <div class="backend-item disabled">Loading...</div>
  </div>

  <div class="backend-section">Session</div>
  <div class="backend-item" onclick="clearChatHistory()" style="color:#FFD700">
    ⟳ Clear chat history (keep game files)
  </div>
  <div class="backend-item" onclick="viewSessionLog()" style="color:#14F195">
    📋 View session log (models used, latency, errors)
  </div>

  <div class="backend-section">About</div>
  <div class="backend-item disabled" style="font-size:10px;line-height:1.5;display:block">
    <span style="color:#14F195">Brain swappable.</span> Context carried across swaps via chat history.<br>
    <span style="color:#666">Default: Anthropic (cloud). Sovereign: Ollama (local).</span>
  </div>
</div>

<div class="main">
  <div class="left-panel">
    <div class="chat-scroll" id="chat">
      <div class="chat-msg system">
        <div class="bubble" style="color:#9945FF;font-size:13px;font-weight:bold">GAMERPLEX — Sovereign Game Development</div>
      </div>
      <div class="chat-msg ai">
        <div class="label">Gamerplex</div>
        <div class="bubble">Hey! Let's build a game. A few questions to get started:<br><br><strong style="color:#14F195">1.</strong> What kind of game? (platformer, puzzle, shooter, horror, racing, card game, or describe anything)<br><br><strong style="color:#14F195">2.</strong> What's the vibe? (pixel art, neon, low-poly, dark, cute, retro)<br><br><strong style="color:#14F195">3.</strong> Multiplayer or single player?<br><br><strong style="color:#14F195">4.</strong> Should players be able to wager on matches?<br><br>Or just describe your idea and I'll figure it out.</div>
      </div>
    </div>

    <div class="chat-input-area">
      <div class="screenshot-preview" id="screenshot-preview">
        <img id="screenshot-img" />
        <button class="remove-btn" onclick="removeScreenshot()">&times;</button>
      </div>
      <div class="chat-input-row">
        <button class="screenshot-btn" id="screenshot-btn" onclick="captureScreenshot()" title="Capture game screenshot">&#128247;</button>
        <button class="mic-btn" id="mic-btn" onclick="toggleMic()" title="Voice input (hold V for push-to-talk)">&#127908;</button>
        <input type="text" class="chat-input" id="chat-input"
          placeholder="Type or hold V to talk... (Enter to send)"
          autocomplete="off" />
        <button class="send-btn" id="send-btn" onclick="sendMessage()">Send</button>
      </div>
      <div class="quick-actions">
        <button class="quick-btn" onclick="quickSend('add more coins')">+ coins</button>
        <button class="quick-btn" onclick="quickSend('add screen shake on death')">+ juice</button>
        <button class="quick-btn" onclick="quickSend('make the jump higher')">tweak jump</button>
        <button class="quick-btn" onclick="quickSend('add a new enemy type')">+ enemy</button>
        <button class="quick-btn" onclick="quickSend('change the sky color to night')">night sky</button>
        <button class="quick-btn" onclick="reloadGame()">reload</button>
      </div>
      <div class="chat-hint">AI edits game files directly. Game preview auto-reloads.</div>
    </div>
  </div>

  <div class="game-panel" id="game-panel">
    <div class="compare-container" id="compare-container">
      <!-- Main slot -->
      <div class="slot-panel main-slot">
        <div class="slot-header">
          <span class="slot-label">MAIN</span>
          <span class="slot-backend" id="slot-backend-main" onclick="toggleBackendMenu('main')">Claude Code</span>
          <span class="slot-spinner" id="slot-spinner-main"></span>
        </div>
        <iframe id="game-frame" src="/game"></iframe>
      </div>
      <!-- Compare slot (shown when compareMode is on) -->
      <div class="slot-panel compare-slot" id="compare-slot" style="display:none">
        <div class="slot-header">
          <span class="slot-label" style="background:#14F195">COMPARE</span>
          <span class="slot-backend" id="slot-backend-compare" onclick="toggleBackendMenu('compare')">Claude Code</span>
          <span class="slot-spinner" id="slot-spinner-compare"></span>
        </div>
        <iframe id="game-frame-compare" src="/game/compare"></iframe>
      </div>
    </div>
    <div class="status-overlay" id="status-overlay">
      <div class="spinner"></div>
      <span id="status-msg">Reloading...</span>
    </div>
    <div class="reload-flash" id="flash"></div>
    <div class="update-toast" id="update-toast">
      <span class="toast-icon">&#9998;</span>
      <div class="toast-text"><strong>Code updated</strong><br><span id="toast-detail">AI edited the game</span></div>
      <button class="toast-btn" onclick="applyUpdate()">Restart Game</button>
      <button class="toast-btn secondary" onclick="dismissToast()">Dismiss</button>
    </div>
  </div>
</div>

<div class="bottombar">
  <span><span class="key">Arrows</span> Move</span>
  <span><span class="key">Space</span> Jump</span>
  <span><span class="key">Z</span> Alt Jump</span>
  <span style="margin-left:auto; opacity:0.7">localhost:${PORT}</span>
</div>

<script>
  const chat = document.getElementById("chat");
  const input = document.getElementById("chat-input");
  const sendBtn = document.getElementById("send-btn");
  const frame = document.getElementById("game-frame");
  const overlay = document.getElementById("status-overlay");
  const statusMsg = document.getElementById("status-msg");
  const statusDot = document.getElementById("status-dot");
  const flash = document.getElementById("flash");
  const updateToast = document.getElementById("update-toast");
  const toastDetail = document.getElementById("toast-detail");
  const screenshotPreview = document.getElementById("screenshot-preview");
  const screenshotImg = document.getElementById("screenshot-img");
  const screenshotBtn = document.getElementById("screenshot-btn");
  let editCount = 0;
  let busy = false;
  let pendingScreenshot = null; // base64 PNG string

  // Focus input on load
  input.focus();

  // --- Screenshot capture ---
  function captureScreenshot() {
    try {
      const iframeDoc = frame.contentWindow || frame.contentDocument;
      const canvas = iframeDoc.document.querySelector("canvas");
      if (!canvas) {
        addMsg("system", '<span style="color:#FFD700">No canvas found in game — cannot capture screenshot</span>');
        return;
      }
      const dataUrl = canvas.toDataURL("image/png");
      pendingScreenshot = dataUrl;
      screenshotImg.src = dataUrl;
      screenshotPreview.classList.add("visible");
      screenshotBtn.classList.add("active");
      addMsg("system", '<span style="color:#14F195">Screenshot captured — will be sent with next message</span>');
    } catch (err) {
      addMsg("system", '<span style="color:#ff4444">Screenshot failed: ' + err.message + '</span>');
    }
  }

  function removeScreenshot() {
    pendingScreenshot = null;
    screenshotPreview.classList.remove("visible");
    screenshotBtn.classList.remove("active");
  }

  // --- Backend Switcher ---
  const backendTag = document.getElementById("backend-tag");
  const backendDropdown = document.getElementById("backend-dropdown");
  const ollamaList = document.getElementById("ollama-models");

  let activeSlot = "main"; // which slot the dropdown is editing

  function toggleBackendMenu(slot) {
    if (slot) activeSlot = slot;
    backendDropdown.classList.toggle("open");
    if (backendDropdown.classList.contains("open")) {
      loadOllamaModels();
      // Visual hint: which slot are we editing?
      backendDropdown.querySelector(".backend-section").textContent =
        "Editing: " + activeSlot.toUpperCase() + " slot — Anthropic (Recommended)";
    }
  }

  let compareModeEnabled = false;
  const compareSlot = document.getElementById("compare-slot");
  const compareToggle = document.getElementById("compare-toggle");
  const sessionBadge = document.getElementById("session-badge");
  let turnCount = 0;

  function bumpTurnCount() {
    turnCount++;
    sessionBadge.textContent = turnCount + " turn" + (turnCount === 1 ? "" : "s");
  }

  async function clearChatHistory() {
    if (!confirm("Clear chat history? Game files stay intact.")) return;
    await fetch("/api/history/clear", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slot: "main" }),
    });
    if (compareModeEnabled) {
      await fetch("/api/history/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slot: "compare" }),
      });
    }
    turnCount = 0;
    sessionBadge.textContent = "0 turns";
    backendDropdown.classList.remove("open");
    addMsg("system", '<span style="color:#FFD700">Chat history cleared.</span> Game files untouched. Next prompt starts fresh conversation.');
  }

  async function viewSessionLog() {
    backendDropdown.classList.remove("open");
    try {
      const res = await fetch("/api/session/log");
      const data = await res.json();
      const entries = data.entries || [];
      if (entries.length === 0) {
        addMsg("system", '<span style="color:#888">No session log yet — send a prompt first.</span>');
        return;
      }
      const summary = data.summary || {};
      const backends = Object.entries(summary.backends || {})
        .map(([k, v]) => k + ": " + v).join(", ");
      const lines = [
        '<div style="font-family:monospace;font-size:10px;line-height:1.5">',
        '<strong style="color:#14F195">Session Log</strong><br>',
        entries.length + ' turns | ' + summary.errors + ' errors | avg ' + summary.avgLatencyMs + 'ms<br>',
        'Backends: ' + backends + '<br><br>',
        ...entries.slice(-10).map((e) => {
          const t = new Date(e.ts).toLocaleTimeString();
          const err = e.error ? ' <span style="color:#f44">ERR</span>' : '';
          const cmp = e.compareMode ? ' <span style="color:#9945FF">CMP</span>' : '';
          return '<div>' + t + ' <span style="color:#14F195">' + (e.model || e.backend) + '</span> ' + (e.latencyMs/1000).toFixed(1) + 's tools=' + (e.toolCount||0) + err + cmp + '</div>';
        }),
        '</div>',
      ];
      addMsg("system", lines.join(""));
    } catch (err) {
      addMsg("system", '<span style="color:#f44">Log fetch failed: ' + err.message + '</span>');
    }
  }

  async function toggleCompareMode() {
    compareModeEnabled = !compareModeEnabled;
    compareToggle.classList.toggle("active", compareModeEnabled);
    compareSlot.style.display = compareModeEnabled ? "flex" : "none";
    document.body.classList.toggle("compare-mode", compareModeEnabled);

    if (compareModeEnabled) {
      // Fresh reload of compare iframe — shows placeholder until AI builds something
      document.getElementById("game-frame-compare").src = "/game/compare?t=" + Date.now();
    }

    await fetch("/api/compare-mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: compareModeEnabled }),
    });

    addMsg("system", compareModeEnabled
      ? '<span style="color:#14F195">Compare mode ON</span> — next prompt builds in both slots from scratch. Click the backend tag on either slot to pick a different model.'
      : '<span style="color:#888">Compare mode OFF</span> — single slot mode.');
  }

  document.addEventListener("click", (e) => {
    if (!backendDropdown.contains(e.target) && e.target !== backendTag) {
      backendDropdown.classList.remove("open");
    }
  });

  async function loadOllamaModels() {
    try {
      const res = await fetch("/api/backends");
      const data = await res.json();
      if (!data.ollama || data.ollama.length === 0) {
        ollamaList.innerHTML = '<div class="backend-item disabled">No Ollama models found. Install: <code>ollama pull qwen2.5-coder</code></div>';
        return;
      }
      // Filter out embedding models (not useful for chat)
      const chatModels = data.ollama.filter(m => !m.name.includes("embed"));
      ollamaList.innerHTML = chatModels.map(m => {
        const sizeGB = (m.size / 1e9).toFixed(1);
        const escaped = escHtml(m.name).replace(/'/g, "&#39;");
        return '<div class="backend-item" data-backend="ollama:' + escaped + '" onclick="selectBackend(\\'ollama:' + escaped + '\\', \\'' + escaped + '\\', \\'' + escaped + '\\', \\'http://localhost:11434\\')">' +
          escaped +
          '<span class="size">' + sizeGB + 'GB</span>' +
          '</div>';
      }).join("");
    } catch {
      ollamaList.innerHTML = '<div class="backend-item disabled">Ollama not reachable at localhost:11434</div>';
    }
  }

  async function selectBackend(id, label, model, baseUrl, apiKey) {
    // Update the active slot's UI label
    if (activeSlot === "main") {
      backendTag.textContent = label;
      document.getElementById("slot-backend-main").textContent = label;
    } else {
      document.getElementById("slot-backend-compare").textContent = label;
    }

    document.querySelectorAll(".backend-item[data-backend]").forEach(el => el.classList.remove("active"));
    const item = document.querySelector('.backend-item[data-backend="' + id + '"]');
    if (item) item.classList.add("active");
    backendDropdown.classList.remove("open");

    await fetch("/api/backend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, label, model: model || null, baseUrl: baseUrl || null, apiKey: apiKey || null, slot: activeSlot }),
    });

    const tier = id === "claude-oauth" ? "default (OAuth)" :
                 id.startsWith("ollama:") ? "local — sovereign" :
                 "cloud (API key)";
    addMsg("system", '<span style="color:#9945FF">[' + activeSlot.toUpperCase() + '] Backend:</span> <strong style="color:#14F195">' + label + '</strong> <span style="color:#666">(' + tier + ')</span>');
  }

  async function promptApiKey(id, label, envVar, baseUrl) {
    const existing = localStorage.getItem(envVar) || "";
    const key = prompt(label + " API key (stored locally in your browser):\\n\\nEnvironment variable: " + envVar, existing);
    if (!key) return;
    localStorage.setItem(envVar, key);
    selectBackend(id, label, null, baseUrl || null, key);
  }

  // --- Voice Input (Web Speech API) ---
  const micBtn = document.getElementById("mic-btn");
  let recognition = null;
  let isRecording = false;

  if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = function(event) {
      let final = "", interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += transcript;
        } else {
          interim = transcript;
        }
      }
      // Show interim in input as preview
      if (interim) input.value = interim;
      // Final result: append to input
      if (final) {
        input.value = (input.value === interim ? "" : input.value + " ") + final;
        input.value = input.value.trim();
      }
    };

    recognition.onerror = function(event) {
      console.log("Speech error:", event.error);
      stopMic();
    };

    recognition.onend = function() {
      if (isRecording) {
        // Auto-restart for continuous mode
        try { recognition.start(); } catch {}
      }
    };
  }

  function toggleMic() {
    if (!recognition) {
      addMsg("system", '<span style="color:#FFD700">Speech recognition not available in this browser</span>');
      return;
    }
    if (isRecording) stopMic();
    else startMic();
  }

  function startMic() {
    if (!recognition || isRecording) return;
    isRecording = true;
    micBtn.classList.add("recording");
    input.placeholder = "Listening... (speak now)";
    try { recognition.start(); } catch {}
    addMsg("system", '<span style="color:#9945FF">Microphone active — speak to vibe code</span>');
  }

  function stopMic() {
    if (!isRecording) return;
    isRecording = false;
    micBtn.classList.remove("recording");
    input.placeholder = "Type or hold V to talk... (Enter to send)";
    try { recognition.stop(); } catch {}
    // If there's text in the input from speech, auto-send
    if (input.value.trim()) {
      sendMessage();
    }
  }

  // Push-to-talk: hold V key (only when input not focused)
  document.addEventListener("keydown", function(e) {
    if (e.code === "KeyV" && document.activeElement !== input && !e.repeat) {
      startMic();
    }
    // "/" focuses the input (like vim command mode)
    if (e.code === "Slash" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
  document.addEventListener("keyup", function(e) {
    if (e.code === "KeyV" && document.activeElement !== input) {
      stopMic();
    }
  });

  // Enter to send
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !busy) { e.preventDefault(); sendMessage(); }
  });

  // Click game to focus it, click outside to focus input
  frame.addEventListener("load", () => frame.contentWindow.focus());
  document.addEventListener("click", (e) => {
    const rect = frame.getBoundingClientRect();
    if (e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom) {
      frame.contentWindow.focus();
    }
  });

  function addMsg(type, content) {
    const div = document.createElement("div");
    div.className = "chat-msg " + type;
    if (type === "user") {
      div.innerHTML = '<div class="label">You</div><div class="bubble">' + escHtml(content) + '</div>';
    } else if (type === "ai") {
      div.innerHTML = '<div class="label">AI</div><div class="bubble">' + escHtml(content) + '</div>';
    } else {
      div.innerHTML = '<div class="bubble">' + content + '</div>';
    }
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
    return div;
  }

  function updateAiMsg(div, content) {
    const bubble = div.querySelector(".bubble");
    if (bubble) bubble.textContent = content;
    chat.scrollTop = chat.scrollHeight;
  }

  function escHtml(s) { return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }

  function renderMd(raw) {
    let s = escHtml(raw);
    // Code blocks: \`\`\`...\`\`\`
    s = s.replace(/\`\`\`[\\s\\S]*?\`\`\`/g, (m) => {
      const inner = m.replace(/^\`\`\`\\w*\\n?/, "").replace(/\\n?\`\`\`$/, "");
      return '<pre style="background:#1a1a2e;padding:6px 8px;border-radius:4px;font-size:11px;overflow-x:auto;margin:4px 0">' + inner + '</pre>';
    });
    // Inline code: \`...\`
    s = s.replace(/\`([^\`]+)\`/g, '<code style="background:#1a1a2e;padding:1px 4px;border-radius:2px;font-size:11px">$1</code>');
    // Bold: **...**
    s = s.replace(/\\*\\*(.+?)\\*\\*/g, '<strong style="color:#e0e0e0">$1</strong>');
    // Headers: # ... → just bold
    s = s.replace(/^#{1,4}\\s+(.+)$/gm, '<strong style="color:#14F195">$1</strong>');
    // Numbered lists: 1. ... → clean
    s = s.replace(/^(\\d+)\\.\\s+/gm, '<span style="color:#9945FF">$1.</span> ');
    // Bullet: - ...
    s = s.replace(/^-\\s+/gm, '<span style="color:#9945FF">&bull;</span> ');
    // Newlines → <br>
    s = s.replace(/\\n/g, '<br>');
    return s;
  }

  function setBusy(b) {
    busy = b;
    input.disabled = b;
    sendBtn.disabled = b;
    sendBtn.textContent = b ? "..." : "Send";
    statusDot.className = b ? "dot busy" : "dot live";
    if (b) {
      overlay.classList.add("active");
      statusMsg.textContent = "AI is thinking...";
    }
    if (!b) input.focus();
  }

  async function sendMessage() {
    const msg = input.value.trim();
    if (!msg || busy) return;
    input.value = "";

    // Show user message with screenshot thumbnail if attached
    const userDiv = addMsg("user", msg);
    if (pendingScreenshot) {
      const thumb = document.createElement("img");
      thumb.className = "screenshot-thumb";
      thumb.src = pendingScreenshot;
      userDiv.querySelector(".bubble").appendChild(thumb);
    }

    setBusy(true);

    // Activate spinners on active slot(s)
    document.getElementById("slot-spinner-main").className = "slot-spinner active";
    if (compareModeEnabled) {
      document.getElementById("slot-spinner-compare").className = "slot-spinner active";
    }

    // Single rolling status line — replaces itself
    const statusDiv = addMsg("ai", "");
    const statusBubble = statusDiv.querySelector(".bubble");
    statusBubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div> <span class="status-line">Starting...</span>';

    const payload = { message: msg };
    if (pendingScreenshot) {
      payload.screenshot = pendingScreenshot;
      removeScreenshot();
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";
      let lastTool = "";
      let madeEdits = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split("\\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === "text" && data.text) {
                fullText += data.text;
                // Update rolling status with last ~60 chars of text
                const preview = fullText.replace(/\\s+/g, " ").trim();
                const short = preview.length > 80 ? "..." + preview.slice(-80) : preview;
                statusBubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div> <span class="status-line">' + escHtml(short) + '</span>';
                chat.scrollTop = chat.scrollHeight;
              } else if (data.type === "tool") {
                lastTool = data.name;
                if (data.name === "Edit" || data.name === "Write") {
                  madeEdits = true;
                  editCount++;
                  document.getElementById("edit-count").textContent = editCount + " edit" + (editCount === 1 ? "" : "s");
                }
                const toolLabel = {Read:"Reading file",Edit:"Editing game",Write:"Writing file",Bash:"Running command",Glob:"Searching files",Grep:"Searching code"}[data.name] || data.name;
                statusBubble.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div> <span class="status-line">' + toolLabel + '...</span>';
                chat.scrollTop = chat.scrollHeight;
              } else if (data.type === "done") {
                // Per-slot completion
                if (data.slot) {
                  const s = document.getElementById("slot-spinner-" + data.slot);
                  if (s) s.className = "slot-spinner done";
                }
              } else if (data.type === "all-done") {
                document.getElementById("slot-spinner-main").className = "slot-spinner";
                document.getElementById("slot-spinner-compare").className = "slot-spinner";
                bumpTurnCount();
              } else if (data.type === "error") {
                fullText += "\\nError: " + data.message;
              }
            } catch {}
          }
        }
      }

      // --- Final response: just the last meaningful text ---
      // Extract only the final paragraph/sentence from Claude's full output
      const sentences = fullText.replace(/\\[.*?\\]/g, "").replace(/\\n+/g, "\\n").trim().split("\\n").filter(s => s.trim());
      const finalMsg = sentences.slice(-3).join("\\n") || "(done)";

      // Replace rolling status with final clean response (rendered markdown)
      statusDiv.remove();
      const finalDiv = addMsg("ai", "");
      const finalBubble = finalDiv.querySelector(".bubble");
      finalBubble.innerHTML = renderMd(finalMsg);

      // Add "did it fix it?" feedback buttons if edits were made
      if (madeEdits) {
        const fb = document.createElement("div");
        fb.style.cssText = "margin-top:8px;display:flex;gap:8px;";
        fb.innerHTML = '<span style="color:#888;font-size:11px;line-height:28px;">Did it fix it?</span>' +
          '<button class="quick-btn" style="color:#14F195;border-color:#14F195" onclick="sendFeedback(true,this)">Yes</button>' +
          '<button class="quick-btn" style="color:#ff4444;border-color:#ff4444" onclick="sendFeedback(false,this)">No</button>';
        finalBubble.appendChild(fb);
      }

      chat.scrollTop = chat.scrollHeight;

    } catch (err) {
      statusDiv.remove();
      addMsg("ai", "Connection error: " + err.message);
    }

    setBusy(false);
    overlay.classList.remove("active");
  }

  function sendFeedback(fixed, btn) {
    // Remove the buttons
    const row = btn.parentElement;
    row.innerHTML = fixed
      ? '<span style="color:#14F195;font-size:11px;">Nice! Moving on.</span>'
      : '<span style="color:#FFD700;font-size:11px;">Noted — describe what\\'s still wrong below.</span>';
    if (fixed) {
      addMsg("system", '<span style="color:#14F195">Bug marked as fixed</span>');
    } else {
      input.focus();
      input.placeholder = "Describe what\\'s still wrong...";
    }
  }

  function quickSend(msg) {
    input.value = msg;
    sendMessage();
  }

  // --- Matrix Cat ---
  let catDirection = 0;
  const meowCtx = new (window.AudioContext || window.webkitAudioContext)();

  function meow() {
    try {
      // Synth meow: slide from high to low frequency
      const o = meowCtx.createOscillator();
      const g = meowCtx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(900, meowCtx.currentTime);
      o.frequency.exponentialRampToValueAtTime(300, meowCtx.currentTime + 0.25);
      g.gain.setValueAtTime(0.15, meowCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, meowCtx.currentTime + 0.3);
      o.connect(g); g.connect(meowCtx.destination);
      o.start(); o.stop(meowCtx.currentTime + 0.3);
    } catch {}
  }

  function spawnCat() {
    if (meowCtx.state === "suspended") meowCtx.resume();
    const gamePanel = document.querySelector(".game-panel");
    const cat = document.createElement("div");
    cat.className = "matrix-cat" + (catDirection % 2 === 1 ? " reverse" : "");
    cat.textContent = "\\u{1f408}\\u{200d}\\u{2b1b}";  // black cat emoji
    gamePanel.appendChild(cat);
    meow();
    catDirection++;
    setTimeout(() => cat.remove(), 2000);
  }

  let pendingUpdates = 0;

  function showUpdateToast(detail) {
    pendingUpdates++;
    toastDetail.textContent = detail || "AI edited the game";
    updateToast.classList.add("visible");
    // Flash the border of the game panel
    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 300);
  }

  function applyUpdate() {
    pendingUpdates = 0;
    updateToast.classList.remove("visible");
    overlay.classList.add("active");
    statusMsg.textContent = "Restarting game...";
    frame.src = "/game?t=" + Date.now();
    frame.addEventListener("load", () => {
      overlay.classList.remove("active");
      addMsg("system", '<span style="color:#14F195">Game restarted with latest changes</span>');
    }, { once: true });
  }

  function dismissToast() {
    updateToast.classList.remove("visible");
  }

  function reloadGame() {
    overlay.classList.add("active");
    statusMsg.textContent = "Reloading...";
    flash.classList.add("active");
    setTimeout(() => flash.classList.remove("active"), 200);
    frame.src = "/game?t=" + Date.now();
    frame.addEventListener("load", () => overlay.classList.remove("active"), { once: true });
    updateToast.classList.remove("visible");
    pendingUpdates = 0;
  }

  // WebSocket for file-change reloads + status pushes
  let ws, retries = 0;
  function connect() {
    ws = new WebSocket("ws://localhost:${PORT}");
    ws.onmessage = function(e) {
      let data;
      try { data = JSON.parse(e.data); } catch { data = null; }

      // Slot-aware reload: JSON { type: "reload", slot: "main"|"compare" }
      const isReload = e.data === "reload" || (data && data.type === "reload");
      if (isReload) {
        const slot = (data && data.slot) || "main";
        editCount++;
        document.getElementById("edit-count").textContent = editCount + " edit" + (editCount === 1 ? "" : "s");
        spawnCat();

        // Reload the right iframe
        if (slot === "compare") {
          document.getElementById("game-frame-compare").src = "/game/compare?t=" + Date.now();
          document.getElementById("slot-spinner-compare").className = "slot-spinner done";
        } else {
          addMsg("system", '<span style="color:#9945FF">[MAIN] Code updated</span>');
          showUpdateToast("Code changed — restart to see the fix");
          document.getElementById("slot-spinner-main").className = "slot-spinner done";
        }
      } else if (data && data.type === "status") {
        addMsg("system", data.icon + " " + data.message +
          (data.status ? ' <span style="color:' + (data.statusClass==="done"?"#14F195":data.statusClass==="error"?"#f44":"#FFD700") + '">' + data.status + '</span>' : ''));
      }
    };
    ws.onclose = () => { if (retries++ < 100) setTimeout(connect, 500); };
    ws.onopen = () => { retries = 0; };
  }
  connect();
</script>
</body>
</html>`;
}

// --- HTTP Server ---
const server = createServer((req, res) => {
  const url = req.url.split("?")[0];

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

  // --- CHAT API: Browser sends message + optional screenshot, server spawns Claude Code ---
  if (url === "/api/chat" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const { message, screenshot } = JSON.parse(body);

        // Save screenshot if provided
        let screenshotPath = null;
        if (screenshot && screenshot.startsWith("data:image/png;base64,")) {
          const { writeFileSync } = require("fs");
          screenshotPath = join(gameDir, ".screenshot.png");
          const base64Data = screenshot.replace("data:image/png;base64,", "");
          writeFileSync(screenshotPath, Buffer.from(base64Data, "base64"));
          console.log("  [screenshot] Saved to " + screenshotPath);
        }

        // Build prompt — include screenshot reference if available
        let fullPrompt = message;
        if (screenshotPath) {
          fullPrompt = `The user has attached a screenshot of the current game state. IMPORTANT: First use the Read tool to look at the screenshot file at ${screenshotPath} so you can see what the game currently looks like. Then address the user's request:\n\n${message}`;
        }

        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          "Connection": "keep-alive",
        });

        function sendSSE(data) {
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        }

        sendSSE({ type: "text", text: "" }); // flush headers

        // Dispatch to one or both slots based on compare mode
        const runSlot = (slot) => new Promise((resolveSlot) => {
          runAgent(
            fullPrompt,
            (event) => {
              // Structured events from either harness: {type, text?, name?}
              if (typeof event === "string") {
                sendSSE({ type: "text", slot, text: event });
              } else {
                sendSSE({ ...event, slot });
              }
            },
            (fullResponse, exitCode) => {
              sendSSE({ type: "done", slot, exitCode });
              resolveSlot();
            },
            slot
          );
        });

        (async () => {
          if (!compareMode) {
            await runSlot("main");
          } else {
            const bothOllama = isOllama(backends.main) && isOllama(backends.compare);
            if (bothOllama) {
              // Serial: Ollama can only run one model at a time
              sendSSE({ type: "status", message: "Both on Ollama — running serially" });
              await runSlot("main");
              await runSlot("compare");
            } else {
              // Parallel: different endpoints, run concurrently
              sendSSE({ type: "status", message: "Running both backends in parallel" });
              await Promise.all([runSlot("main"), runSlot("compare")]);
            }
          }
          sendSSE({ type: "all-done" });
          res.end();
        })();
      } catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // --- BACKEND SWITCH: Change active AI backend ---
  if (url === "/api/backend" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const { id, label, model, baseUrl, apiKey, slot } = JSON.parse(body);
        const slotKey = (slot === "compare") ? "compare" : "main";
        setBackend(slotKey, { id, label, model: model || null, baseUrl: baseUrl || null, apiKey: apiKey || null });
        if (slotKey === "main") currentBackend = backends.main; // back-compat
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end('{"error":"invalid"}');
      }
    });
    return;
  }

  // --- SESSION HISTORY API ---
  if (url === "/api/history" && req.method === "GET") {
    const slotParam = req.url.split("?")[1] || "";
    const slot = slotParam.includes("compare") ? "compare" : "main";
    const slotDir = slot === "compare" ? join(gameDir, "..", basename(gameDir) + "-compare") : gameDir;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      slot,
      history: chatHistory[slot] || [],
      sessionLog: sessionLog.summary(slotDir),
    }));
    return;
  }

  if (url === "/api/history/clear" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const { slot } = JSON.parse(body || "{}");
        const target = slot === "compare" ? "compare" : "main";
        clearHistory(target);
        // Also clear the persistent log if requested
        // (keep it for now — let users see history even after clearing chat)
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, slot: target }));
      } catch (e) {
        res.writeHead(400); res.end('{"error":"invalid"}');
      }
    });
    return;
  }

  if (url === "/api/session/log" && req.method === "GET") {
    // Return full session log entries for the main slot
    const logs = sessionLog.readAll(gameDir);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ entries: logs.slice(-50), summary: sessionLog.summary(gameDir) }));
    return;
  }

  // --- COMPARE MODE: Toggle dual-slot mode ---
  if (url === "/api/compare-mode" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => body += c);
    req.on("end", () => {
      try {
        const { enabled } = JSON.parse(body);
        compareMode = !!enabled;
        console.log(`  [compare-mode] ${compareMode ? "ON" : "OFF"}`);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, compareMode }));
      } catch (e) {
        res.writeHead(400); res.end('{"error":"invalid"}');
      }
    });
    return;
  }

  // --- Serve compare slot game ---
  if (url === "/game/compare") {
    const compareDir = join(gameDir, "..", basename(gameDir) + "-compare");
    const compareHtml = join(compareDir, "index.html");
    const placeholder = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Compare — Waiting</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { background:#0a0a0f; display:flex; justify-content:center; align-items:center; height:100vh; color:#fff; font-family:monospace; }
.wait { text-align:center; padding:24px; }
.wait .label { display:inline-block; background:#14F195; color:#000; padding:4px 12px; border-radius:4px; font-size:10px; font-weight:bold; letter-spacing:1px; margin-bottom:20px; }
.wait h2 { font-size:16px; color:#888; font-weight:normal; margin-bottom:8px; }
.wait p { font-size:12px; color:#555; line-height:1.6; max-width:280px; margin:0 auto; }
.wait .icon { font-size:32px; margin-bottom:14px; opacity:0.5; }
</style></head><body>
<div class="wait">
  <div class="icon">⇆</div>
  <div class="label">COMPARE SLOT</div>
  <h2>Waiting for a prompt</h2>
  <p>Type in the chat — both models will build the same thing.<br><br>Click <strong style="color:#14F195">Claude Code</strong> above to pick a different model for this slot.</p>
</div>
</body></html>`;

    if (existsSync(compareHtml)) {
      const content = readFileSync(compareHtml, "utf-8");
      // If it's the stub we wrote, show the friendly placeholder instead
      if (content.length < 150) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(placeholder);
      } else {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(content);
      }
    } else {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(placeholder);
    }
    return;
  }

  // --- BACKENDS API: List available AI backends ---
  if (url === "/api/backends" && req.method === "GET") {
    (async () => {
      const response = { claudeCode: true, ollama: [] };
      try {
        // Fetch Ollama model list from localhost:11434
        const ollamaReq = await new Promise((resolve, reject) => {
          const http = require("http");
          const r = http.get("http://localhost:11434/api/tags", (resp) => {
            let data = "";
            resp.on("data", (c) => data += c);
            resp.on("end", () => resolve(data));
          });
          r.on("error", reject);
          r.setTimeout(1500, () => { r.destroy(); reject(new Error("timeout")); });
        });
        const parsed = JSON.parse(ollamaReq);
        response.ollama = (parsed.models || []).map(m => ({
          name: m.name,
          size: m.size,
          family: m.details?.family || "",
        }));
      } catch {}
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(response));
    })();
    return;
  }

  // --- STATUS API: MCP tools push updates ---
  if (url === "/api/status" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => body += chunk);
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        console.log(`  [mcp] ${data.message} — ${data.status || ""}`);
        broadcast(JSON.stringify({ type: "status", ...data }));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400); res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  // --- Page routes ---
  if (url === "/" || url === "/index.html") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(devShell());
    return;
  }

  if (url === "/game") {
    let content = readFileSync(join(gameDir, "index.html"), "utf-8");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(content);
    return;
  }

  const filePath = join(gameDir, url);
  if (!existsSync(filePath)) { res.writeHead(404); res.end("Not found"); return; }
  const content = readFileSync(filePath);
  const ext = filePath.split(".").pop();
  const types = { html: "text/html", js: "application/javascript", css: "text/css", png: "image/png", jpg: "image/jpeg", json: "application/json" };
  res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
  res.end(content);
});

// --- WebSocket upgrade ---
// --- WebSocket via ws library ---
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  clients.add(ws);
  console.log(`  [ws] Client connected (${clients.size} total)`);
  ws.on("close", () => { clients.delete(ws); console.log(`  [ws] Client disconnected (${clients.size} total)`); });
  ws.on("error", () => { clients.delete(ws); });
});

function broadcast(msg) {
  console.log(`  [ws] Broadcasting to ${clients.size} client(s): ${msg.substring(0, 50)}`);
  for (const client of clients) {
    if (client.readyState === 1) { // OPEN
      client.send(msg);
    }
  }
}

// --- Watch for file changes ---
let debounce = null;
let debounceCompare = null;

function ignoreFile(fn) {
  return !fn || fn.startsWith(".") || fn.endsWith(".png");
}

watch(gameDir, { recursive: true }, (event, filename) => {
  if (ignoreFile(filename)) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    editCount++;
    console.log(`  [edit #${editCount} main] ${filename} changed`);
    broadcast(JSON.stringify({ type: "reload", slot: "main" }));
  }, 200);
});

// Watch compare slot directory too
const compareDir = join(gameDir, "..", basename(gameDir) + "-compare");
try {
  // Create it if missing so watch doesn't fail
  if (!existsSync(compareDir)) require("fs").mkdirSync(compareDir, { recursive: true });
  watch(compareDir, { recursive: true }, (event, filename) => {
    if (ignoreFile(filename)) return;
    if (debounceCompare) clearTimeout(debounceCompare);
    debounceCompare = setTimeout(() => {
      console.log(`  [edit compare] ${filename} changed`);
      broadcast(JSON.stringify({ type: "reload", slot: "compare" }));
    }, 200);
  });
} catch (e) {
  console.log("  [watch] compare dir not watched:", e.message);
}

server.listen(PORT, () => {
  console.log("");
  console.log("  \x1b[35m┌─────────────────────────────────────────────────┐\x1b[0m");
  console.log("  \x1b[35m│\x1b[0m  \x1b[1mGAMERPLEX DEV SERVER\x1b[0m                            \x1b[35m│\x1b[0m");
  console.log("  \x1b[35m│\x1b[0m  Game:    \x1b[32m" + gameName.padEnd(39) + "\x1b[35m│\x1b[0m");
  console.log("  \x1b[35m│\x1b[0m  URL:     \x1b[36mhttp://localhost:" + PORT + "\x1b[0m                    \x1b[35m│\x1b[0m");
  console.log("  \x1b[35m│\x1b[0m  Backend: \x1b[33mClaude Code CLI\x1b[0m                         \x1b[35m│\x1b[0m");
  console.log("  \x1b[35m│\x1b[0m                                                 \x1b[35m│\x1b[0m");
  console.log("  \x1b[35m│\x1b[0m  Type in the chat. AI edits. Game reloads live. \x1b[35m│\x1b[0m");
  console.log("  \x1b[35m└─────────────────────────────────────────────────┘\x1b[0m");
  console.log("");
});

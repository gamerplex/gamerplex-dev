/**
 * Gamerplex Agent — Sovereign agentic runtime
 *
 * A minimal agentic runtime that works with:
 *   - Ollama (local, /api/chat)
 *   - OpenAI-compatible APIs (OpenAI, Gemini, OpenXAI, groq, etc. — /v1/chat/completions)
 *
 * We own every layer. No harness dependencies. This IS the sovereign agent.
 *
 * Flow:
 *   1. Load CLAUDE.md + skills as system prompt
 *   2. Define tools (edit, write, read, bash) in OpenAI function-calling format
 *   3. Stream /api/chat (Ollama) or /v1/chat/completions (OpenAI-compat) with tools
 *   4. When model calls a tool, execute it locally
 *   5. Feed result back to model, loop until done
 *   6. Stream text + tool events to the dev server
 */

const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const http = require("http");
const https = require("https");

// ============================================================
// TOOL DEFINITIONS (OpenAI function-calling format)
// ============================================================

const TOOLS = [
  {
    type: "function",
    function: {
      name: "edit_file",
      description: "Edit a file by replacing exact old_string with new_string. old_string MUST be unique in the file.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, relative to project root" },
          old_string: { type: "string", description: "Exact text to find (must match once)" },
          new_string: { type: "string", description: "Replacement text" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with new content. Use only for new files or complete rewrites.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, relative to project root" },
          content: { type: "string", description: "Full file contents" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file's contents.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path, relative to project root" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "bash",
      description: "Run a shell command. Use sparingly. Prefer read/edit/write for file operations.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
];

// ============================================================
// TOOL EXECUTION
// ============================================================

function walkDir(dir, exts = [".md"]) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(full, exts));
    } else if (exts.some((e) => entry.name.endsWith(e))) {
      results.push(full);
    }
  }
  return results;
}

function resolveSafe(gameDir, relPath) {
  const abs = path.resolve(gameDir, relPath);
  const resolvedGameDir = path.resolve(gameDir);
  if (!abs.startsWith(resolvedGameDir)) {
    throw new Error(`Path outside project: ${relPath}`);
  }
  return abs;
}

async function executeTool(name, args, gameDir) {
  try {
    switch (name) {
      case "edit_file": {
        const filePath = resolveSafe(gameDir, args.path);
        if (!fs.existsSync(filePath)) return { error: `File not found: ${args.path}` };
        const content = fs.readFileSync(filePath, "utf-8");
        const matches = content.split(args.old_string).length - 1;
        if (matches === 0) return { error: `old_string not found in ${args.path}` };
        if (matches > 1) return { error: `old_string matches ${matches} times — be more specific` };
        const updated = content.replace(args.old_string, args.new_string);
        fs.writeFileSync(filePath, updated);
        return { success: true, message: `Edited ${args.path} (${content.length} → ${updated.length} bytes)` };
      }

      case "write_file": {
        const filePath = resolveSafe(gameDir, args.path);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, args.content);
        return { success: true, message: `Wrote ${args.path} (${args.content.length} bytes)` };
      }

      case "read_file": {
        const filePath = resolveSafe(gameDir, args.path);
        if (!fs.existsSync(filePath)) return { error: `File not found: ${args.path}` };
        const content = fs.readFileSync(filePath, "utf-8");
        // Cap at 50k chars to prevent context blowup
        if (content.length > 50000) {
          return { content: content.slice(0, 50000) + "\n...[truncated]...", truncated: true };
        }
        return { content };
      }

      case "bash": {
        return await new Promise((resolve) => {
          exec(args.command, { cwd: gameDir, timeout: 30000 }, (err, stdout, stderr) => {
            resolve({
              stdout: (stdout || "").slice(0, 10000),
              stderr: (stderr || "").slice(0, 10000),
              error: err ? err.message : null,
            });
          });
        });
      }

      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e.message };
  }
}

// ============================================================
// SYSTEM PROMPT ASSEMBLY
// ============================================================

// Exported below — `buildSystemPrompt` and `detectProjectContext` are shared
// with dev-server.js's runClaudeCode path so Claude and Ollama see identical
// context (skills loaded, project detection, operating instructions).

/**
 * Walk up from gameDir looking for the nearest package.json. If found, read its
 * deps. Used to auto-detect the project's engine + framework so the right skill
 * files load automatically (matching the docstring on `## Skills` in
 * ../CLAUDE.md, which says skills load "based on the game's engine and genre").
 *
 * Returns {
 *   isNextProject, isPhaser, isThreeJs, isR3F, hasAnchor,
 *   isGamerplexMonorepo,  // gameDir is somewhere inside the contention-gg repo
 *   isGamerplexArcade,    // gameDir is .../gamerplex.com-2026/app/arcade/<slug>/
 *   packageRoot           // path to the dir containing the matched package.json
 * }
 */
function detectProjectContext(gameDir) {
  const ctx = {
    isNextProject: false,
    isPhaser: false,
    isThreeJs: false,
    isR3F: false,
    hasAnchor: false,
    isGamerplexMonorepo: false,
    isGamerplexArcade: false,
    packageRoot: null,
  };
  // Identify Gamerplex monorepo + arcade-route placement by path string —
  // monorepo root is `contention-gg/`, arcade routes live at
  // `gamerplex.com-2026/app/arcade/<slug>/`.
  // Accept either `/contention-gg/` (mid-path) or `/contention-gg` at the end
  // (when a tool inspects the monorepo root itself). Same for the arcade route
  // — tolerate trailing slash optional.
  if (/[/\\]contention-gg([/\\]|$)/.test(gameDir)) ctx.isGamerplexMonorepo = true;
  if (/gamerplex\.com[-_]?2026[/\\]app[/\\]arcade[/\\][^/\\]+/.test(gameDir)) ctx.isGamerplexArcade = true;

  // Walk up dirs looking for package.json (max 8 levels).
  let dir = gameDir;
  for (let i = 0; i < 8 && dir && dir !== path.dirname(dir); i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
        if (deps.next) ctx.isNextProject = true;
        if (deps.phaser) ctx.isPhaser = true;
        if (deps.three) ctx.isThreeJs = true;
        if (deps["@react-three/fiber"]) { ctx.isR3F = true; ctx.isThreeJs = true; }
        if (deps["@coral-xyz/anchor"] || deps["@solana/web3.js"]) ctx.hasAnchor = true;
        ctx.packageRoot = dir;
      } catch { /* malformed package.json — ignore */ }
      break;
    }
    dir = path.dirname(dir);
  }
  return ctx;
}

function buildSystemPrompt(gameDir, devRoot) {
  const parts = [];
  const ctx = detectProjectContext(gameDir);

  // 1. Core ethos (CLAUDE.md at dev root)
  const rootClaude = path.join(devRoot, "CLAUDE.md");
  if (fs.existsSync(rootClaude)) {
    parts.push("# Project Ethos\n\n" + fs.readFileSync(rootClaude, "utf-8"));
  }

  // 2. Project-specific CLAUDE.md (inside gameDir)
  const projectClaude = path.join(gameDir, "CLAUDE.md");
  if (fs.existsSync(projectClaude)) {
    parts.push("# Game-Specific Instructions\n\n" + fs.readFileSync(projectClaude, "utf-8"));
  }

  // 3. Skills — context-aware loading. Honours the ../CLAUDE.md promise that
  //    skills load "based on the game's engine and genre". Core skills always
  //    load; engine + web3 + project skills load when the project context
  //    matches.
  const skillsDir = path.join(devRoot, "skills");
  if (fs.existsSync(skillsDir)) {
    const skillsToLoad = [
      "core/game-feel.md",
      "core/canvas-performance.md",
      "core/game-ux.md",
    ];

    // Engine-specific
    if (ctx.isThreeJs || ctx.isR3F) skillsToLoad.push("engines/threejs.md");
    if (ctx.isPhaser) skillsToLoad.push("engines/phaser.md");

    // Web3 + Gamerplex-arcade — auto-load when this looks like an arcade route
    // OR when Anchor/Solana deps are present. The arcade skill knows about
    // already-deployed contracts, file conventions, and reusable SDK helpers.
    if (ctx.isGamerplexArcade || ctx.hasAnchor || ctx.isGamerplexMonorepo) {
      skillsToLoad.push("web3/on-chain-games.md");
      skillsToLoad.push("projects/gamerplex-arcade.md");
    }

    // De-duplicate while preserving order.
    const seen = new Set();
    const ordered = skillsToLoad.filter((s) => (seen.has(s) ? false : (seen.add(s), true)));

    let skillContent = "";
    const loadedSkills = [];
    for (const rel of ordered) {
      const p = path.join(skillsDir, rel);
      if (fs.existsSync(p)) {
        skillContent += `\n\n### ${rel}\n\n` + fs.readFileSync(p, "utf-8");
        loadedSkills.push(rel);
      }
    }
    if (skillContent) {
      parts.push("# Game Dev Skills (auto-loaded by project context)\n" + skillContent);
    }
    // Surface the loaded skill list for stdout debugging.
    parts.push(`# Skill Manifest\n\nDetected: ${JSON.stringify(ctx, null, 2)}\n\nLoaded skill files:\n- ${loadedSkills.join("\n- ")}`);
  }

  // 4. Operating instructions — adapt to project type.
  if (ctx.isNextProject) {
    parts.push(`# Your Task

Working directory: ${gameDir}
This is a Next.js (App Router) project — likely TypeScript / TSX. Do NOT
create a single index.html. New routes go under \`app/\`. Reuse libraries
already declared in package.json — do NOT npm install new dependencies.

RULES:
- Use edit_file to modify existing files (provide exact old_string, unique in file)
- Use write_file to create new files or complete rewrites
- Use read_file to inspect files before editing — read ANY file referenced in skills BEFORE writing code that depends on it
- Use bash sparingly, only for shell operations (anchor build, vercel deploy, test runs)
- After making changes, briefly describe what you did in 1-2 sentences
- Keep changes minimal and focused — do exactly what was asked
- Match the conventions of files already in the repo (2 spaces, double quotes,
  TypeScript over JavaScript, React Three Fiber over vanilla three)`);
  } else {
    parts.push(`# Your Task

You are building a game. Working directory: ${gameDir}
Main file: ${path.join(gameDir, "index.html")}

RULES:
- Use edit_file to modify existing files (provide exact old_string, unique in file)
- Use write_file to create new files or complete rewrites
- Use read_file to inspect files before editing
- Use bash sparingly, only for shell operations
- After making changes, briefly describe what you did in 1-2 sentences
- Keep changes minimal and focused — do exactly what was asked
- Always write valid HTML/JS/CSS that works in a browser
- The game is a single index.html file unless asked otherwise`);
  }

  return parts.join("\n\n---\n\n");
}

// ============================================================
// UNIVERSAL STREAMING CLIENT (Ollama + OpenAI-compat)
// ============================================================

/**
 * Provider modes:
 *   "ollama"        → POST /api/chat, streams one JSON object per line
 *   "openai-compat" → POST /v1/chat/completions, streams SSE (data: lines)
 */
function detectMode(baseUrl) {
  if (baseUrl.includes("11434") || baseUrl.endsWith("/api")) return "ollama";
  return "openai-compat";
}

function streamChat(messages, model, baseUrl, apiKey, onChunk, mode) {
  return new Promise((resolve, reject) => {
    mode = mode || detectMode(baseUrl);

    const endpoint = mode === "ollama" ? "/api/chat" : "/v1/chat/completions";
    const payload = mode === "ollama"
      ? {
          model,
          messages,
          tools: TOOLS,
          stream: true,
          options: { num_ctx: 131072 },
        }
      : {
          model,
          messages,
          tools: TOOLS,
          tool_choice: "auto",
          stream: true,
        };

    const body = JSON.stringify(payload);
    const url = new URL(baseUrl.replace(/\/$/, "") + (baseUrl.endsWith(endpoint.split("/")[1]) ? "" : endpoint));
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;

    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    };
    if (apiKey && mode === "openai-compat") {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const req = client.request({
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers,
    }, (res) => {
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (c) => errBody += c);
        res.on("end", () => reject(new Error(`${mode} ${res.statusCode}: ${errBody.slice(0, 500)}`)));
        return;
      }

      let buffer = "";
      const finalMessage = { role: "assistant", content: "", tool_calls: [] };
      let sawToolCall = false;

      // For OpenAI-compat, tool calls arrive as deltas we need to assemble
      const toolCallAccumulator = {};

      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const rawLine of lines) {
          let line = rawLine.trim();
          if (!line) continue;

          if (mode === "openai-compat") {
            if (!line.startsWith("data: ")) continue;
            line = line.slice(6);
            if (line === "[DONE]") {
              finalizeToolCalls();
              resolve({ message: finalMessage, sawToolCall });
              return;
            }
          }

          let parsed;
          try { parsed = JSON.parse(line); } catch { continue; }

          if (mode === "ollama") {
            const msg = parsed.message;
            if (msg?.content) {
              finalMessage.content += msg.content;
              onChunk({ type: "text", text: msg.content });
            }
            if (msg?.tool_calls && msg.tool_calls.length > 0) {
              sawToolCall = true;
              for (const tc of msg.tool_calls) {
                finalMessage.tool_calls.push(tc);
                onChunk({ type: "tool", name: tc.function?.name || "unknown" });
              }
            }
            if (parsed.done) {
              if (finalMessage.tool_calls.length === 0) delete finalMessage.tool_calls;
              resolve({ message: finalMessage, sawToolCall });
              return;
            }
          } else {
            // OpenAI-compat streaming
            const choice = parsed.choices?.[0];
            const delta = choice?.delta;
            if (delta?.content) {
              finalMessage.content += delta.content;
              onChunk({ type: "text", text: delta.content });
            }
            if (delta?.tool_calls) {
              sawToolCall = true;
              for (const tc of delta.tool_calls) {
                const idx = tc.index ?? 0;
                if (!toolCallAccumulator[idx]) {
                  toolCallAccumulator[idx] = { id: tc.id, type: "function", function: { name: "", arguments: "" } };
                  if (tc.function?.name) onChunk({ type: "tool", name: tc.function.name });
                }
                if (tc.function?.name) toolCallAccumulator[idx].function.name += tc.function.name;
                if (tc.function?.arguments) toolCallAccumulator[idx].function.arguments += tc.function.arguments;
                if (tc.id) toolCallAccumulator[idx].id = tc.id;
              }
            }
            if (choice?.finish_reason) {
              finalizeToolCalls();
              resolve({ message: finalMessage, sawToolCall });
              return;
            }
          }
        }
      });

      res.on("end", () => {
        finalizeToolCalls();
        resolve({ message: finalMessage, sawToolCall });
      });

      res.on("error", reject);

      function finalizeToolCalls() {
        // Flatten accumulated tool calls (openai-compat only)
        if (!finalMessage.tool_calls) finalMessage.tool_calls = [];
        const keys = Object.keys(toolCallAccumulator).sort();
        for (const k of keys) {
          finalMessage.tool_calls.push(toolCallAccumulator[k]);
        }
        if (finalMessage.tool_calls.length === 0) delete finalMessage.tool_calls;
      }
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ============================================================
// MAIN AGENT LOOP
// ============================================================

async function runSovereignAgent({ prompt, history = [], model, baseUrl, apiKey, mode, gameDir, devRoot, onChunk, onDone, maxTurns = 10 }) {
  const systemPrompt = buildSystemPrompt(gameDir, devRoot);

  // history = [{role:"user"|"assistant", content:"..."}] from prior turns (any harness)
  // Filter out tool messages from history — they bloat context; the game file is the real state
  const cleanHistory = history
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content && m.content.trim().length > 0)
    .map((m) => ({ role: m.role, content: m.content }));

  const messages = [
    { role: "system", content: systemPrompt },
    ...cleanHistory,
    { role: "user", content: prompt },
  ];

  console.log(`  [sovereign-agent] ${mode || "auto"} | model=${model} | system=${systemPrompt.length} chars | history=${cleanHistory.length} msgs`);

  let turn = 0;
  let exitCode = 0;

  try {
    while (turn < maxTurns) {
      turn++;
      console.log(`  [sovereign-agent] Turn ${turn}/${maxTurns}`);

      const { message, sawToolCall } = await streamChat(messages, model, baseUrl, apiKey, onChunk, mode);
      messages.push(message);

      if (!sawToolCall || !message.tool_calls || message.tool_calls.length === 0) {
        console.log(`  [sovereign-agent] Done after ${turn} turn(s) — no more tool calls`);
        break;
      }

      for (const tc of message.tool_calls) {
        const fn = tc.function;
        let args;
        try {
          args = typeof fn.arguments === "string" ? JSON.parse(fn.arguments || "{}") : (fn.arguments || {});
        } catch (e) {
          args = {};
          console.log(`  [sovereign-agent] Bad tool args: ${fn.arguments}`);
        }
        console.log(`  [sovereign-agent] Tool: ${fn.name}(${JSON.stringify(args).slice(0, 100)})`);

        const result = await executeTool(fn.name, args, gameDir);
        onChunk({ type: "tool-result", name: fn.name, result });

        messages.push({
          role: "tool",
          content: JSON.stringify(result),
          tool_call_id: tc.id || fn.name,
        });
      }
    }

    if (turn >= maxTurns) {
      console.log(`  [sovereign-agent] Hit max turns (${maxTurns})`);
      onChunk({ type: "text", text: `\n[Reached max turns: ${maxTurns}]` });
    }
  } catch (err) {
    console.log(`  [sovereign-agent] Error: ${err.message}`);
    onChunk({ type: "error", message: err.message });
    exitCode = 1;
  }

  onDone("", exitCode);
}

// Back-compat alias
const runOllamaAgent = runSovereignAgent;
module.exports = { runSovereignAgent, runOllamaAgent, buildSystemPrompt, detectProjectContext };

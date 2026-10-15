#!/usr/bin/env node
/**
 * Gamerplex Dev Setup
 *
 * Run: node setup.js
 *
 * Interactive wizard that:
 * 1. Asks what kind of game you want to build
 * 2. Asks what tools you want (engine, art, audio, etc.)
 * 3. Generates .mcp.json with all selected MCP servers
 * 4. Creates CLAUDE.md with game-specific instructions
 * 5. Copies the right game template
 * 6. Starts the dev server
 */

const readline = require("readline");
const { writeFileSync, mkdirSync, existsSync, copyFileSync, readdirSync } = require("fs");
const { join } = require("path");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

// ============================================
// MCP SERVER REGISTRY — what's installable TODAY
// ============================================

const MCP_REGISTRY = {
  // TIER 1: Gamerplex core (always included)
  gamerplex: {
    tier: 1,
    name: "Gamerplex MCP",
    description: "Game patterns, juice, deploy, on-chain wagering",
    command: "node",
    args: ["../gamerplex-mcp/dist/index.js"],
    auto: true,
  },

  // TIER 2: Game engines
  godot: {
    tier: 2,
    name: "Godot 4",
    description: "Native 2D/3D game engine — scene management, GDScript, debugger",
    command: "npx",
    args: ["-y", "godot-mcp-server"],
    category: "engine",
    fidelity: [3, 4, 5],
  },
  unity: {
    tier: 2,
    name: "Unity",
    description: "Cross-platform 3D — 268+ tools, scene/asset/material management",
    command: "npx",
    args: ["-y", "unity-mcp-cli"],
    category: "engine",
    fidelity: [4, 5],
  },
  blender: {
    tier: 2,
    name: "Blender",
    description: "3D modeling, sculpting, animation — 161 tools, official MCP",
    command: "uvx",
    args: ["blender-mcp"],
    category: "3d",
    fidelity: [3, 4, 5],
    note: "Requires Python/uvx. Install: pip install uvx",
  },

  // TIER 3: Creative tools
  "elevenlabs": {
    tier: 3,
    name: "ElevenLabs",
    description: "AI sound effects, voice acting, NPC voices",
    command: "npx",
    args: ["-y", "@anthropic-ai/elevenlabs-mcp"],
    category: "audio",
    env: { ELEVENLABS_API_KEY: "" },
    note: "Get API key at elevenlabs.io",
  },
  "suno": {
    tier: 3,
    name: "Suno",
    description: "AI music/soundtrack generation (~$0.03/song)",
    category: "audio",
    manual: true,
    note: "No MCP server yet — use via API in game code",
  },

  // TIER 4: Deployment
  vercel: {
    tier: 4,
    name: "Vercel",
    description: "Deploy frontend to CDN with one command",
    command: "npx",
    args: ["-y", "vercel-mcp"],
    category: "deploy",
  },
};

// ============================================
// GAME TEMPLATES
// ============================================

const TEMPLATES = {
  platformer: { pattern: "platformer", file: "platformer-2d", name: "2D Platformer" },
  "word-game": { pattern: "hidden-info", file: "hidden-info-duel", name: "Word/Guessing Game (Wordle-style)" },
  "aim-trainer": { pattern: "timing-reflex", file: "reflex-duel", name: "Aim Trainer / Reflex Game" },
  "board-game": { pattern: "grid-strategy", file: "grid-strategy", name: "Board/Strategy Game (Chess-style)" },
  survival: { pattern: "survival-endurance", file: "survival-endurance", name: "Survival / Endless Runner" },
  physics: { pattern: "physics-skill", file: "physics-skill", name: "Physics / Skill Shot (Angry Birds-style)" },
  cards: { pattern: "resource-management", file: "resource-management", name: "Card/Resource Game (Poker-style)" },
  custom: { pattern: null, file: null, name: "Blank — I'll describe my game to the AI" },
};

// ============================================
// SETUP WIZARD
// ============================================

async function main() {
  console.log("");
  console.log("  \x1b[35m╔═══════════════════════════════════════════════╗\x1b[0m");
  console.log("  \x1b[35m║\x1b[0m  \x1b[1mGAMERPLEX DEV SETUP\x1b[0m                          \x1b[35m║\x1b[0m");
  console.log("  \x1b[35m║\x1b[0m  Sovereign Game Development                   \x1b[35m║\x1b[0m");
  console.log("  \x1b[35m║\x1b[0m  Your machine. Your wallet. Your game.        \x1b[35m║\x1b[0m");
  console.log("  \x1b[35m╚═══════════════════════════════════════════════╝\x1b[0m");
  console.log("");

  // 1. Game name
  const gameName = (await ask("  Game name: ")).trim() || "my-game";
  const gameDir = join(__dirname, "games", gameName);

  // 2. Game type
  console.log("");
  console.log("  \x1b[33mWhat kind of game?\x1b[0m");
  const templateKeys = Object.keys(TEMPLATES);
  templateKeys.forEach((key, i) => {
    console.log(`  ${i + 1}. ${TEMPLATES[key].name}`);
  });
  const typeIdx = parseInt(await ask("\n  Pick (1-8): ")) - 1;
  const template = TEMPLATES[templateKeys[Math.min(Math.max(typeIdx, 0), templateKeys.length - 1)]];
  console.log(`  → ${template.name}`);

  // 3. Fidelity
  console.log("");
  console.log("  \x1b[33mFidelity level?\x1b[0m");
  console.log("  1. Pixel/CSS (single HTML, no deps — fastest)");
  console.log("  2. 2D Sprite (canvas, sprite sheets — default)");
  console.log("  3. Low Poly 3D (Three.js/Babylon.js)");
  console.log("  4. Stylized 3D (Godot/Unity)");
  console.log("  5. High Fidelity (UE5)");
  const fidelity = parseInt(await ask("\n  Pick (1-5) [2]: ")) || 2;

  // 4. Optional tools
  console.log("");
  console.log("  \x1b[33mOptional tools (y/n for each):\x1b[0m");

  const selected = { gamerplex: true };

  // Auto-suggest engines based on fidelity
  if (fidelity >= 3) {
    const wantBlender = (await ask("  Blender (3D modeling)? [y/N]: ")).toLowerCase() === "y";
    if (wantBlender) selected.blender = true;
  }
  if (fidelity >= 4) {
    const engine = await ask("  Game engine — (g)odot / (u)nity / (n)one? [n]: ");
    if (engine.toLowerCase() === "g") selected.godot = true;
    if (engine.toLowerCase() === "u") selected.unity = true;
  }

  const wantAudio = (await ask("  ElevenLabs (AI sound effects)? [y/N]: ")).toLowerCase() === "y";
  if (wantAudio) selected.elevenlabs = true;

  const wantVercel = (await ask("  Vercel (deploy to web)? [Y/n]: ")).toLowerCase() !== "n";
  if (wantVercel) selected.vercel = true;

  // 5. Generate .mcp.json
  console.log("");
  console.log("  \x1b[32mGenerating config...\x1b[0m");

  const mcpConfig = { mcpServers: {} };
  const notes = [];

  for (const [key, include] of Object.entries(selected)) {
    if (!include) continue;
    const server = MCP_REGISTRY[key];
    if (!server || server.manual) continue;

    mcpConfig.mcpServers[key] = {
      command: server.command,
      args: server.args,
    };
    if (server.env) {
      mcpConfig.mcpServers[key].env = server.env;
      notes.push(`  ! Set ${Object.keys(server.env).join(", ")} in .mcp.json for ${server.name}`);
    }
    if (server.note) {
      notes.push(`  ! ${server.name}: ${server.note}`);
    }
  }

  // 6. Create game directory
  if (!existsSync(gameDir)) mkdirSync(gameDir, { recursive: true });

  // Write .mcp.json in game dir
  writeFileSync(join(gameDir, ".mcp.json"), JSON.stringify(mcpConfig, null, 2));

  // 7. Copy template if available
  const templateDir = join(__dirname, "..", "gamerplex-mcp", "templates", template.file || "");
  if (template.file && existsSync(templateDir)) {
    for (const f of readdirSync(templateDir)) {
      copyFileSync(join(templateDir, f), join(gameDir, f));
    }
    console.log(`  → Template copied: ${template.name}`);
  } else if (template.file) {
    // Template not built yet — create empty index.html
    writeFileSync(join(gameDir, "index.html"), `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${gameName}</title>
<style>* { margin:0; padding:0; } body { background:#111; display:flex; justify-content:center; align-items:center; height:100vh; color:#fff; font-family:monospace; }</style>
</head><body>
<div style="text-align:center">
<h1>${gameName}</h1>
<p style="color:#666">Template: ${template.name}</p>
<p style="color:#9945FF">Open the dev server and tell the AI what to build.</p>
</div>
</body></html>`);
    console.log(`  → Placeholder created (template "${template.file}" not built yet)`);
  } else {
    // Custom — blank canvas
    writeFileSync(join(gameDir, "index.html"), `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>${gameName}</title>
<style>* { margin:0; padding:0; } body { background:#111; display:flex; justify-content:center; align-items:center; height:100vh; overflow:hidden; }</style>
</head><body>
<canvas id="c" width="768" height="720"></canvas>
<script>
const ctx = document.getElementById("c").getContext("2d");
ctx.fillStyle = "#9945FF";
ctx.font = "24px monospace";
ctx.textAlign = "center";
ctx.fillText("${gameName}", 384, 340);
ctx.fillStyle = "#666";
ctx.font = "14px monospace";
ctx.fillText("Describe your game in the chat to start building.", 384, 380);
</script>
</body></html>`);
    console.log("  → Blank canvas created");
  }

  // 8. Generate CLAUDE.md
  const claudeMd = `# ${gameName}

## Game Info
- Pattern: ${template.name}
- Fidelity: Level ${fidelity}
- Built with: Gamerplex MCP (Sovereign Game Development)

## Instructions for AI
- The game is a single HTML file at ./index.html
- Edit the file directly when making changes
- After every change, the dev server at localhost:42069 auto-reloads
- Use Web Audio API for sounds (no external audio files)
- Use canvas for rendering (no DOM game elements)
- Apply game juice: screen shake, particles, sound on every action
- Keep the game in a single file until it exceeds 500 lines

## Gamerplex Integration (when ready)
- Wire wagering: use gamerplex_add_wagering tool
- Add leaderboard: use gamerplex_add_leaderboard tool
- Launch token: use gamerplex_launch_token tool
- Deploy: use gamerplex_deploy_vercel tool
- Publish: use gamerplex_publish tool
`;
  writeFileSync(join(gameDir, "CLAUDE.md"), claudeMd);

  // 9. Summary
  console.log("");
  console.log("  \x1b[32m✓ Setup complete!\x1b[0m");
  console.log("");
  console.log(`  Game:     \x1b[36m${gameName}\x1b[0m`);
  console.log(`  Type:     ${template.name}`);
  console.log(`  Fidelity: Level ${fidelity}`);
  console.log(`  Dir:      ${gameDir}`);
  console.log(`  MCP:      ${Object.keys(mcpConfig.mcpServers).join(", ")}`);

  if (notes.length > 0) {
    console.log("");
    console.log("  \x1b[33mNotes:\x1b[0m");
    notes.forEach((n) => console.log(n));
  }

  console.log("");
  console.log("  \x1b[35mNext steps:\x1b[0m");
  console.log(`  1. cd gamerplex-dev`);
  console.log(`  2. node dev-server.js ./games/${gameName}`);
  console.log(`  3. Open http://localhost:42069`);
  console.log(`  4. Start chatting — build your game!`);
  console.log("");

  rl.close();
}

main().catch(console.error);

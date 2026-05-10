// gamerplex-dev — system-prompt + skill-loader tests.
//
// Goal: 100% coverage of `detectProjectContext` and `buildSystemPrompt` in
// src/ollama-agent.js. These two functions decide what context Claude /
// Ollama see when building a game; if they get it wrong, the agent will write
// a vanilla-HTML game inside a Next.js arcade folder (or vice versa).
//
// No external test runner — `node --test` is built into Node 20+. No npm
// install required (matches the sovereign-dev directive).
//
// Run:  npm test          (uses package.json script)
//   or  node --test test/

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

const {
  buildSystemPrompt,
  detectProjectContext,
} = require("../src/ollama-agent.js");

const DEV_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DEV_ROOT, "..");

// ─── Helpers ────────────────────────────────────────────────────────────

function mkTempDir(label) {
  // mkdtempSync gives us a fresh unique dir inside the OS temp area.
  // Tests own their dir lifecycle — manual cleanup via fs.rmSync.
  return fs.mkdtempSync(path.join(os.tmpdir(), `gpx-test-${label}-`));
}

function cleanup(dir) {
  if (dir && fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function writePkg(dir, deps = {}, devDeps = {}) {
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "test-fixture", dependencies: deps, devDependencies: devDeps }, null, 2)
  );
}

// Create a fake gamerplex monorepo layout under `root` matching the real
// `contention-gg/gamerplex.com-2026/app/arcade/<slug>/` pattern. Returns
// { gameDir, monoRoot } where gameDir is the slug-folder.
function mkArcadeLayout(rootLabel, slug, deps = {}) {
  const root = mkTempDir(rootLabel);
  // Force the path to contain "contention-gg" so isGamerplexMonorepo + the
  // arcade-route regex both match.
  const monoRoot = path.join(root, "contention-gg");
  const appPkgRoot = path.join(monoRoot, "gamerplex.com-2026");
  const gameDir = path.join(appPkgRoot, "app", "arcade", slug);
  fs.mkdirSync(gameDir, { recursive: true });
  writePkg(appPkgRoot, deps);
  return { root, gameDir, monoRoot, appPkgRoot };
}

// ═══════════════════════════════════════════════════════════════════════
// detectProjectContext
// ═══════════════════════════════════════════════════════════════════════

test("detectProjectContext: empty dir with no package.json anywhere — all flags false", () => {
  const dir = mkTempDir("empty");
  try {
    // No package.json anywhere up the chain (we cap at 8 levels). Temp dir is
    // typically /var/folders/.../<id>/ on macOS, /tmp/<id>/ on Linux — neither
    // has a package.json within 8 levels.
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isNextProject, false, "isNextProject");
    assert.strictEqual(ctx.isPhaser, false, "isPhaser");
    assert.strictEqual(ctx.isThreeJs, false, "isThreeJs");
    assert.strictEqual(ctx.isR3F, false, "isR3F");
    assert.strictEqual(ctx.hasAnchor, false, "hasAnchor");
    assert.strictEqual(ctx.isGamerplexMonorepo, false, "isGamerplexMonorepo");
    assert.strictEqual(ctx.isGamerplexArcade, false, "isGamerplexArcade");
    assert.strictEqual(ctx.packageRoot, null, "packageRoot");
  } finally { cleanup(dir); }
});

test("detectProjectContext: package.json with `next` dep → isNextProject=true", () => {
  const dir = mkTempDir("next");
  writePkg(dir, { next: "^16.0.0", react: "^19.0.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isNextProject, true);
    assert.strictEqual(ctx.packageRoot, dir);
  } finally { cleanup(dir); }
});

test("detectProjectContext: package.json with `phaser` dep → isPhaser=true", () => {
  const dir = mkTempDir("phaser");
  writePkg(dir, { phaser: "^3.80.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isPhaser, true);
    assert.strictEqual(ctx.isNextProject, false);
  } finally { cleanup(dir); }
});

test("detectProjectContext: package.json with `three` dep but NOT R3F → isThreeJs=true, isR3F=false", () => {
  const dir = mkTempDir("threejs");
  writePkg(dir, { three: "^0.183.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isThreeJs, true);
    assert.strictEqual(ctx.isR3F, false);
  } finally { cleanup(dir); }
});

test("detectProjectContext: @react-three/fiber dep → isR3F=true AND isThreeJs=true", () => {
  const dir = mkTempDir("r3f");
  writePkg(dir, { "@react-three/fiber": "^8.0.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isR3F, true);
    assert.strictEqual(ctx.isThreeJs, true, "R3F implies Three.js");
  } finally { cleanup(dir); }
});

test("detectProjectContext: @coral-xyz/anchor dep → hasAnchor=true", () => {
  const dir = mkTempDir("anchor");
  writePkg(dir, { "@coral-xyz/anchor": "^0.32.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.hasAnchor, true);
  } finally { cleanup(dir); }
});

test("detectProjectContext: @solana/web3.js dep alone → hasAnchor=true (Solana counts even without Anchor)", () => {
  const dir = mkTempDir("solana");
  writePkg(dir, { "@solana/web3.js": "^1.98.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.hasAnchor, true);
  } finally { cleanup(dir); }
});

test("detectProjectContext: devDependencies are also checked", () => {
  const dir = mkTempDir("devdeps");
  writePkg(dir, {}, { next: "^16.0.0" });
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isNextProject, true, "devDependencies should count");
  } finally { cleanup(dir); }
});

test("detectProjectContext: walks UP looking for package.json (5 levels deep)", () => {
  const root = mkTempDir("walkup");
  writePkg(root, { next: "^16.0.0" });
  // Create a 5-level-deep subdir
  const deep = path.join(root, "a", "b", "c", "d", "e");
  fs.mkdirSync(deep, { recursive: true });
  try {
    const ctx = detectProjectContext(deep);
    assert.strictEqual(ctx.isNextProject, true, "should find package.json 5 levels up");
    assert.strictEqual(ctx.packageRoot, root);
  } finally { cleanup(root); }
});

test("detectProjectContext: malformed package.json → no crash, no detection", () => {
  const dir = mkTempDir("bad-json");
  fs.writeFileSync(path.join(dir, "package.json"), "{ this is not valid json");
  try {
    // Must not throw.
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isNextProject, false);
    assert.strictEqual(ctx.packageRoot, null);
  } finally { cleanup(dir); }
});

test("detectProjectContext: path containing /contention-gg/ → isGamerplexMonorepo=true", () => {
  const { root, monoRoot } = mkArcadeLayout("monorepo", "snake");
  try {
    const ctx = detectProjectContext(monoRoot);
    assert.strictEqual(ctx.isGamerplexMonorepo, true);
  } finally { cleanup(root); }
});

test("detectProjectContext: gamerplex.com-2026/app/arcade/<slug>/ path → isGamerplexArcade=true", () => {
  const { root, gameDir } = mkArcadeLayout("arcade-canonical", "time-gate", { next: "^16", three: "^0.183" });
  try {
    const ctx = detectProjectContext(gameDir);
    assert.strictEqual(ctx.isGamerplexArcade, true);
    assert.strictEqual(ctx.isGamerplexMonorepo, true);
    assert.strictEqual(ctx.isNextProject, true);
    assert.strictEqual(ctx.isThreeJs, true);
  } finally { cleanup(root); }
});

test("detectProjectContext: arcade regex tolerates underscore variant gamerplex.com_2026", () => {
  // We support both `gamerplex.com-2026` and `gamerplex.com_2026` since the
  // dot-underscore variant could surface in URL-safe forks.
  const root = mkTempDir("arcade-underscore");
  const monoRoot = path.join(root, "contention-gg");
  const appPkgRoot = path.join(monoRoot, "gamerplex.com_2026");
  const gameDir = path.join(appPkgRoot, "app", "arcade", "x");
  fs.mkdirSync(gameDir, { recursive: true });
  writePkg(appPkgRoot, { next: "^16" });
  try {
    const ctx = detectProjectContext(gameDir);
    assert.strictEqual(ctx.isGamerplexArcade, true, "underscore variant must match");
  } finally { cleanup(root); }
});

test("detectProjectContext: contention-gg path but NOT inside arcade route → arcade=false, monorepo=true", () => {
  const root = mkTempDir("monorepo-not-arcade");
  const dir = path.join(root, "contention-gg", "gamerplex-resolver", "src");
  fs.mkdirSync(dir, { recursive: true });
  writePkg(path.join(root, "contention-gg"), {});
  try {
    const ctx = detectProjectContext(dir);
    assert.strictEqual(ctx.isGamerplexMonorepo, true);
    assert.strictEqual(ctx.isGamerplexArcade, false);
  } finally { cleanup(root); }
});

test("detectProjectContext: real Gamerplex arcade route — full integration smoke test", () => {
  // Use the actual repo on disk. This guards against the regex / path
  // detection regressing if someone renames the gamerplex.com folder later.
  const realArcade = path.join(REPO_ROOT, "gamerplex.com-2026", "app", "arcade", "cyber-snake");
  if (!fs.existsSync(realArcade)) {
    // Skip in environments where the real repo isn't present (CI etc.)
    return;
  }
  const ctx = detectProjectContext(realArcade);
  assert.strictEqual(ctx.isNextProject, true, "real cyber-snake route must be detected as Next.js");
  assert.strictEqual(ctx.isThreeJs, true, "real repo has `three` in deps");
  assert.strictEqual(ctx.hasAnchor, true, "real repo has @coral-xyz/anchor");
  assert.strictEqual(ctx.isGamerplexMonorepo, true);
  assert.strictEqual(ctx.isGamerplexArcade, true);
  assert.strictEqual(ctx.isR3F, false, "real repo does NOT have @react-three/fiber");
});

// ═══════════════════════════════════════════════════════════════════════
// buildSystemPrompt
// ═══════════════════════════════════════════════════════════════════════

test("buildSystemPrompt: always returns a non-empty string", () => {
  const dir = mkTempDir("prompt-nonempty");
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.ok(typeof prompt === "string");
    assert.ok(prompt.length > 100);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: includes Project Ethos section (from devRoot/CLAUDE.md)", () => {
  const dir = mkTempDir("prompt-ethos");
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.match(prompt, /# Project Ethos/);
    // The real CLAUDE.md mentions sovereignty — quick sanity that we loaded it
    assert.match(prompt, /SOVEREIGN/i);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: includes Skill Manifest section listing what loaded", () => {
  const dir = mkTempDir("prompt-manifest");
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.match(prompt, /# Skill Manifest/);
    assert.match(prompt, /Loaded skill files:/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: loads project CLAUDE.md when present in gameDir", () => {
  const dir = mkTempDir("prompt-projclaude");
  fs.writeFileSync(path.join(dir, "CLAUDE.md"), "## Foo\nBuild a foo widget.");
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.match(prompt, /Game-Specific Instructions/);
    assert.match(prompt, /Build a foo widget/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: skips Game-Specific section when no project CLAUDE.md", () => {
  const dir = mkTempDir("prompt-noprojclaude");
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.doesNotMatch(prompt, /Game-Specific Instructions/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: Next.js project drops the 'single index.html' rule", () => {
  const dir = mkTempDir("prompt-next");
  writePkg(dir, { next: "^16.0.0" });
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.match(prompt, /Next\.js/);
    assert.match(prompt, /Do NOT\s+create a single index\.html/);
    assert.match(prompt, /do NOT npm install/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: standalone (no package.json) keeps the 'single index.html' rule", () => {
  const dir = mkTempDir("prompt-standalone");
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.match(prompt, /single index\.html/);
    // Should NOT include the Next.js operating-instructions block.
    assert.doesNotMatch(prompt, /This is a Next\.js/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: Phaser project loads engines/phaser.md skill, not engines/threejs.md", () => {
  const dir = mkTempDir("prompt-phaser");
  writePkg(dir, { phaser: "^3.80.0" });
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    // Match on the section header buildSystemPrompt creates (`### path.md`),
    // not the bare filename — the project ethos doc happens to namedrop several
    // skill paths in a list, so a bare-filename match is too loose.
    assert.match(prompt, /### engines\/phaser\.md/);
    assert.doesNotMatch(prompt, /### engines\/threejs\.md/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: Three.js project loads engines/threejs.md skill", () => {
  const dir = mkTempDir("prompt-three");
  writePkg(dir, { three: "^0.183.0" });
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    assert.match(prompt, /### engines\/threejs\.md/);
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: Gamerplex arcade route loads web3 + projects/gamerplex-arcade skills", () => {
  const { root, gameDir } = mkArcadeLayout("prompt-arcade", "time-gate", {
    next: "^16",
    three: "^0.183",
    "@coral-xyz/anchor": "^0.32",
  });
  try {
    const prompt = buildSystemPrompt(gameDir, DEV_ROOT);
    assert.match(prompt, /web3\/on-chain-games\.md/);
    assert.match(prompt, /projects\/gamerplex-arcade\.md/);
    assert.match(prompt, /engines\/threejs\.md/);
    // Operating instructions should be Next.js mode.
    assert.match(prompt, /This is a Next\.js/);
    // The arcade skill should appear by content (it documents the program ID).
    assert.match(prompt, /4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t/);
  } finally { cleanup(root); }
});

test("buildSystemPrompt: deduplicates skills (no double-loading when multiple flags imply the same skill)", () => {
  // R3F implies Three.js; both flags would otherwise add engines/threejs twice.
  const dir = mkTempDir("prompt-dedup");
  writePkg(dir, { "@react-three/fiber": "^8", three: "^0.183" });
  try {
    const prompt = buildSystemPrompt(dir, DEV_ROOT);
    const matches = prompt.match(/### engines\/threejs\.md/g) || [];
    assert.strictEqual(matches.length, 1, "engines/threejs.md must appear exactly once");
  } finally { cleanup(dir); }
});

test("buildSystemPrompt: gracefully handles missing skills directory", () => {
  // Pass a fake devRoot with no skills/ subdir. Must not crash.
  const fakeDevRoot = mkTempDir("prompt-nodevroot");
  const dir = mkTempDir("prompt-nodevroot-game");
  try {
    // Drop a CLAUDE.md inside fakeDevRoot so the ethos section still loads.
    fs.writeFileSync(path.join(fakeDevRoot, "CLAUDE.md"), "# Test\n");
    const prompt = buildSystemPrompt(dir, fakeDevRoot);
    assert.ok(prompt.length > 0, "should still build a prompt");
    // Skill Manifest section is gated on `if (skillContent)` — when no skills
    // load (because skillsDir doesn't exist) the manifest is also absent.
    assert.doesNotMatch(prompt, /# Game Dev Skills/);
  } finally {
    cleanup(fakeDevRoot);
    cleanup(dir);
  }
});

test("buildSystemPrompt: gracefully handles missing devRoot/CLAUDE.md", () => {
  const fakeDevRoot = mkTempDir("prompt-noethos");
  const dir = mkTempDir("prompt-noethos-game");
  try {
    const prompt = buildSystemPrompt(dir, fakeDevRoot);
    // No # Project Ethos section because devRoot/CLAUDE.md is missing.
    assert.doesNotMatch(prompt, /# Project Ethos/);
    // But operating instructions must still appear.
    assert.match(prompt, /Your Task/);
  } finally {
    cleanup(fakeDevRoot);
    cleanup(dir);
  }
});

test("buildSystemPrompt: real Gamerplex cyber-snake folder produces all expected sections", () => {
  // End-to-end smoke against the actual repo. Validates the whole pipeline
  // works with the live files Claude will see during the stream.
  const realArcade = path.join(REPO_ROOT, "gamerplex.com-2026", "app", "arcade", "cyber-snake");
  if (!fs.existsSync(realArcade)) return; // CI-skip
  const prompt = buildSystemPrompt(realArcade, DEV_ROOT);
  assert.match(prompt, /# Project Ethos/);
  assert.match(prompt, /# Skill Manifest/);
  assert.match(prompt, /# Your Task/);
  assert.match(prompt, /core\/game-feel\.md/);
  assert.match(prompt, /engines\/threejs\.md/);
  assert.match(prompt, /web3\/on-chain-games\.md/);
  assert.match(prompt, /projects\/gamerplex-arcade\.md/);
  assert.match(prompt, /This is a Next\.js/);
  // Critically: must NOT recommend npm-installing R3F.
  assert.doesNotMatch(prompt, /npm install @react-three\/fiber/);
});

// ═══════════════════════════════════════════════════════════════════════
// Sanity: every skill referenced by buildSystemPrompt exists on disk
// ═══════════════════════════════════════════════════════════════════════

test("skills inventory: all referenced skill files exist on disk", () => {
  const skillsDir = path.join(DEV_ROOT, "skills");
  const expected = [
    "core/game-feel.md",
    "core/canvas-performance.md",
    "core/game-ux.md",
    "engines/threejs.md",
    "engines/phaser.md",
    "web3/on-chain-games.md",
    "projects/gamerplex-arcade.md",
  ];
  for (const rel of expected) {
    const p = path.join(skillsDir, rel);
    assert.ok(fs.existsSync(p), `${rel} missing — buildSystemPrompt would skip it silently`);
    const content = fs.readFileSync(p, "utf-8");
    assert.ok(content.length > 100, `${rel} is suspiciously short`);
  }
});

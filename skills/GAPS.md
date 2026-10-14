# Gamerplex Dev — skills coverage

44 skill files. The agent auto-loads by detected context (see `../CLAUDE.md` → Skills, and
`test/skills-loader.test.js` for the full matrix); the rest are read on demand via
[README.md](README.md).

| Area | Skills |
|---|---|
| **Core** | aim · game-feel · game-ux · canvas-performance · game-design-doc · procgen · game-ai · netcode · testing-qa · accessibility · analytics · platformer-physics · blender-mcp · ai-asset-gen |
| **Engines** | threejs · phaser · godot |
| **Stacks** | web (+ frame, locomotion, viewpoint, environs, npc-ai, play-modes, mobile-gpu) · unreal · unity · godot |
| **Genres** | platformer · puzzle · horror · fighting · racing · rhythm · roguelike · narrative |
| **Audio** | web-audio |
| **Security** | browser-game |
| **Web3** | economy (one currency, Credits rewards, R1–R8) · on-chain-games |
| **Projects** | gamerplex-arcade |

Adding a skill: drop a `.md` in the right folder, then wire its load trigger in
`src/ollama-agent.js` (`buildSystemPrompt()`) so both the Claude Code path and the Ollama path
see the same thing. Add a case to `test/skills-loader.test.js`.

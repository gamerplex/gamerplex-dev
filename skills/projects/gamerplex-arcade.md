# Gamerplex Arcade Stack — What's Already Built

You are working inside the **Gamerplex monorepo** at `/Users/johnny/Code/contention-gg/`. This file describes the on-chain + frontend stack that's ALREADY DEPLOYED on devnet, so you don't reinvent it.

## When this skill applies

- The working directory is inside `gamerplex.com-2026/app/arcade/<game>/`
- OR the user mentions "arcade game", "Cyber Snake", "Time Gate", "AMAZIN", "GPX5 memo", "save score on chain"
- OR the project has `gamerplex.com-2026/lib/arcade/client.ts`

If those signals are absent, fall back to generic Three.js / web3 skills.

---

## On-chain — what's already deployed (devnet, do not redeploy)

| Program | Address | Purpose |
|---|---|---|
| **Gamerplex Arcade v1.2** | `4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t` | Solo arcade games. Score commit + payment + replay receipt. Hardened with transfer-introspection. |
| ArcadeConfig PDA | `7XCKkcJf6uBp1qZV7ChZEjxqsaaZH4aAtmRhx6Tav6hE` | Singleton: admin, treasury, season counter, stats |
| StablecoinConfig PDA | `Hz3iR5vjwoTRigzxg7orj4WBvCndNMDsnbq2Y4V8AE2u` | Allowlist of accepted stablecoin mints (USDC devnet bootstrapped) |
| Cyber Snake Game PDA (id=1) | `3JzoZionKcNrcZLNsvigsUxpE6y7ZRXBx25MmiVRXeBJ` | Registered first arcade game |
| Contention Markets v2.1 | `69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8` | Two-party skill-contest settlement (held for v2.2 upgrade) |
| Magic Chess | `3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr` | On-chain chess engine, fuzz-verified |
| SPL Memo | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | Used by submit_score for GPX5 leaderboard memos |
| USDC devnet (Circle) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Only currently-allowlisted stablecoin |

**You do NOT deploy a new program for a new arcade game.** Same contract handles all games — they're differentiated by `game_id` (u8) and `slug` (string ≤16 chars).

## Game-id assignments (claim only unused ones)

| game_id | slug | status |
|---|---|---|
| 1 | `cyber-snake` | ✅ live |
| 2 | (reserved for next stream-built game) | open |
| 3+ | unallocated | open |

To register a new game (admin-only, ~30s, run once before the game ships):

```bash
# from gamerplex-arcade/, with the deploy keypair loaded
npx tsx scripts/register-game.ts <game_id> <slug> "<Display Name>" <deadline_unix_ts>
```

The `register_game` ix takes a `deadline: i64` — set to `Math.floor(Date.now()/1000) + 3600` (1 hour future). Re-running with a stale deadline fails cleanly.

---

## Frontend — what's already in `gamerplex.com-2026/`

This is a Next 16 app (App Router). React Three Fiber is the 3D path. **Do NOT build a single-HTML-file game inside this app.**

### Already-installed libraries (do NOT `npm install` anything)

```
three                              vanilla Three.js — `import * as THREE from "three"`
three/examples/jsm/controls/...    OrbitControls etc. ship with three; no separate install
@coral-xyz/anchor                  Anchor program client
@solana/web3.js
@solana/wallet-adapter-react
@solana/wallet-adapter-react-ui    WalletMultiButton
@solana/wallet-adapter-phantom
@solana/spl-token                  token transfer ixs
bs58
react ^19, next ^16
```

**IMPORTANT:** `@react-three/fiber` and `@react-three/drei` are NOT installed.
Use vanilla Three.js with manual `useEffect`-driven render loops — this is the
pattern in `gamerplex.com-2026/app/play/cyber-snake/CyberSnake3DScene.tsx`. Do
NOT propose adding R3F (the directive is "do not npm install"; we ship with
what's there).

### Reusable building blocks — import these, don't reinvent

```ts
// Arcade SDK — the canonical client for the arcade program
import {
  makeProgram,                 // Anchor Program instance
  buildOpenProfileIx,          // First-time wallet → opens PlayerProfile PDA
  buildSubmitScoreIx,          // Score commit (T1) — emits GPX5 memo via CPI
  buildRecordPaymentIx,        // Payment record (any tier)
  buildCommitReplayIx,         // T2 verifiable replay commit (GPX5R memo)
  buildMintReceiptIx,          // T3 ReplayReceipt PDA mint
  buildUsdcTransferIxs,        // USDC transfer (returns ixs incl. ATA-create)
  profilePda, gamePda, receiptPda, configPda, stablecoinConfigPda,
  encodeMoveLog,               // Compact direction-change encoding
  sha256,                      // Web Crypto wrapper, returns Uint8Array
  sigToBytes,                  // base58 sig → 64-byte Uint8Array
  getTreasuryWallet,           // reads from on-chain config, cached
  CATEGORY,                    // { CONTINUE: 0, POWERUP: 1, SCORE_COMMIT: 2, ... }
  SCORE_COMMIT_MICRO_USD,      // 50_000  ($0.05)
  VERIFIED_COMMIT_MICRO_USD,   // 150_000 ($0.15)
  REPLAY_RECEIPT_MICRO_USD,    // 250_000 ($0.25)
  CNFT_WRAP_MICRO_USD,         // 500_000 ($0.50)
  ARCADE_PROGRAM_ID,
  ARCADE_NETWORK,              // "mainnet" | "devnet"
  USDC_MINT,                   // network-correct USDC mint
} from "@/../lib/arcade/client";

// Leaderboard + score lookup (resolver-backed, no direct RPC)
import {
  fetchArcadeScore,            // GET /arcade/score/:sig — returns parsed GPX5 with seedB58
  fetchLeaderboard,            // legacy direct-RPC; PREFER the resolver via the component below
  shortAddr, formatDuration,
} from "@/../lib/arcade/leaderboard";

// UI components — drop these in, free
import { ArcadeLeaderboard } from "@/app/arcade/_components/ArcadeLeaderboard";
//   → reads from resolver /arcade/leaderboard/:slug, 30s cache. Pass gameSlug prop.

// ChallengeShareRow lives inline at the bottom of CyberSnakeSolo.tsx — copy or extract
//   → renders "Copy challenge link" + "Share on X" once a save tx exists.
```

### Canonical example — Cyber Snake Solo

When in doubt, **read these three files first** and mirror their structure:

| File | What it shows |
|---|---|
| `gamerplex.com-2026/app/arcade/cyber-snake/page.tsx` | Server component + `generateMetadata({ searchParams })` for OG image + per-challenge title |
| `gamerplex.com-2026/app/arcade/cyber-snake/SnakeClient.tsx` | `"use client"` wrapper that dynamic-imports the scene with `ssr: false` |
| `gamerplex.com-2026/app/arcade/cyber-snake/CyberSnakeSolo.tsx` | Game state, HUD, on-chain wiring, crash overlay, ChallengeShareRow. ~1850 lines but most is reusable. |
| `gamerplex.com-2026/app/play/cyber-snake/CyberSnake3DScene.tsx` | R3F Canvas + lighting + bloom — copy this verbatim for a 3D game |

### File layout convention for a new arcade game

```
gamerplex.com-2026/app/arcade/<slug>/
├── page.tsx                ← server component, generateMetadata, renders <FooClient />
├── FooClient.tsx           ← "use client", dynamic-imports FooScene with ssr:false,
│                             also holds game state, HUD, wallet wiring, on-chain saves
├── FooScene.tsx            ← pure R3F Canvas (or 2D canvas) — receives state via props
└── (optional) CLAUDE.md    ← project-specific overrides for this game's agent context
```

For a 3D arcade game (Time Gate, AMAZIN, etc.), use R3F. For a 2D arcade game (snake-like, puzzle), 2D canvas is fine — see `CyberSnake2DScene.tsx`.

---

## Resolver — the data layer (server-side, Helius-backed)

Live at `https://resolver.gamerplex.com`. Three endpoints relevant to arcade games:

| Endpoint | Returns |
|---|---|
| `GET /arcade/leaderboard/:slug` | Top-N players for that game. 30s cache. ArcadeLeaderboard component already calls this. |
| `GET /arcade/score/:sig` | Parses GPX5 memo from a single tx → `{ player, score, seedB58, gameSlug, ... }`. 60s cache. Used for challenge links to recover the original seed. |
| `GET /cm/stats` | Contention Markets stats (forecaster surface, separate from arcade) |

**You don't need to add a resolver route for a new arcade game.** The leaderboard endpoint takes any `gameSlug` and pattern-matches GPX5 memos by the `|<slug>|` substring. Just use your slug consistently in `submit_score`.

---

## Memo formats (preserved by the validator forever — these are your APIs)

```
GPX5 (T1, score commit, emitted by submit_score via CPI to SPL Memo):
  GPX5|<game_slug>|<variant>|<player>|<score>|<continues>|<powerups>|<seed_b58>|<duration>|<move_hash_b58>[|<meta>]

GPX5R (T2, verifiable replay, emitted by commit_session_replay):
  GPX5R|<player>|<score_nonce>|<seed_b58>|<move_log_b64>
```

If you parse a GPX5 memo, the seed_b58 is the canonical session seed — bs58.decode it to get a 32-byte Uint8Array. That seed feeds your game's deterministic RNG so a "challenge link" replays the EXACT same run for the friend.

---

## Critical rules for arcade games

1. **Score must be a single u64.** Submit via `buildSubmitScoreIx` with a `BN`. The contract takes care of memo emission.
2. **Game must be deterministic from the 32-byte session seed.** Anything random (food spawn, gate position, enemy patterns) derives from the seed via xorshift or similar. See `makeRng` in `CyberSnakeSolo.tsx:80`.
3. **Move log ≤ 400 bytes** for T2 verifiable replay. Compress to direction-change events with tick numbers — see `encodeMoveLog` in `lib/arcade/client.ts`.
4. **Reuse `ChallengeShareRow`** for share buttons. Don't reinvent the copy-link or X-intent wiring — it's ~30 lines at the bottom of CyberSnakeSolo.tsx.
5. **Reuse `ArcadeLeaderboard`** for the on-chain leaderboard. Pass `gameSlug` prop.
6. **OG image** — extend `app/api/og/snake-challenge/route.tsx` to handle `?slug=<your-slug>` instead of forking it. Switch the brand text + headline based on slug.

---

## Anti-patterns (DO NOT do these in arcade games)

| ❌ Don't | ✅ Do |
|---|---|
| Single `index.html` file | App Router route under `app/arcade/<slug>/` |
| EventBus pattern from generic Gamerplex CLAUDE.md | React state + a Three.js render loop in `useEffect` |
| Add `@react-three/fiber` to deps | Use the vanilla Three.js pattern already in `CyberSnake3DScene.tsx` |
| Direct `getProgramAccounts` from browser | `fetchArcadeScore()` / `<ArcadeLeaderboard>` (resolver-backed) |
| Build your own wallet adapter | `useAnchorWallet`, `useConnection`, `useWallet` from `@solana/wallet-adapter-react` |
| Hardcode USDC mint | `USDC_MINT` from `lib/arcade/client.ts` (network-aware) |
| Manually build memo strings | The contract emits memos via CPI on `submit_score`. Just call the ix builder. |
| Add `register_game` flow inside the user-facing page | Admin script (one-time, off-stream prep) |

---

## Train-on-devnet / play-on-mainnet model

The arcade UI defaults to devnet. `NEXT_PUBLIC_SOLANA_NETWORK` flips between `devnet` and `mainnet`. `ARCADE_NETWORK` constant in `lib/arcade/client.ts` reads it. **Mainnet hasn't shipped yet** — devnet is the live surface.

For a new arcade game, default to devnet. Mainnet ships when an Arcade Gate clears — see https://gamerplex.com/docs for the current gate.

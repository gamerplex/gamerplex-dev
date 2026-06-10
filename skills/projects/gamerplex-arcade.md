# Gamerplex Arcade Stack — Everything You Need to Wire a New Game On-Chain

**Contract version this skill documents: v1.4** (deployed devnet 2026-06-10).
v1.4 adds the **$GAME 20% discount** + tightens slippage to 0.5%. v1.3 added
multi-token payments (USDC/USDT/USDF/SOL/$GAME) + affiliate kill-switch.

This file is **self-contained**: with what's below, you can build a working
T1 "save score on-chain" flow without reading any other repo. Two paths
are supported:

- **Path A — Next.js monorepo** (`gamerplex-com/app/play/<slug>/`):
  use the canonical Anchor SDK + React hooks + the v1.4 shared helpers
  ([`lib/arcade/save-score-payment.ts`](../../../gamerplex-com/lib/arcade/save-score-payment.ts) and
  [`components/arcade/PaymentMethodPicker.tsx`](../../../gamerplex-com/components/arcade/PaymentMethodPicker.tsx)).
  This is the **strongly preferred path** — multi-token + $GAME discount + affiliate routing all happen automatically. Skip to "Path A".
- **Path B — Single-HTML standalone game** (anywhere on disk, the default
  for `gamerplex-dev`): build raw Solana txs with `@solana/web3.js` from a
  CDN, no build step. Path B requires manual implementation of the v1.4 contract changes (new `affiliateConfig` account on `record_payment`, $GAME amount math). Skip to "Path B" — but prefer Path A whenever the project allows a build step.

**Future:** `@gamerplex/sdk@0.2.0` (planned, not yet shipped) will collapse
both paths into `import { ArcadeClient } from "@gamerplex/sdk"; await client.saveScore({...})`. When that lands, this file shrinks to ~80 LOC referencing the SDK. Until then, the recipes below ARE the SDK.

This skill **always loads** in every gamerplex-dev session. If the user
isn't building anything on-chain, ignore it; if they say "wire arcade",
"save score", "GPX5", "challenge link", "earn USDC", or "save with $GAME" —
everything you need is right here.

---

## On-chain — what's already deployed (devnet, do not redeploy)

| Program | Address | Purpose |
|---|---|---|
| **Gamerplex Arcade v1.4** | `4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t` | Solo arcade games. Score commit + multi-token payment + affiliate + replay receipt. v1.4 (2026-06-10) added $GAME 20% discount on fixed tiers + tightened 0.5% slippage. v1.3 added multi-token (USDC/USDT/USDF/SOL/$GAME) + affiliate system. |
| ArcadeConfig PDA | `7XCKkcJf6uBp1qZV7ChZEjxqsaaZH4aAtmRhx6Tav6hE` | Singleton: admin, treasury, season counter, stats |
| StablecoinConfig PDA | `Hz3iR5vjwoTRigzxg7orj4WBvCndNMDsnbq2Y4V8AE2u` | Allowlist of accepted stablecoin mints (USDC devnet bootstrapped; USDC+USDT+USDF on mainnet) |
| **ExchangeRatesConfig PDA** (v1.3+) | `aFScAQMkk36X…` | seed=`["rates"]`. Oracle-bot-pushed SOL + $GAME prices in micro-USD-per-smallest-unit ×1e12. Required account on `record_payment` for SOL/$GAME paths. |
| **AffiliateConfig PDA** (v1.3+) | `6K5v7xWfwYT8…` | seed=`["affiliate"]`. Kill-switch + min-accrual threshold ($0.15 default). Required account on every `record_payment`. |
| Cyber Snake Game PDA (id=1) | `3JzoZionKcNrcZLNsvigsUxpE6y7ZRXBx25MmiVRXeBJ` | Registered first arcade game |
| Flipball Game PDA (id=5) | `BUoRdobsvE1L…` | Registered 2026-06-09 |
| Contention Markets v2.1 | `69YfcveAbLbJ5LNERjq6k5wnszfZbXMYVzx2j8Ca1Xo8` | Two-party skill-contest settlement (held for v2.2 upgrade) |
| Magic Chess | `3LVg8uUsHtq6fusjrSfyGUCLQ83TFegDKmY3bCNz3QYr` | On-chain chess engine, fuzz-verified |
| SPL Memo | `MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr` | Used by submit_score for GPX5 leaderboard memos |
| USDC devnet (Circle) | `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` | Allowlisted stablecoin (devnet) |
| **$GAME devnet** (v1.3+) | `8eGnj5jkW6zTGYieGhtejPjLtGmnKfCdk7FamoJ5LLvD` | Flipcash $GAME mint on devnet — paying with this triggers the 20% discount path |
| **$GAME mainnet** | `7TTBUfDomCKBMemv7FF37Tg3y52cRkAxn8vJnvKD4rsE` | Real $GAME mint. Used when contract built with `--features mainnet`. |

**You do NOT deploy a new program for a new arcade game.** Same contract handles all games — differentiated by `game_id` (u8) and `slug` (string ≤16 chars).

## $GAME discount (v1.4) — the utility argument

When `payment_mint == GAME_TOKEN_MINT`, fixed-tier categories pay **80% of list price**:

| Category | List price | $GAME price | Frontend declares (`amount_micro_usd`) |
|---|---|---|---|
| ScoreCommit (T1, save score) | $0.05 | $0.04 | 40_000 if paying with $GAME, else 50_000 |
| VerifiedCommit (T2, save replay) | $0.15 | $0.12 | 120_000 if $GAME, else 150_000 |
| ReplayReceipt (T3, mint receipt) | $0.25 | $0.20 | 200_000 if $GAME, else 250_000 |
| CnftWrap (T4) | $0.50 | $0.40 | 400_000 if $GAME, else 500_000 |

Contract enforces `amount_micro_usd == required_amount(category, payment_mint)`. Frontend MUST send the discounted value when payment_mint = $GAME, or `InvalidScoreCommitAmount` fires. **Path A's `quotePaymentAmount()` handles this automatically.** Path B integrators: do the math manually before calling `record_payment`.

## Game-id assignments (claim only unused ones)

| game_id | slug | status | notes |
|---|---|---|---|
| 1 | `cyber-snake` | ✅ live | Tron-lightcycle, registered 2026-04 |
| 2 | (reserved) | open | Reserved for stream-built games |
| 3 | `magic-chess` (formerly `chess-puzzles`) | ✅ live | Magic Chess (vs Stockfish ELO bots), registered 2026-05-09 |
| 4 | `blockwords` | ✅ live | Wordle-style word guess, registered 2026-05-09 |
| 5 | `flipball` | ✅ live | Three.js+Rapier pinball, registered 2026-06-09. Lives at `flipball.gamerplex.com` (subdomain) + linked from `gamerplex.com/play/flipball` |
| 6+ | unallocated | open | |

**You don't need to register your own game_id to prototype.** During
development on devnet, use slug `pixel-invaders-test` (or any unused
slug) with `game_id = 2` — the contract only requires the slug be
consistent with what was registered for that id. If id=2 is still
"reserved", file a one-line request to claim it before going live; an
admin runs:

```bash
# Admin-only, ~30s. Path B creators do not run this — request via the
# Gamerplex Discord or by opening a PR to gamerplex-arcade.
cd gamerplex-arcade
npx tsx scripts/register-game.ts <game_id> <slug> "<Display Name>" $(($(date +%s)+3600))
```

---

---

## Path B — Single-HTML standalone game (NO build step)

**Use this path when the game lives outside `gamerplex-com/` (any standalone
clone of gamerplex-dev, any path NOT under `app/arcade/<slug>/`).** No
imports, no npm install, no Anchor IDL — everything below works in a single
HTML file loaded via `<script>` from a CDN.

### Pinned CDN imports

```html
<!-- Solana web3 — pinned, browser UMD. ~200KB gzipped. -->
<script src="https://unpkg.com/@solana/web3.js@1.95.8/lib/index.iife.min.js"></script>
<!-- Optional: bs58 for base58 string handling (sigs, addrs) -->
<script src="https://unpkg.com/bs58@5.0.0/index.js"></script>
<script>
  // After the script tags, `solanaWeb3` and `bs58` are globals.
  const { Connection, PublicKey, Transaction, TransactionInstruction,
          SystemProgram, SYSVAR_INSTRUCTIONS_PUBKEY } = solanaWeb3;
</script>
```

### Network + addresses (devnet defaults)

```js
const RPC_URL              = "https://api.devnet.solana.com";   // free, rate-limited
const ARCADE_PROGRAM_ID    = new PublicKey("4FVwdxxBp6PTax2tAcPyHE9rYt8tyNf2YBGrSnSqmx8t");
const SPL_MEMO_ID          = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");
const USDC_DEVNET_MINT     = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
// PDA addresses below are deterministic — derive them; don't hardcode (the
// constants in this table are only for sanity-check inspection).
//   ArcadeConfig PDA      7XCKkcJf6uBp1qZV7ChZEjxqsaaZH4aAtmRhx6Tav6hE
//   StablecoinConfig PDA  Hz3iR5vjwoTRigzxg7orj4WBvCndNMDsnbq2Y4V8AE2u
```

### PDA derivation (vanilla web3.js)

```js
// All seeds are ASCII (TextEncoder produces the same bytes the contract uses).
const te = new TextEncoder();
async function pda(seeds, program = ARCADE_PROGRAM_ID) {
  const [addr] = await PublicKey.findProgramAddressSync(seeds, program);
  return addr;
}

const configPda     = await pda([te.encode("config")]);
const stablesPda    = await pda([te.encode("stablecoins")]);
const gamePda       = (gameId)        => pda([te.encode("game"),    new Uint8Array([gameId])]);
const profilePda    = (playerPubkey)  => pda([te.encode("profile"), playerPubkey.toBuffer()]);
const receiptPda    = (player, nonce) => {
  const nonceLE = new BigUint64Array([BigInt(nonce)]);
  return pda([te.encode("receipt"), player.toBuffer(), new Uint8Array(nonceLE.buffer)]);
};
```

### Anchor ix discriminator (no IDL needed)

Every Anchor instruction starts with an 8-byte discriminator =
**first 8 bytes of SHA-256("global:<snake_case_ix_name>")**. Compute at
load time, no codegen required:

```js
async function ixDisc(name) {
  const h = await crypto.subtle.digest("SHA-256", te.encode("global:" + name));
  return new Uint8Array(h).slice(0, 8);
}
const DISC_OPEN_PROFILE  = await ixDisc("open_player_profile");
const DISC_SUBMIT_SCORE  = await ixDisc("submit_score");
const DISC_RECORD_PAYMENT= await ixDisc("record_payment");
const DISC_COMMIT_REPLAY = await ixDisc("commit_session_replay");
```

### `submit_score` — full reference (T1, $0 payment, just leaderboard commit)

This is the **canonical T1 save**. The contract CPIs to SPL Memo to emit the
GPX5 string, so you do NOT add a separate memo ix yourself.

**Args (Borsh-encoded after the 8-byte discriminator):**

| # | Field | Type | Notes |
|---|---|---|---|
| 1 | `variant` | `String` | ≤16 chars. Free-form (e.g. `"v1"`, `"hard"`). Borsh string = `u32 len LE` + UTF-8 bytes. |
| 2 | `score` | `u64 LE` | Single canonical score. |
| 3 | `continues_used` | `u8` | 0 for a pure run; affects 1CC leaderboard bucket. |
| 4 | `powerups_used` | `u8` | 0 for a pure run. |
| 5 | `session_seed` | `[u8; 32]` | The deterministic seed that drove this run's RNG. Must match the seed_b58 the game played. |
| 6 | `duration_sec` | `u32 LE` | Wall-clock duration of the run, in seconds. |
| 7 | `move_hash` | `[u8; 32]` | `sha256(move_log)` — locks the player's move trace so T2 replays can be verified. Pass `new Uint8Array(32)` if not tracked. |
| 8 | `meta` | `String` | ≤64 chars. Free-form (e.g. `"wave:7"`); folded into GPX5 `meta` field. |
| 9 | `vs_challenger` | `Pubkey (32 bytes)` | Player they were responding to (challenge link). Pass `PublicKey.default` for solo runs. |

**Accounts (in order — order matters):**

| # | Account | Role | How to derive |
|---|---|---|---|
| 0 | config | writable | `pda([b"config"])` |
| 1 | game | writable | `pda([b"game", [game_id]])` |
| 2 | profile | writable | `pda([b"profile", player.toBuffer()])` |
| 3 | wallet | read | The player's wallet pubkey (same as `player` below). Address-constrained: must equal `profile.wallet`. |
| 4 | player | **signer** | The player's wallet pubkey. |
| 5 | memo_program | read | `SPL_MEMO_ID` (constant above). |

**First-time players must call `open_player_profile` first** (it `init`s the
profile PDA). If you try `submit_score` against an uninitialized profile,
the tx fails with `AccountNotInitialized`. The single-tx idiomatic flow is:

```js
const tx = new Transaction();
const profile = await profilePda(player);
const profileInfo = await connection.getAccountInfo(profile);
if (!profileInfo) {
  tx.add(await buildOpenProfileIx({ player, referrer: null }));
}
tx.add(await buildSubmitScoreIx({
  player, gameId: 2, variant: "v1", score: BigInt(finalScore),
  continuesUsed: 0, powerupsUsed: 0, sessionSeed: seed32,
  durationSec: Math.floor(durMs / 1000),
  moveHash: new Uint8Array(32), meta: "",
  vsChallenger: PublicKey.default,
}));
// hand tx to wallet for signing — see "Wallet detection" below
```

### `open_player_profile` — full reference

**Args:** one optional `referrer: Option<Pubkey>` (Borsh: `u8 tag` + 32 bytes if Some).
For solo creation, pass `[0]` (None).

**Accounts:**

| # | Account | Role | How to derive |
|---|---|---|---|
| 0 | config | writable | `pda([b"config"])` |
| 1 | profile | writable, init | `pda([b"profile", player.toBuffer()])` |
| 2 | referrer_profile | read, **optional** | Pass referrer's profile PDA if referrer is Some; otherwise omit. (In a TransactionInstruction, omit by not including in `keys` array — Anchor handles `Option<Account>` by account-count.) |
| 3 | player | signer, writable | Player pubkey (also pays rent for the new PDA). |
| 4 | system_program | read | `SystemProgram.programId` |

### Wallet detection (no @solana/wallet-adapter-react needed)

Phantom + Solflare + Backpack all inject the same de-facto interface on
`window.solana` (Wallet Standard). For a single-HTML game:

```js
async function connectWallet() {
  if (!window.solana?.isPhantom && !window.solana) {
    alert("No Solana wallet detected. Install Phantom: https://phantom.app");
    return null;
  }
  const resp = await window.solana.connect();
  return resp.publicKey; // PublicKey
}

async function signAndSendTx(connection, tx, payer) {
  tx.feePayer = payer;
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  const signed = await window.solana.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig, "confirmed");
  return sig; // base58 string
}
```

### Borsh helpers for ix data (no library needed)

```js
function pad(buf, len) { const r = new Uint8Array(len); r.set(buf); return r; }
function u8(v)  { return new Uint8Array([v & 0xff]); }
function u32LE(v){ const b = new ArrayBuffer(4); new DataView(b).setUint32(0, v, true); return new Uint8Array(b); }
function u64LE(v){ const b = new ArrayBuffer(8); new DataView(b).setBigUint64(0, BigInt(v), true); return new Uint8Array(b); }
function borshString(s) {
  const bytes = te.encode(s);
  return new Uint8Array([...u32LE(bytes.length), ...bytes]);
}
function concat(...arrs) {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0; for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}
```

### Complete `submit_score` ix builder (vanilla, no IDL)

```js
async function buildSubmitScoreIx({
  player, gameId, variant, score, continuesUsed, powerupsUsed,
  sessionSeed, durationSec, moveHash, meta, vsChallenger,
}) {
  const data = concat(
    DISC_SUBMIT_SCORE,
    borshString(variant),
    u64LE(score),
    u8(continuesUsed),
    u8(powerupsUsed),
    pad(sessionSeed, 32),
    u32LE(durationSec),
    pad(moveHash, 32),
    borshString(meta),
    vsChallenger.toBuffer(),
  );
  return new TransactionInstruction({
    programId: ARCADE_PROGRAM_ID,
    keys: [
      { pubkey: await configPda,                    isSigner: false, isWritable: true  },
      { pubkey: await gamePda(gameId),              isSigner: false, isWritable: true  },
      { pubkey: await profilePda(player),           isSigner: false, isWritable: true  },
      { pubkey: player,                             isSigner: false, isWritable: false }, // wallet
      { pubkey: player,                             isSigner: true,  isWritable: false }, // player
      { pubkey: SPL_MEMO_ID,                        isSigner: false, isWritable: false },
    ],
    data,
  });
}
```

The contract emits the GPX5 memo via CPI to SPL Memo. You do **not** add a
memo ix yourself — doing so writes a parallel-but-unanchored memo that
won't be indexed correctly.

### Verifying it indexed

After `signAndSendTx` returns a signature, the resolver picks it up
within ~60s:

```
GET https://resolver.gamerplex.com/arcade/score/<sig>
  → { player, score, gameSlug, seedB58, duration, continues, powerups, meta }
GET https://resolver.gamerplex.com/arcade/leaderboard/<slug>
  → { entries: [{ player, score, ... }, ...] }   (30s cached)
```

---

## v1.4 contract changes Path B integrators MUST know

If you're using the raw-ix Path B above, the v1.3 contract upgrade (2026-06-09)
added **2 new required accounts** to `record_payment`. v1.4 (2026-06-10) added
the $GAME discount math. Integrators must update:

1. **`record_payment` accounts list** now includes (in order at the end):
   - `rates` PDA — `pda([b"rates"])`
   - `affiliate_config` PDA — `pda([b"affiliate"])`

   Old v1.2 integrators sending the old 9-account list will get
   `AccountNotEnoughKeys` or similar.

2. **For $GAME save-scores**, declare the DISCOUNTED amount in
   `amount_micro_usd`:
   - SCORE_COMMIT with $GAME = `40_000` (not 50_000)
   - VERIFIED_COMMIT with $GAME = `120_000` (not 150_000)
   - etc.

   Plus the actual `payment_amount_raw` (token quarks transferred) must
   cover that discounted USD value at current rate ± 0.5% slippage.

3. **Slippage tolerance tightened**: 1% → 0.5%. If your client overpays by
   1% to be safe, that still works (slippage is a FLOOR, not a ceiling).
   But if you computed at the old 1% margin you may now hit `PaymentUnderpaid`.

4. **For SOL or $GAME paths**, exchange rate must be fresh: SOL ≤1hr,
   $GAME ≤24hr. If stale, `ExchangeRateStale` fires. Run
   `npx tsx migrations/v1_3-upgrade.ts` from `gamerplex-arcade/` to refresh.

The free `submit_score` ix (T1 leaderboard commit, no payment) is
**unchanged** — Path B integrators using only `submit_score` need no updates.

---

## Path A — Inside `gamerplex-com/` (Next.js + React)

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
pattern in `gamerplex-com/app/play/cyber-snake/CyberSnake3DScene.tsx`. Do
NOT propose adding R3F (the directive is "do not npm install"; we ship with
what's there).

### Reusable building blocks — import these, don't reinvent

**v1.4: prefer the shared multi-token helpers over hand-built USDC ixs.**
The `buildSaveScorePaymentIxs` helper routes USDC/SOL/$GAME and auto-applies
the 20% discount when payment_mint = $GAME. Just pick the token from the
`PaymentMethodPicker` UI component and pass it through.

```ts
// v1.4 multi-token save flow — the canonical pattern across all 4 same-page games
import { buildSaveScorePaymentIxs } from "@/../lib/arcade/save-score-payment";
import { PAYMENT_TOKENS, type PaymentTokenDef } from "@/../lib/arcade/tokens";
import PaymentMethodPicker from "@/../components/arcade/PaymentMethodPicker";

// 1. Token picker state (default to USDC)
const [paymentToken, setPaymentToken] = useState<PaymentTokenDef>(
  PAYMENT_TOKENS.find(t => t.symbol === "USDC")!
);

// 2. Render the picker (place above the Save button)
<PaymentMethodPicker
  value={paymentToken}
  onChange={setPaymentToken}
  basePriceMicroUsd={new BN(SCORE_COMMIT_MICRO_USD)}
/>

// 3. In onSaveOnChain — call the shared helper
const { ixs } = await buildSaveScorePaymentIxs(program, connection, publicKey, {
  token: paymentToken,
  category: CATEGORY.SCORE_COMMIT,
  basePriceMicroUsd: new BN(SCORE_COMMIT_MICRO_USD),
  gameId: MY_GAME_ID,
  externalRef: "",
  treasury,  // from getTreasuryWallet(program)
});
ixs.forEach(ix => tx.add(ix));
// Then append your submit_score ix and send the tx.
```

**Existing low-level imports** (still available, but use the shared helpers
above when possible):

```ts
import {
  makeProgram,                 // Anchor Program instance
  buildOpenProfileIx,          // First-time wallet → opens PlayerProfile PDA
  buildSubmitScoreIx,          // Score commit (T1) — emits GPX5 memo via CPI
  buildRecordPaymentIx,        // Low-level: requires affiliateConfig account (v1.3+)
  buildCommitReplayIx,         // T2 verifiable replay commit (GPX5R memo)
  buildMintReceiptIx,          // T3 ReplayReceipt PDA mint
  buildUsdcTransferIxs,        // USDC-only transfer (legacy; new code: use buildSaveScorePaymentIxs)
  quotePaymentAmount,          // v1.3+: returns {amountMicroUsdToRecord, paymentAmountRaw} for any mint+discount
  profilePda, gamePda, receiptPda, configPda, stablecoinConfigPda,
  affiliateConfigPda,          // v1.3+: required on every record_payment
  ratesPda,                    // v1.3+: required for SOL/$GAME paths
  encodeMoveLog,
  sha256,
  sigToBytes,
  getTreasuryWallet,
  fetchExchangeRates,          // v1.3+: returns ExchangeRatesSnapshot for quote math
  CATEGORY,                    // { CONTINUE: 0, POWERUP: 1, SCORE_COMMIT: 2, COSMETIC: 3, VERIFIED_COMMIT: 4, REPLAY_RECEIPT: 5, CNFT_WRAP: 6 }
  SCORE_COMMIT_MICRO_USD,      // 50_000  ($0.05)
  VERIFIED_COMMIT_MICRO_USD,   // 150_000 ($0.15)
  REPLAY_RECEIPT_MICRO_USD,    // 250_000 ($0.25)
  CNFT_WRAP_MICRO_USD,         // 500_000 ($0.50)
  GAME_MINT,                   // network-correct $GAME mint
  GAME_DECIMALS,               // 10
  GAME_DISCOUNT_BPS,           // 2_000 (20%)
  SOL_NATIVE,                  // PublicKey.default — signals native SOL path
  ARCADE_PROGRAM_ID,
  ARCADE_NETWORK,              // "mainnet" | "devnet"
  USDC_MINT,                   // network-correct USDC mint
  CYBER_SNAKE_GAME_ID, MAGIC_CHESS_GAME_ID, BLOCKWORDS_ARCADE_GAME_ID, FLIPBALL_GAME_ID,
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

### Canonical examples — read these to mirror the v1.4 pattern

| File | What it shows |
|---|---|
| `gamerplex-com/app/play/blockwords/_arcade/ArcadeMode.tsx` | **v1.4 reference** — picker + shared helper + USDC default + $GAME utility. Mirror this for any new arcade game. |
| `gamerplex-com/app/play/magic-chess/_arcade/ArcadeMode.tsx` | Same pattern, picker in `compact` mode (inline next to existing tier buttons) |
| `gamerplex-com/app/play/cyber-snake/_arcade/ArcadeMode.tsx` | Same pattern, full picker layout |
| `gamerplex-com/lib/arcade/save-score-payment.ts` | The shared helper itself — 135 LOC, source of truth for multi-token save plumbing |
| `gamerplex-com/components/arcade/PaymentMethodPicker.tsx` | The picker React component (`compact` prop for inline use) |
| `gamerplex-games/flipball/src/arcade/integration.ts` | Subdomain-game variant (vendored copy of the same helper) — pattern for future subdomain games like Pet Legends Arena |

### File layout convention for a new arcade game

```
gamerplex-com/app/arcade/<slug>/
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

**Path A only (Next.js inside `gamerplex-com/`):**

| ❌ Don't | ✅ Do |
|---|---|
| Single `index.html` file | App Router route under `app/arcade/<slug>/` |
| EventBus pattern from generic Gamerplex CLAUDE.md | React state + a Three.js render loop in `useEffect` |
| Add `@react-three/fiber` to deps | Use the vanilla Three.js pattern already in `CyberSnake3DScene.tsx` |
| Build your own wallet adapter | `useAnchorWallet`, `useConnection`, `useWallet` from `@solana/wallet-adapter-react` |
| Hardcode USDC mint | `USDC_MINT` from `lib/arcade/client.ts` (network-aware) |

**Both paths:**

| ❌ Don't | ✅ Do |
|---|---|
| Direct `getProgramAccounts` from browser | `fetchArcadeScore()` / `<ArcadeLeaderboard>` / `GET /arcade/leaderboard/<slug>` (resolver-backed) |
| Manually build a memo ix alongside `submit_score` | The contract emits the GPX5 memo via CPI on `submit_score`. A separate memo ix writes an unanchored duplicate that won't index correctly. |
| Write a `submit_score`-shaped memo without calling the program | Always call `submit_score`. Memos alone aren't tied to the game program — no profile update, no on-chain best-score, no anti-spoof. |
| Add `register_game` flow inside the user-facing page | Admin script (one-time, off-stream prep) — see "Game-id assignments" above |
| Hardcode the player's pubkey | Read from `window.solana.publicKey` after `connect()` |

---

## Train-on-devnet / play-on-mainnet model

The arcade UI defaults to devnet. `NEXT_PUBLIC_SOLANA_NETWORK` flips between `devnet` and `mainnet`. `ARCADE_NETWORK` constant in `lib/arcade/client.ts` reads it. **Mainnet hasn't shipped yet** — devnet is the live surface.

For a new arcade game, default to devnet. Mainnet ships when an Arcade Gate clears — see https://gamerplex.com/docs for the current gate.

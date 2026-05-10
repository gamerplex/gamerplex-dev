# On-Chain Games with Gamerplex — Solana, MagicBlock, Contention Markets

## The Stack

```
GAME LOGIC:       MagicBlock Ephemeral Rollup (sub-200ms on-chain state)
GAME STATE:       BOLT ECS (Entity Component System, composable)
WAGERING:         Contention Markets (2% rake, atomic settlement)
TOKEN ECONOMY:    Flipcash (bonding curve, USD-backed, 1% burn on sell)
LEADERBOARD:      SOAR (on-chain rankings, portable across games)
GAME HISTORY:     GPX1 (memo standard, permanent move archive)
IDENTITY:         Solana Name Service (wallet → username.sol)
FREE PLAY:        Ephemeral accounts via PoolSponsor PDA (zero cost to player)
```

## Integration Order (Don't Skip Steps)

```
1. GAME WORKS OFFLINE FIRST
   Build the game with zero web3 features.
   It must be fun without a wallet.

2. ADD WALLET CONNECTION
   @solana/wallet-adapter-react
   Optional — player can play without connecting.

3. ADD SOAR LEADERBOARD
   Submit scores on-chain after match.
   Player sees their ranking.

4. ADD CONTENTION MARKETS
   Wagered matches: deposit → play → settle → payout.
   Start with devnet. Real money = real auditing.

5. ADD FLIPCASH TOKEN
   Per-game token on bonding curve.
   Score = token = money.

6. ADD CHALLENGE LINKS
   gamerplex.com/play/[game]?challenge=ABC
   Viral distribution.
```

## Anchor Program Best Practices

```rust
// Every instruction should:
// 1. Validate all accounts (PDA seeds, ownership, signer checks)
// 2. Check state transitions (game must be in correct state)
// 3. Emit events for indexing
// 4. Be idempotent where possible

// NEVER:
// - Trust client-provided account data without on-chain verification
// - Allow admin keys in production without timelock
// - Skip account close/cleanup (rent accumulates)
// - Use floating point in on-chain math (use fixed-point u64)
```

## MagicBlock Ephemeral Rollup Patterns

```
DELEGATION:     Delegate game account to ER → 50ms updates
UNDELEGATION:   Game ends → commit back to Solana L1 (permanent)
POOL SPONSOR:   Pre-funded PDA pays rent → players play free
SESSION KEYS:   Sign once → play without wallet popups

COST MODEL:
  L1 game creation:     ~0.003 SOL ($0.21)
  ER game creation:     32 lamports ($0.002) via PoolSponsor
  ER move:              0 (delegated account, no rent)
  L1 score commit:      ~0.00075 SOL (SOAR submit)
```

## Contention Markets Integration

```javascript
// Create a wagered match:
const market = await contentionClient.createMarket({
  gameId: "chess",
  player1: wallet.publicKey,
  player2: opponentKey,
  stakeAmount: 1_000_000, // 1 USDC (6 decimals)
  resolverAuthority: resolverKey,
});

// Resolve after game ends:
await contentionClient.resolveMarket({
  market: market.publicKey,
  winner: 1, // player1 wins
});
// 2% rake auto-deducted. 1% protocol, 1% game creator.
```

## Token Anti-Exploitation

```
FLIPCASH BONDING CURVE:
  - Exponential: price increases with supply
  - 1% burn on every sell (deflationary)
  - Always redeemable for USDF (floor price)
  - No rug pull possible: curve is immutable math

GAMING THE SYSTEM:
  - Bot detection: rate limit token purchases per wallet
  - Score validation: on-chain program verifies moves, not client
  - Cooldowns: minimum time between claims in Anchor program
  - Slashing: game creator stake can be slashed for exploits
```

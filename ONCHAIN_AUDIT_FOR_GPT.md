# BubbleDrop / BASEUPP Onchain Architecture Audit for GPT

Generated from the current codebase at:
`C:\Users\Илья\Desktop\baseupp`

Safety memo consulted: `AGENTS.md`
Code changes made: none

---

## Short scan summary

### Exact key files inspected
- `AGENTS.md`
- `frontend/package.json`
- `backend/package.json`
- `bubble/package.json`
- `frontend/app/providers.tsx`
- `frontend/app/wallet-config.ts`
- `frontend/app/base-wallet-runtime.ts`
- `frontend/app/ui/bubbledrop-shell.tsx`
- `frontend/.env.example`
- `backend/.env.example`
- `backend/contracts/DailyCheckInStreak.sol`
- `backend/src/modules/auth-session/auth-session.service.ts`
- `backend/src/modules/check-in/check-in-onchain.service.ts`
- `backend/src/modules/check-in/check-in.service.ts`
- `backend/src/modules/claim/reward-wallet-payout.service.ts`
- `backend/src/modules/claim/claim.service.ts`
- `backend/src/modules/bubble-session/bubble-session.service.ts`
- `backend/src/modules/profile/profile.service.ts`
- `backend/src/modules/partner-token/partner-token.service.ts`

### Base-specific stack found
Yes.

### Contract integration found
Yes.

### Gasless layer found
No.

---

## Final report

### Safety memo consulted
yes

### Code changes made
none

### Key files inspected
- [AGENTS.md](C:\Users\Илья\Desktop\baseupp\AGENTS.md)
- [frontend/package.json](C:\Users\Илья\Desktop\baseupp\frontend\package.json)
- [backend/package.json](C:\Users\Илья\Desktop\baseupp\backend\package.json)
- [bubble/package.json](C:\Users\Илья\Desktop\baseupp\bubble\package.json)
- [frontend/app/providers.tsx](C:\Users\Илья\Desktop\baseupp\frontend\app\providers.tsx)
- [frontend/app/wallet-config.ts](C:\Users\Илья\Desktop\baseupp\frontend\app\wallet-config.ts)
- [frontend/app/base-wallet-runtime.ts](C:\Users\Илья\Desktop\baseupp\frontend\app\base-wallet-runtime.ts)
- [frontend/app/ui/bubbledrop-shell.tsx](C:\Users\Илья\Desktop\baseupp\frontend\app\ui\bubbledrop-shell.tsx)
- [frontend/.env.example](C:\Users\Илья\Desktop\baseupp\frontend\.env.example)
- [backend/.env.example](C:\Users\Илья\Desktop\baseupp\backend\.env.example)
- [backend/contracts/DailyCheckInStreak.sol](C:\Users\Илья\Desktop\baseupp\backend\contracts\DailyCheckInStreak.sol)
- [backend/src/modules/auth-session/auth-session.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\auth-session\auth-session.service.ts)
- [backend/src/modules/check-in/check-in-onchain.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in-onchain.service.ts)
- [backend/src/modules/check-in/check-in.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in.service.ts)
- [backend/src/modules/claim/reward-wallet-payout.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\reward-wallet-payout.service.ts)
- [backend/src/modules/claim/claim.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\claim.service.ts)
- [backend/src/modules/bubble-session/bubble-session.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\bubble-session\bubble-session.service.ts)
- [backend/src/modules/profile/profile.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\profile\profile.service.ts)
- [backend/src/modules/partner-token/partner-token.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\partner-token\partner-token.service.ts)

### Already onchain
Nothing can be confirmed as definitely already live onchain from the checked-in codebase alone.

Why:
- onchain daily check-in writes are disabled by default in [backend/.env.example](C:\Users\Илья\Desktop\baseupp\backend\.env.example) via `ONCHAIN_STREAK_ENABLED=0`
- reward payout depends on optional signer env values in [backend/.env.example](C:\Users\Илья\Desktop\baseupp\backend\.env.example)
- therefore the repo contains real onchain code paths, but not proof that those paths are enabled in the live environment right now

### Partially onchain
#### 1. Wallet connect + Base-only authentication stack
Files/modules:
- [frontend/app/wallet-config.ts](C:\Users\Илья\Desktop\baseupp\frontend\app\wallet-config.ts)
- [frontend/app/base-wallet-runtime.ts](C:\Users\Илья\Desktop\baseupp\frontend\app\base-wallet-runtime.ts)
- [frontend/app/providers.tsx](C:\Users\Илья\Desktop\baseupp\frontend\app\providers.tsx)
- [frontend/app/ui/bubbledrop-shell.tsx](C:\Users\Илья\Desktop\baseupp\frontend\app\ui\bubbledrop-shell.tsx)
- [backend/src/modules/auth-session/auth-session.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\auth-session\auth-session.service.ts)

What exists:
- `wagmi` + `viem`
- Base chain usage
- `@base-org/account`
- wallet connectors for injected Coinbase provider, `baseAccount`, and `coinbaseWallet`
- SIWE signature verification on Base in backend

What does not exist here:
- this is wallet/auth integration, not onchain product-state storage by itself

#### 2. Daily check-in onchain streak write
Files/modules:
- [backend/contracts/DailyCheckInStreak.sol](C:\Users\Илья\Desktop\baseupp\backend\contracts\DailyCheckInStreak.sol)
- [backend/src/modules/check-in/check-in-onchain.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in-onchain.service.ts)
- [backend/src/modules/check-in/check-in.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in.service.ts)

What exists:
- real Solidity contract
- backend writer service using `viem`
- tx hash capture and persistence in check-in flow

Why only partial:
- it is optional and controlled by env
- default checked-in env keeps it disabled
- the canonical streak/check-in flow still exists offchain in the DB layer

#### 3. Claim payout through backend signer
Files/modules:
- [backend/src/modules/claim/reward-wallet-payout.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\reward-wallet-payout.service.ts)
- [backend/src/modules/claim/claim.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\claim.service.ts)

What exists:
- backend ERC20 transfer execution on Base via `erc20Abi`
- signer-based payout using reward wallet private key
- tx hash persistence on successful claim payout

Why only partial:
- claim orchestration, validation, bookkeeping, and balances are still offchain
- payout depends on optional reward wallet env configuration

#### 4. Separate Farcaster/Base miniapp scaffold
Files/modules:
- [bubble/package.json](C:\Users\Илья\Desktop\baseupp\bubble\package.json)

What exists:
- Farcaster miniapp stack
- Base-oriented miniapp connector libraries

Why only partial:
- this is a separate scaffold/runtime, not the main `frontend` application currently used for BubbleDrop

### Fully offchain
#### 1. Gameplay sessions and outcomes
Files/modules:
- [backend/src/modules/bubble-session/bubble-session.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\bubble-session\bubble-session.service.ts)

Status:
- session start/activity/completion remain DB/Redis-driven
- no gameplay outcome write path to chain was found

#### 2. Rewards bookkeeping and inventory ownership
Files/modules:
- [backend/src/modules/profile/profile.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\profile\profile.service.ts)

Status:
- ownership/inventory are resolved from DB repositories
- no live onchain ownership reads were found in the inspected main runtime

#### 3. Partner token catalog / transparency data
Files/modules:
- [backend/src/modules/partner-token/partner-token.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\partner-token\partner-token.service.ts)

Status:
- contract addresses are exposed as metadata
- this is not the same as active onchain reads/writes

#### 4. Core gameplay and UI state
Files/modules:
- [frontend/app/ui/bubbledrop-shell.tsx](C:\Users\Илья\Desktop\baseupp\frontend\app\ui\bubbledrop-shell.tsx)
- `frontend/app/ui/bubble-session-play-screen.tsx`

Status:
- app state, home flow, gameplay flow, and UI transitions remain application-side/offchain

### Wallet / Base stack detected
#### Main app
Detected libraries:
- `wagmi`
- `viem`
- `@base-org/account`

Detected Base-specific stack:
- yes
- Base chain configuration is present
- Base-only wallet flow is present

Detected in use:
- MiniKit: no
- OnchainKit: no
- `wagmi`: yes
- `viem`: yes
- `ethers`: no

Evidence:
- [frontend/package.json](C:\Users\Илья\Desktop\baseupp\frontend\package.json)
- [frontend/app/wallet-config.ts](C:\Users\Илья\Desktop\baseupp\frontend\app\wallet-config.ts)
- [frontend/app/base-wallet-runtime.ts](C:\Users\Илья\Desktop\baseupp\frontend\app\base-wallet-runtime.ts)
- [backend/package.json](C:\Users\Илья\Desktop\baseupp\backend\package.json)

#### Separate `bubble/` app
Detected libraries:
- `@farcaster/miniapp-sdk`
- `@farcaster/miniapp-wagmi-connector`
- `@farcaster/quick-auth`
- `wagmi`
- `viem`

Interpretation:
- this is a separate Base/Farcaster miniapp scaffold, not evidence that the main BubbleDrop runtime already uses MiniKit or OnchainKit

### Contract layer detected
Detected contracts / ABIs / read-write paths:
- [backend/contracts/DailyCheckInStreak.sol](C:\Users\Илья\Desktop\baseupp\backend\contracts\DailyCheckInStreak.sol)
- [backend/src/modules/check-in/check-in-onchain.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in-onchain.service.ts)
- [backend/src/modules/claim/reward-wallet-payout.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\reward-wallet-payout.service.ts)
- [backend/src/modules/claim/claim.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\claim.service.ts)
- [backend/src/modules/partner-token/partner-token.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\partner-token\partner-token.service.ts)

What was found:
- a real Solidity contract for daily streak recording
- ABI-based write path for check-in contract
- ERC20 transfer payout path for claims
- token contract address metadata in backend models/services

What was not found:
- no broad contract-read layer for ownership/inventory in the main app
- no NFT ownership verification layer in the inspected runtime
- no evidence of gameplay session writes to chain

### Gasless / sponsorship layer detected
No paymaster, sponsorship, or relayer layer was found.

Clarification:
- backend-signed writes do exist for optional check-in recording and optional claim payout
- however, that is not the same as a full user-facing gasless sponsorship/paymaster stack

### Check-in status
Classification: partially onchain

Why:
- offchain check-in record creation exists in [backend/src/modules/check-in/check-in.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in.service.ts)
- optional onchain write exists in [backend/src/modules/check-in/check-in-onchain.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\check-in\check-in-onchain.service.ts)
- contract exists in [backend/contracts/DailyCheckInStreak.sol](C:\Users\Илья\Desktop\baseupp\backend\contracts\DailyCheckInStreak.sol)
- env example keeps onchain path disabled by default

### Claim status
Classification: partially onchain

Why:
- claim creation/status/balances are managed offchain in [backend/src/modules/claim/claim.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\claim.service.ts)
- actual payout can be executed onchain via [backend/src/modules/claim/reward-wallet-payout.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\claim\reward-wallet-payout.service.ts)

### Rewards status
Classification: offchain

Why:
- inspected reward and profile flows keep reward state in backend/DB
- no general onchain reward issuance layer was found as the primary source of truth
- optional claim payout onchain does not make the whole rewards system onchain

### Ownership status
Classification: offchain

Why:
- inventory and ownership are resolved from DB in [backend/src/modules/profile/profile.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\profile\profile.service.ts)
- no main-runtime onchain ownership read path was found
- contract addresses appear as metadata, not as the active truth source for ownership

### Session results status
Gameplay outcomes are not currently written onchain.

Current status:
- gameplay/session state is offchain
- session progression and completion are handled in [backend/src/modules/bubble-session/bubble-session.service.ts](C:\Users\Илья\Desktop\baseupp\backend\src\modules\bubble-session\bubble-session.service.ts)
- activity/progress rely on backend state and Redis, not on chain writes

### Recommended migration order
Based only on the current codebase, the safest later migration order is:

1. Daily check-in first
- already has the strongest onchain foundation: contract + deploy path + backend writer + env toggles

2. Claim settlement second
- onchain payout path already exists
- next safest step is to harden payout configuration, observability, and reliability

3. Rewards ownership third
- after payout and check-in are stable, move ownership truth from DB toward real token/NFT/attestation-backed ownership

4. Partner token and asset reads fourth
- once ownership moves onchain, add explicit contract read paths where today the system mostly exposes metadata

5. Session-result anchoring last
- gameplay writes are the highest-frequency and riskiest layer to migrate onchain
- safest to leave until lower-frequency systems are stable

### Remaining uncertainties
- production env values are not visible from the codebase alone, so live enablement of onchain check-in/payout cannot be confirmed
- the `bubble/` app appears to be a separate scaffold; I treated it as non-primary for the main BubbleDrop runtime
- some contract addresses exist in metadata/seed data, but that does not prove real onchain ownership integration
- I did not treat uninspected runtime infrastructure outside source control as evidence

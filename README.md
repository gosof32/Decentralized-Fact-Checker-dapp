# Decentralized Fact-Checker

A GenLayer dApp for checking factual claims against public evidence. The verdict comes from
independent validator consensus, not from one operator or one model call.

**The trust problem:** today, fact-checks come from a single platform or moderator, and users
have to trust them. Here anyone can submit a claim with evidence links, and anyone can trigger
the check. Several validators each fetch the evidence themselves, and the verdict only lands
on-chain when they agree. Every TRUE/FALSE verdict is backed by a verbatim quote that is
verified against the source page, so the result can be audited by anyone.

Use cases include community notes for social posts, newsroom or DAO fact-check queues,
and settling "who's right" claims in prediction markets or bounties.


A claim is never marked true just because someone submitted it. Every verdict comes from
**external evidence fetched at check time** and **independent validator consensus**.

## How it works

1. `submit_claim(claim, evidence_url, second_evidence_url)`
   stores a falsifiable claim with one or two public HTTPS evidence URLs (`""` for no second URL).
   The claim is `PENDING`, with no verdict.
2. `check_claim(claim_id)` runs `gl.vm.run_nondet(leader, validator)`:
   - **Leader**: fetches each evidence page with `gl.nondet.web.render`. It asks the LLM to
     judge the claim *only* from that text and to return `TRUE`, `FALSE` or `UNVERIFIABLE`,
     plus the decisive source and a **verbatim quote**. The quote is then checked
     deterministically against the fetched page. A fabricated, missing or prompt-injection
     quote downgrades the verdict to `UNVERIFIABLE`.
   - **Validator**: independently re-fetches the cited page, re-checks the quote and runs
     its own evaluation. It agrees only when **its verdict equals the leader's verdict**.
     Free-text explanations are not compared, so consensus is reachable. That was not the
     case with `strict_eq` on raw LLM output.
3. The verdict is final: `check_claim` on a checked claim reverts with `CLAIM_ALREADY_CHECKED`.
   Malformed model output reverts with `INVALID_MODEL_RESPONSE`, and no verdict is stored.

Untrusted text (claims and pages) is delimited and sanitised, and the prompt forbids
following instructions found inside it. URLs must be public `https://`.

## Interface

| Function | Type | Description |
|---|---|---|
| `submit_claim(claim, evidence_url, second_evidence_url) -> int` | write | register a claim, returns its id |
| `check_claim(claim_id) -> dict` | write | evidence + consensus verdict (once) |
| `get_claim(claim_id) -> dict` | view | claim, status, verdict, decisive URL, quote, explanation |
| `get_claim_count() -> int` | view | number of claims |

## Frontend (React + Vite)

The `src/` folder holds the dApp. It reads and writes the contract with `genlayer-js`:
- **Connect wallet**: any EIP-1193 wallet (MetaMask, OKX, Rabby, Coinbase…). It switches to or
  adds GenLayer Studionet (chain 61999) using standard `wallet_switchEthereumChain` /
  `wallet_addEthereumChain`. The app never holds a private key.
- **Submit claim**: signs `submit_claim`, then opens the new claim using the id returned in
  the finalized receipt.
- **Check claim**: signs `check_claim` and shows the full lifecycle: waiting for signature,
  submitted (tx hash + explorer link), then finalized or failed with the contract's error.
  A tx hash alone is never treated as success. The app requires `FINALIZED`, an agreeing
  consensus and a successful execution.
- **Look up / recent claims**: shows the verdict badge, the verbatim quote and the source link.
  Contract data is strictly decoded, and malformed data is shown as an error.

```bash
cp .env.example .env        # VITE_CONTRACT_ADDRESS=0x580D1109e5a6710aaf5cAF71e03726793e6Eb057
npm install
npm run dev                 # local
npm run build               # static build in dist/ (Vercel: framework Vite, env VITE_CONTRACT_ADDRESS)
npm test                    # frontend tests (vitest)
```

## Tests

### Contract

```bash
pip install -r requirements-dev.txt
pytest -q          # or: npm run test:contract
```
These tests run in direct mode, with web pages and LLM answers mocked. They cover input
validation, TRUE and FALSE verdicts with verified quotes, a fabricated quote, prompt
injection, unreachable or silent evidence, malformed model output, final-state protection
and validator agreement or disagreement.

## Studionet deployment

`npm install && npm run lifecycle:studionet` deploys `contract.py`, then submits and checks a
true claim, a false claim and a claim the evidence does not cover. It also confirms that a
second check is rejected. Every transaction hash and the final on-chain state are in
[`deployments/studionet.json`](deployments/studionet.json).

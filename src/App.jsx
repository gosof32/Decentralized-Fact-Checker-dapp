import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CONTRACT_ADDRESS, EXPLORER_BASE } from "./config.js";
import { connectWallet as defaultConnect, createReadClient, writeAndFinalize as defaultWrite } from "./lib/wallet.js";
import {
  fetchClaim as defaultFetchClaim,
  fetchRecentClaims as defaultFetchRecent,
  parseClaimId,
  parseReturnedId,
  validateClaimForm,
} from "./lib/factchecker.js";
import "./styles.css";

const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const EMPTY_FORM = { claim: "", evidence: "", secondEvidence: "" };

function TxStatus({ tx }) {
  if (!tx) return null;
  const link = tx.hash ? <a href={`${EXPLORER_BASE}/tx/${tx.hash}`} target="_blank" rel="noreferrer">{short(tx.hash)}</a> : null;
  let text;
  if (tx.phase === "signing") text = "Waiting for your wallet signature…";
  else if (tx.phase === "submitted") text = <>Submitted {link}. Validators are fetching evidence and reaching consensus. This takes a minute or two…</>;
  else if (tx.phase === "finalized") text = <>Finalized with consensus {link}.</>;
  else if (tx.phase === "error") text = <>Failed{link ? <> ({link})</> : null}: {tx.message}</>;
  return (
    <div role="status" data-phase={tx.phase} className={`tx tx-${tx.phase}`}>
      <strong>{tx.label}</strong> · {text}
    </div>
  );
}

function VerdictBadge({ verdict }) {
  if (!verdict) return <span className="badge badge-pending">PENDING</span>;
  return <span data-testid="verdict-badge" className={`badge badge-${verdict.toLowerCase()}`}>{verdict}</span>;
}

function ClaimCard({ claim, busy, onCheck }) {
  return (
    <article data-testid="claim-detail" className="card claim">
      <header>
        <span className="muted">Claim #{claim.id}</span>
        <VerdictBadge verdict={claim.verdict} />
      </header>
      <p className="claim-text">{claim.claim}</p>
      <p className="muted small">
        Submitted by {short(claim.submitter)} · evidence: <a href={claim.evidenceUrl} target="_blank" rel="noreferrer">source 1</a>
        {claim.secondEvidenceUrl && <> · <a href={claim.secondEvidenceUrl} target="_blank" rel="noreferrer">source 2</a></>}
      </p>

      {claim.status === "CHECKED" ? (
        <div data-testid="verdict" className="evidence">
          {claim.quote ? (
            <blockquote>
              “{claim.quote}”
              <cite><a href={claim.decisiveUrl} target="_blank" rel="noreferrer">{claim.decisiveUrl}</a></cite>
            </blockquote>
          ) : <p className="muted small">No verifiable quote. The evidence did not confirm or contradict the claim.</p>}
          <p className="small">{claim.explanation}</p>
          <p className="muted small">Checked by {short(claim.checkedBy)} · final, cannot be re-checked</p>
        </div>
      ) : (
        <div className="evidence">
          <p className="muted small" data-testid="no-verdict">Not checked yet. Anyone can trigger the check; validators fetch the evidence and must agree on the verdict.</p>
          <button className="btn btn-green" disabled={busy} onClick={() => onCheck(claim.id)}>Check claim via GenLayer consensus</button>
        </div>
      )}
    </article>
  );
}

export default function App({
  contractAddress = CONTRACT_ADDRESS,
  connect = defaultConnect,
  writeTx = defaultWrite,
  fetchClaim = defaultFetchClaim,
  fetchRecent = defaultFetchRecent,
  readClient: injectedReadClient,
}) {
  const readClient = useMemo(() => injectedReadClient ?? createReadClient(), [injectedReadClient]);
  const [wallet, setWallet] = useState(null);
  const [walletError, setWalletError] = useState("");
  const [tx, setTx] = useState(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [idInput, setIdInput] = useState("");
  const [selected, setSelected] = useState(null);
  const [readError, setReadError] = useState("");
  const [recent, setRecent] = useState({ count: 0, claims: [] });
  const [recentError, setRecentError] = useState("");

  const loadRecent = useCallback(async () => {
    if (!contractAddress) return;
    try {
      setRecent(await fetchRecent(readClient, contractAddress));
      setRecentError("");
    } catch (e) {
      setRecentError(`Could not load claims: ${e.message}`);
    }
  }, [contractAddress, fetchRecent, readClient]);

  useEffect(() => { loadRecent(); }, [loadRecent]);

  if (!contractAddress) {
    return (
      <main className="page">
        <h1>Decentralized Fact-Checker</h1>
        <p role="alert" className="error">Configuration error: VITE_CONTRACT_ADDRESS is not set.</p>
      </main>
    );
  }

  const loadClaim = async (id) => {
    setReadError("");
    try {
      setSelected(await fetchClaim(readClient, contractAddress, id));
    } catch (e) {
      setSelected(null);
      setReadError(`Could not read claim #${id}: ${e.message}`);
    }
  };

  const handleConnect = async () => {
    setWalletError("");
    try {
      setWallet(await connect());
    } catch (e) {
      setWallet(null);
      setWalletError(e.message);
    }
  };

  const run = async (label, functionName, args) => {
    if (!wallet) {
      setTx({ label, phase: "error", message: "Connect your wallet to sign this transaction." });
      return null;
    }
    setBusy(true);
    let hash;
    try {
      const out = await writeTx({
        walletClient: wallet.client, readClient, address: contractAddress, functionName, args,
        onUpdate: (u) => { if (u.hash) hash = u.hash; setTx({ label, ...u }); },
      });
      return out;
    } catch (e) {
      setTx({ label, phase: "error", hash, message: e.message });
      return null;
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validateClaimForm(form);
    if (problem) {
      setTx({ label: "Submit claim", phase: "error", message: problem });
      return;
    }
    const out = await run("Submit claim", "submit_claim", [form.claim.trim(), form.evidence.trim(), form.secondEvidence.trim()]);
    if (!out) return;
    setForm(EMPTY_FORM);
    const id = parseReturnedId(out.result?.returnValue);
    if (id !== null) await loadClaim(id);
    await loadRecent();
  };

  const handleCheck = async (id) => {
    const out = await run(`Check claim #${id}`, "check_claim", [id]);
    await loadClaim(id);
    if (out) await loadRecent();
  };

  const handleRead = () => {
    try {
      loadClaim(parseClaimId(idInput));
    } catch (e) {
      setSelected(null);
      setReadError(e.message);
    }
  };

  return (
    <main className="page">
      <header className="hero">
        <h1>Decentralized Fact-Checker</h1>
        <p>
          Submit a claim with public evidence. GenLayer validators each fetch the source, judge the claim only from it,
          and must agree on <b>TRUE</b>, <b>FALSE</b> or <b>UNVERIFIABLE</b>. Every verdict carries a verbatim quote checked against the page.
        </p>
        <p className="muted small">
          Contract <a href={`${EXPLORER_BASE}/address/${contractAddress}`} target="_blank" rel="noreferrer">{short(contractAddress)}</a> on GenLayer Studionet
        </p>
      </header>

      <section className="card wallet">
        <div>
          <span className="muted small">Wallet</span><br />
          <strong data-testid="wallet-address">{wallet ? short(wallet.address) : "Not connected"}</strong>
          {walletError && <div role="alert" className="error small">{walletError}</div>}
        </div>
        <button className="btn" onClick={handleConnect}>{wallet ? "Reconnect" : "Connect wallet"}</button>
      </section>

      <TxStatus tx={tx} />

      <form onSubmit={handleSubmit} className="card">
        <h2>1. Submit a claim</h2>
        <label>Claim
          <textarea aria-label="Claim" placeholder="e.g. Bitcoin began to be used as a currency in 2009." value={form.claim} onChange={(e) => setForm({ ...form, claim: e.target.value })} />
        </label>
        <label>Evidence URL
          <input aria-label="Evidence URL" placeholder="https://en.wikipedia.org/api/rest_v1/page/summary/Bitcoin" value={form.evidence} onChange={(e) => setForm({ ...form, evidence: e.target.value })} />
        </label>
        <label>Second evidence URL (optional)
          <input aria-label="Second evidence URL" placeholder="https://…" value={form.secondEvidence} onChange={(e) => setForm({ ...form, secondEvidence: e.target.value })} />
        </label>
        <button type="submit" className="btn" disabled={busy}>Sign & submit claim</button>
      </form>

      <section className="card">
        <h2>2. Look up a claim</h2>
        <div className="row">
          <input aria-label="Claim ID" placeholder="Claim ID (0, 1, 2…)" value={idInput} onChange={(e) => setIdInput(e.target.value)} />
          <button className="btn btn-blue" onClick={handleRead} disabled={busy || idInput === ""}>Read</button>
        </div>
        {readError && <p role="alert" className="error">{readError}</p>}
      </section>

      {selected && <ClaimCard claim={selected} busy={busy} onCheck={handleCheck} />}

      <section className="card">
        <div className="row spread">
          <h2>Recent claims ({recent.count})</h2>
          <button className="btn btn-ghost" onClick={loadRecent} disabled={busy}>Refresh</button>
        </div>
        {recentError && <p role="alert" className="error">{recentError}</p>}
        <ul data-testid="recent" className="recent">
          {recent.claims.map((c) => (
            <li key={c.id}>
              <button className="link" onClick={() => setSelected(c)}>#{c.id} {c.claim}</button>
              <VerdictBadge verdict={c.verdict} />
            </li>
          ))}
          {recent.claims.length === 0 && !recentError && <li className="muted small">No claims yet.</li>}
        </ul>
      </section>
    </main>
  );
}

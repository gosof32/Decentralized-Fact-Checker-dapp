// Strict decoding of contract responses: anything off-schema throws.

export const STATUSES = ["PENDING", "CHECKED"];
export const VERDICTS = ["TRUE", "FALSE", "UNVERIFIABLE"];

export class ContractDataError extends Error {}

function toPlain(value) {
  if (value instanceof Map) {
    const o = {};
    for (const [k, v] of value.entries()) o[String(k)] = toPlain(v);
    return o;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  if (typeof value === "bigint") return Number(value);
  return value;
}

function req(obj, key, type) {
  const v = obj?.[key];
  if (type === "int") {
    if (typeof v !== "number" || !Number.isInteger(v)) throw new ContractDataError(`Malformed contract response: "${key}" is not an integer`);
    return v;
  }
  if (typeof v !== type) throw new ContractDataError(`Malformed contract response: "${key}" is not a ${type}`);
  return v;
}

export function decodeClaim(raw) {
  const c = toPlain(raw);
  if (c === null || typeof c !== "object" || Array.isArray(c)) throw new ContractDataError("Malformed contract response: expected a claim object");
  const status = req(c, "status", "string");
  if (!STATUSES.includes(status)) throw new ContractDataError(`Unknown claim status "${status}"`);
  const verdict = req(c, "verdict", "string");
  if (status === "CHECKED" && !VERDICTS.includes(verdict)) throw new ContractDataError(`Unknown verdict "${verdict}"`);
  if (status === "PENDING" && verdict !== "") throw new ContractDataError("Pending claim must not carry a verdict");
  return {
    id: req(c, "id", "int"),
    submitter: req(c, "submitter", "string"),
    claim: req(c, "claim", "string"),
    evidenceUrl: req(c, "evidence_url", "string"),
    secondEvidenceUrl: req(c, "second_evidence_url", "string"),
    status,
    verdict: verdict || null,
    decisiveUrl: req(c, "decisive_url", "string"),
    quote: req(c, "quote", "string"),
    explanation: req(c, "explanation", "string"),
    checkedBy: req(c, "checked_by", "string"),
  };
}

export function parseClaimId(input) {
  const s = String(input ?? "").trim();
  if (!/^\d+$/.test(s)) throw new Error("Claim ID must be a non-negative whole number");
  return Number(s);
}

export function validateClaimForm({ claim, evidence, secondEvidence }) {
  if (!claim.trim()) return "Claim is required.";
  if (claim.trim().length > 400) return "Claim must be 400 characters or fewer.";
  if (!evidence.trim()) return "Evidence URL is required.";
  for (const u of [evidence, secondEvidence].filter((x) => x.trim())) {
    if (!/^https:\/\/[^\s/@]+\.[^\s/@]+/i.test(u.trim())) return "Evidence URLs must be public https:// links.";
  }
  if (secondEvidence.trim() && secondEvidence.trim() === evidence.trim()) return "The two evidence URLs must differ.";
  return null;
}

// The id returned by submit_claim, read from the finalized receipt.
export function parseReturnedId(returnValue) {
  const n = Number(String(returnValue ?? "").trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export async function fetchClaim(readClient, address, id) {
  return decodeClaim(await readClient.readContract({ address, functionName: "get_claim", args: [id] }));
}

// Newest first, at most `limit` claims. Errors propagate to the UI.
export async function fetchRecentClaims(readClient, address, limit = 8) {
  const count = Number(toPlain(await readClient.readContract({ address, functionName: "get_claim_count", args: [] })));
  if (!Number.isInteger(count) || count < 0) throw new ContractDataError("Malformed claim count");
  const ids = [];
  for (let i = count - 1; i >= 0 && ids.length < limit; i--) ids.push(i);
  const claims = await Promise.all(ids.map((id) => fetchClaim(readClient, address, id)));
  return { count, claims };
}

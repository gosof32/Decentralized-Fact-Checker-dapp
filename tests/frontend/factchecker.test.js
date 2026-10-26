import { describe, it, expect, vi } from "vitest";
import { decodeClaim, parseClaimId, validateClaimForm, parseReturnedId, fetchRecentClaims, ContractDataError } from "../../src/lib/factchecker.js";
import { rawClaim, checkedClaim, BTC } from "./fixtures.js";

describe("decodeClaim", () => {
  it("decodes pending and checked claims (Map and bigint input)", () => {
    expect(decodeClaim(rawClaim()).verdict).toBeNull();
    const m = new Map(Object.entries(checkedClaim({ id: 3n })));
    const c = decodeClaim(m);
    expect(c.id).toBe(3);
    expect(c.verdict).toBe("TRUE");
    expect(c.decisiveUrl).toBe(BTC);
  });
  it("rejects off-schema data", () => {
    expect(() => decodeClaim(null)).toThrow(ContractDataError);
    expect(() => decodeClaim(rawClaim({ status: "VERIFIED" }))).toThrow(/status/);
    expect(() => decodeClaim(checkedClaim({ verdict: "Verified" }))).toThrow(/verdict/);
    expect(() => decodeClaim(rawClaim({ verdict: "TRUE" }))).toThrow(/Pending/);
    expect(() => decodeClaim(rawClaim({ quote: 5 }))).toThrow(/quote/);
  });
});

describe("form helpers", () => {
  it("validates claim and URLs", () => {
    expect(validateClaimForm({ claim: "", evidence: BTC, secondEvidence: "" })).toMatch(/Claim/);
    expect(validateClaimForm({ claim: "x".repeat(401), evidence: BTC, secondEvidence: "" })).toMatch(/400/);
    expect(validateClaimForm({ claim: "c", evidence: "", secondEvidence: "" })).toMatch(/Evidence/);
    expect(validateClaimForm({ claim: "c", evidence: "ftp://a.org", secondEvidence: "" })).toMatch(/https/);
    expect(validateClaimForm({ claim: "c", evidence: BTC, secondEvidence: BTC })).toMatch(/differ/);
    expect(validateClaimForm({ claim: "c", evidence: BTC, secondEvidence: "" })).toBeNull();
  });
  it("parses ids", () => {
    expect(parseClaimId(" 4 ")).toBe(4);
    expect(() => parseClaimId("-1")).toThrow();
    expect(parseReturnedId("7")).toBe(7);
    expect(parseReturnedId("null")).toBeNull();
  });
});

describe("fetchRecentClaims", () => {
  it("reads newest first up to the limit", async () => {
    const readContract = vi.fn(async ({ functionName, args }) =>
      functionName === "get_claim_count" ? 3n : rawClaim({ id: args[0] }));
    const out = await fetchRecentClaims({ readContract }, "0xc", 2);
    expect(out.count).toBe(3);
    expect(out.claims.map((c) => c.id)).toEqual([2, 1]);
  });
});

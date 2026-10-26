export const ALICE = "0x1111111111111111111111111111111111111111";
export const BOB = "0x2222222222222222222222222222222222222222";
export const CONTRACT = "0x580D1109e5a6710aaf5cAF71e03726793e6Eb057";
export const BTC = "https://en.wikipedia.org/api/rest_v1/page/summary/Bitcoin";

export const rawClaim = (over = {}) => ({
  id: 0,
  submitter: ALICE,
  claim: "Bitcoin began to be used as a currency in 2009.",
  evidence_url: BTC,
  second_evidence_url: "",
  status: "PENDING",
  verdict: "",
  decisive_url: "",
  quote: "",
  explanation: "",
  checked_by: "",
  ...over,
});

export const checkedClaim = (over = {}) => rawClaim({
  status: "CHECKED", verdict: "TRUE", decisive_url: BTC,
  quote: "Use of bitcoin as a currency began in 2009", explanation: "Source states 2009.",
  checked_by: BOB, ...over,
});

// Studio-style receipts as returned by genlayer-js waitForTransactionReceipt.
export const receipt = ({ status = "FINALIZED", consensus = "MAJORITY_AGREE", exec = "SUCCESS", result, readable } = {}) => ({
  status_name: status,
  result_name: consensus,
  consensus_data: { leader_receipt: [{ execution_result: exec, result: result ?? JSON.stringify({ status: exec === "SUCCESS" ? "return" : "rollback", payload: { readable: readable ?? (exec === "SUCCESS" ? "null" : "UserError(message='CLAIM_ALREADY_CHECKED')") } }) }] },
});

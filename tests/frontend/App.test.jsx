import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("genlayer-js", () => ({ createClient: vi.fn(() => ({})) }));
vi.mock("genlayer-js/chains", () => ({ studionet: {} }));

const { default: App } = await import("../../src/App.jsx");
const { decodeClaim } = await import("../../src/lib/factchecker.js");
import { CONTRACT, ALICE, BTC, rawClaim, checkedClaim } from "./fixtures.js";

const noRecent = vi.fn(async () => ({ count: 0, claims: [] }));
const setup = (props = {}) => render(<App contractAddress={CONTRACT} readClient={{}} fetchRecent={noRecent} {...props} />);
const connected = { address: ALICE, client: {} };

describe("App", () => {
  it("shows an explicit configuration error without a contract address", () => {
    render(<App contractAddress="" readClient={{}} fetchRecent={noRecent} />);
    expect(screen.getByRole("alert")).toHaveTextContent("VITE_CONTRACT_ADDRESS");
  });

  it("does not sign anything before the wallet is connected", async () => {
    const writeTx = vi.fn();
    setup({ writeTx });
    await userEvent.type(screen.getByLabelText("Claim"), "c");
    await userEvent.type(screen.getByLabelText("Evidence URL"), BTC);
    await userEvent.click(screen.getByText("Sign & submit claim"));
    expect(writeTx).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Connect your wallet");
  });

  it("validates the form before asking the wallet to sign", async () => {
    const writeTx = vi.fn();
    setup({ writeTx, connect: async () => connected });
    await userEvent.click(screen.getByText("Connect wallet"));
    await userEvent.type(screen.getByLabelText("Claim"), "Some claim");
    await userEvent.type(screen.getByLabelText("Evidence URL"), "http://insecure.org/x");
    await userEvent.click(screen.getByText("Sign & submit claim"));
    expect(writeTx).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("https://");
  });

  it("submits a claim through the wallet and opens it once finalized", async () => {
    const writeTx = vi.fn(async ({ onUpdate }) => {
      onUpdate({ phase: "signing" });
      onUpdate({ phase: "submitted", hash: "0xabc" });
      onUpdate({ phase: "finalized", hash: "0xabc" });
      return { hash: "0xabc", result: { returnValue: "0" } };
    });
    const fetchClaim = vi.fn(async () => decodeClaim(rawClaim()));
    setup({ writeTx, fetchClaim, connect: async () => connected });
    await userEvent.click(screen.getByText("Connect wallet"));
    expect(screen.getByTestId("wallet-address")).toHaveTextContent("0x1111");
    await userEvent.type(screen.getByLabelText("Claim"), "Bitcoin began to be used as a currency in 2009.");
    await userEvent.type(screen.getByLabelText("Evidence URL"), BTC);
    await userEvent.click(screen.getByText("Sign & submit claim"));
    await waitFor(() => expect(screen.getByTestId("claim-detail")).toBeInTheDocument());
    expect(writeTx.mock.calls[0][0].functionName).toBe("submit_claim");
    expect(writeTx.mock.calls[0][0].args).toEqual(["Bitcoin began to be used as a currency in 2009.", BTC, ""]);
    expect(fetchClaim).toHaveBeenCalledWith({}, CONTRACT, 0);
    expect(screen.getByRole("status")).toHaveAttribute("data-phase", "finalized");
    expect(screen.getByTestId("no-verdict")).toBeInTheDocument();
  });

  it("checks a pending claim and shows the verdict with its quote", async () => {
    let checked = false;
    const fetchClaim = vi.fn(async () => decodeClaim(checked ? checkedClaim() : rawClaim()));
    const writeTx = vi.fn(async ({ onUpdate }) => { checked = true; onUpdate({ phase: "finalized", hash: "0xdef" }); return { hash: "0xdef", result: {} }; });
    setup({ writeTx, fetchClaim, connect: async () => connected });
    await userEvent.click(screen.getByText("Connect wallet"));
    await userEvent.type(screen.getByLabelText("Claim ID"), "0");
    await userEvent.click(screen.getByText("Read"));
    await userEvent.click(await screen.findByText("Check claim via GenLayer consensus"));
    await waitFor(() => expect(screen.getByTestId("verdict-badge")).toHaveTextContent("TRUE"));
    expect(writeTx.mock.calls[0][0]).toMatchObject({ functionName: "check_claim", args: [0] });
    expect(screen.getByTestId("verdict")).toHaveTextContent("Use of bitcoin as a currency began in 2009");
    expect(screen.queryByText("Check claim via GenLayer consensus")).not.toBeInTheDocument();
  });

  it("surfaces a failed transaction instead of pretending success", async () => {
    const fetchClaim = vi.fn(async () => decodeClaim(rawClaim()));
    const writeTx = vi.fn(async ({ onUpdate }) => { onUpdate({ phase: "submitted", hash: "0x1" }); throw new Error("Contract execution failed (ERROR): CLAIM_ALREADY_CHECKED"); });
    setup({ writeTx, fetchClaim, connect: async () => connected });
    await userEvent.click(screen.getByText("Connect wallet"));
    await userEvent.type(screen.getByLabelText("Claim ID"), "0");
    await userEvent.click(screen.getByText("Read"));
    await userEvent.click(await screen.findByText("Check claim via GenLayer consensus"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveAttribute("data-phase", "error"));
    expect(screen.getByRole("status")).toHaveTextContent("CLAIM_ALREADY_CHECKED");
  });

  it("rejects an invalid claim id and reports read errors", async () => {
    const fetchClaim = vi.fn(async () => { throw new Error("CLAIM_NOT_FOUND"); });
    setup({ fetchClaim });
    await userEvent.type(screen.getByLabelText("Claim ID"), "abc");
    await userEvent.click(screen.getByText("Read"));
    expect(screen.getByRole("alert")).toHaveTextContent("whole number");
    await userEvent.clear(screen.getByLabelText("Claim ID"));
    await userEvent.type(screen.getByLabelText("Claim ID"), "9");
    await userEvent.click(screen.getByText("Read"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("CLAIM_NOT_FOUND"));
  });

  it("lists recent claims with their verdicts", async () => {
    const fetchRecent = vi.fn(async () => ({ count: 2, claims: [decodeClaim(checkedClaim({ id: 1 })), decodeClaim(rawClaim())] }));
    render(<App contractAddress={CONTRACT} readClient={{}} fetchRecent={fetchRecent} />);
    await waitFor(() => expect(screen.getByText("Recent claims (2)")).toBeInTheDocument());
    expect(screen.getByTestId("recent")).toHaveTextContent("TRUE");
    expect(screen.getByTestId("recent")).toHaveTextContent("PENDING");
  });
});

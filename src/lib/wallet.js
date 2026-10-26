import { createClient } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { assertFinalizedSuccess } from "./tx.js";
import { NETWORK } from "../config.js";

// Read-only client: no account, no key.
export function createReadClient() {
  return createClient({ chain: studionet });
}

export function getInjectedProvider() {
  return typeof window !== "undefined" ? window.ethereum ?? null : null;
}

// User-controlled signing: the wallet (e.g. MetaMask) holds the key and
// approves each transaction. The app never sees or stores a private key.
export async function connectWallet(provider = getInjectedProvider()) {
  if (!provider) throw new Error("No browser wallet found. Install MetaMask (or another EIP-1193 wallet) to sign transactions.");
  const accounts = await provider.request({ method: "eth_requestAccounts" });
  if (!Array.isArray(accounts) || accounts.length === 0) throw new Error("Wallet did not authorize any account.");
  const address = accounts[0];
  await ensureStudionet(provider);
  const client = createClient({ chain: studionet, account: address, provider });
  return { address, client };
}

// Adds/switches the wallet to GenLayer Studionet using standard EIP-3085/3326
// calls only. We deliberately do not use genlayer-js `client.connect()`, which
// also calls MetaMask-only `wallet_getSnaps` and breaks on other wallets
// (OKX, Rabby, Coinbase, Brave...).
export async function ensureStudionet(provider) {
  const chainId = `0x${studionet.id.toString(16)}`;
  const current = await provider.request({ method: "eth_chainId" });
  if (typeof current === "string" && current.toLowerCase() === chainId.toLowerCase()) return;
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  } catch (err) {
    const code = err?.code ?? err?.data?.originalError?.code;
    if (code !== 4902 && !/unrecognized|not added|unknown chain/i.test(err?.message ?? "")) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId,
        chainName: studionet.name ?? NETWORK,
        rpcUrls: studionet.rpcUrls?.default?.http ?? [],
        nativeCurrency: studionet.nativeCurrency ?? { name: "GEN", symbol: "GEN", decimals: 18 },
        blockExplorerUrls: studionet.blockExplorers?.default?.url ? [studionet.blockExplorers.default.url] : undefined,
      }],
    });
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId }] });
  }
}

// Sends a write and resolves only once the transaction is FINALIZED with a
// successful execution. Any other end state throws.
export async function writeAndFinalize({ walletClient, readClient, address, functionName, args, onUpdate }) {
  if (!walletClient) throw new Error("Connect your wallet first.");
  onUpdate?.({ phase: "signing" });
  const hash = await walletClient.writeContract({ address, functionName, args, value: 0n });
  onUpdate?.({ phase: "submitted", hash });
  const receipt = await readClient.waitForTransactionReceipt({ hash, status: "FINALIZED", retries: 200, interval: 3000 });
  const result = assertFinalizedSuccess(receipt);
  onUpdate?.({ phase: "finalized", hash, result });
  return { hash, result };
}

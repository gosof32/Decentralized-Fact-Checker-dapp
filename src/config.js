// Contract address comes from the environment (.env / Vercel settings).
// No fallback: without it the app shows an explicit configuration error.
export const CONTRACT_ADDRESS = (import.meta.env?.VITE_CONTRACT_ADDRESS ?? "").trim();
export const NETWORK = "studionet";
export const EXPLORER_BASE = "https://explorer-studio.genlayer.com";

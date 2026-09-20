/**
 * Minimal buyer client for local settle proof.
 * Uses BUYER_PRIVATE_KEY (or PRIVATE_KEY) — buyer EOA only, not a relayer.
 *
 * Live settle requires funded Gateway balance on Arc Testnet
 * (faucet → deposit). See README.
 *
 * Docs: https://developers.circle.com/gateway/nanopayments/quickstarts/buyer
 */
import "dotenv/config";
import { GatewayClient } from "@circle-fin/x402-batching/client";

const privateKey = (process.env.BUYER_PRIVATE_KEY ??
  process.env.PRIVATE_KEY) as `0x${string}` | undefined;

if (!privateKey || !/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
  console.error(
    "Set BUYER_PRIVATE_KEY (or PRIVATE_KEY) to a 0x-prefixed 32-byte EOA key.",
  );
  process.exit(1);
}

const url =
  process.env.PREMIUM_URL ??
  `http://localhost:${process.env.PORT ?? 3000}/premium`;

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey,
});

console.log(`buyer wallet: ${client.address}`);
console.log(`target: ${url}`);

const balances = await client.getBalances();
console.log(`wallet USDC: ${balances.wallet.formatted}`);
console.log(`gateway available: ${balances.gateway.formattedAvailable}`);
console.log(`gateway total: ${balances.gateway.formattedTotal}`);

if (balances.gateway.available === 0n) {
  console.error(
    "\nNo Gateway balance. Fund via https://faucet.circle.com (Arc Testnet + USDC),",
  );
  console.error("then: npm run deposit -- 1");
  process.exit(1);
}

try {
  const support = await client.supports(url);
  if (!support.supported) {
    console.error("URL does not advertise Gateway nanopayments.");
    process.exit(1);
  }

  const result = await client.pay(url);
  console.log("\nsettle success");
  console.log(`status: ${result.status}`);
  console.log(`paid: ${result.formattedAmount} USDC`);
  if (result.transaction) console.log(`transaction: ${result.transaction}`);
  console.log("response:", JSON.stringify(result.data, null, 2));
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error("payment failed:", message);
  process.exit(1);
}

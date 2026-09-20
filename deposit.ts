/**
 * One-time buyer deposit: wallet USDC → Gateway Wallet (Arc Testnet).
 * Needed before gasless x402 nanopayments.
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

const amount = process.argv[2] ?? "1";

const client = new GatewayClient({
  chain: "arcTestnet",
  privateKey,
});

console.log(`buyer: ${client.address}`);
const before = await client.getBalances();
console.log(`wallet USDC: ${before.wallet.formatted}`);
console.log(`gateway available: ${before.gateway.formattedAvailable}`);

console.log(`depositing ${amount} USDC into Gateway...`);
const result = await client.deposit(amount);
console.log("deposit complete");
console.log(`amount: ${result.formattedAmount} USDC`);
console.log(`depositTx: ${result.depositTxHash}`);
if (result.approvalTxHash) console.log(`approvalTx: ${result.approvalTxHash}`);

const after = await client.getBalances();
console.log(`gateway available now: ${after.gateway.formattedAvailable}`);

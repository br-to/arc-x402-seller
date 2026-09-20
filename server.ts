/**
 * Minimal Arc Testnet x402 seller using Circle Gateway Facilitator.
 * No local relayer key / no Circle API key — hosted facilitator settles.
 *
 * Docs: https://developers.circle.com/gateway/nanopayments/quickstarts/seller
 */
import "dotenv/config";
import express from "express";
import { createGatewayMiddleware } from "@circle-fin/x402-batching/server";
import { formatUnits } from "viem";

type PaidRequest = express.Request & {
  payment?: {
    verified: boolean;
    payer: string;
    amount: string;
    network: string;
    transaction?: string;
  };
};

const sellerAddress = process.env.SELLER_WALLET_ADDRESS;
if (!sellerAddress || !/^0x[a-fA-F0-9]{40}$/.test(sellerAddress)) {
  console.error(
    "Set SELLER_WALLET_ADDRESS to a valid EVM address (receive USDC on Arc Testnet).",
  );
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3000);

const app = express();

// Hosted Arc Testnet Gateway — keyless for the seller path
const gateway = createGatewayMiddleware({
  sellerAddress,
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
  networks: ["eip155:5042002"], // Arc Testnet only
});

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    network: "eip155:5042002",
    facilitator: "https://gateway-api-testnet.circle.com",
    seller: sellerAddress,
  });
});

app.get("/premium", gateway.require("$0.01"), (req: PaidRequest, res) => {
  const payment = req.payment!;
  const formattedAmount = formatUnits(BigInt(payment.amount), 6);
  console.log(
    `settled ${formattedAmount} USDC from ${payment.payer} on ${payment.network}` +
      (payment.transaction ? ` tx=${payment.transaction}` : ""),
  );

  res.json({
    secret: "arc-x402-seller spike: treasure under the doormat",
    paid_by: payment.payer,
    amount_usdc: formattedAmount,
    network: payment.network,
    transaction: payment.transaction ?? null,
  });
});

app.listen(port, () => {
  console.log(`arc-x402-seller listening on http://localhost:${port}`);
  console.log(`GET /premium → $0.01 USDC (Arc Testnet Gateway)`);
  console.log(`sellerAddress=${sellerAddress}`);
  console.log(`facilitatorUrl=https://gateway-api-testnet.circle.com`);
});

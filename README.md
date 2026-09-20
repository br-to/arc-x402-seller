# arc-x402-seller

Minimal **Arc Facilitator / x402 seller** spike for Circle Gateway nanopayments on **Arc Testnet** (`eip155:5042002`).

- Seller uses hosted facilitator: `https://gateway-api-testnet.circle.com`
- **No Circle API key** and **no local relayer private key** on the seller
- Unpaid → `402` + `PAYMENT-REQUIRED`; signed payment → Gateway `settle` → `200`

Docs followed:

- [Seller quickstart](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)
- [x402 seller howto](https://developers.circle.com/gateway/nanopayments/howtos/x402-seller)
- Sample: [BlockRunAI/circle-nanopayment-sample](https://github.com/BlockRunAI/circle-nanopayment-sample)

## Env vars

| Var | Required | Role |
|-----|----------|------|
| `SELLER_WALLET_ADDRESS` | yes (server) | Public EVM address that receives USDC |
| `PORT` | no | HTTP port (default `3000`) |
| `BUYER_PRIVATE_KEY` or `PRIVATE_KEY` | buyer only | EOA key to sign EIP-3009 (not a relayer) |
| `PREMIUM_URL` | no | Buyer target (default `http://localhost:$PORT/premium`) |

Copy `.env.example` → `.env` and fill values. Never commit `.env`.

## Install & run seller

```bash
cd /workspace/arc-x402-seller
npm install
export SELLER_WALLET_ADDRESS=0xYourSellerAddress   # or put in .env
npm start
```

Server logs: `GET /premium → $0.01 USDC` on Arc Testnet only.

## Demo: unpaid → 402

```bash
curl -i http://localhost:3000/premium
```

Expect:

- HTTP `402 Payment Required`
- Header `PAYMENT-REQUIRED` (base64 JSON with `accepts[]`, scheme Gateway / `GatewayWalletBatched`, network `eip155:5042002`)

Decode the header:

```bash
curl -s -D - http://localhost:3000/premium -o /dev/null \
  | awk -F': ' 'tolower($1)=="payment-required"{print $2}' \
  | tr -d '\r' | base64 -d | jq .
```

## Demo: paid → settle success

Live settle needs a **buyer EOA with Gateway balance** on Arc Testnet (faucet + deposit). Seller still has no relayer key.

### 1. Fund buyer

1. Create/use an EOA; put key in `.env` as `BUYER_PRIVATE_KEY=0x...`
2. Faucet: [https://faucet.circle.com](https://faucet.circle.com) → **Arc Testnet** + **USDC**
3. Deposit into Gateway (one-time onchain; uses gas USDC on Arc):

```bash
npm run deposit -- 1
```

### 2. Pay protected route

With seller running:

```bash
npm run pay
```

`GatewayClient.pay()`:

1. `GET /premium` → 402 + `PAYMENT-REQUIRED`
2. Signs EIP-3009 against Gateway Wallet (gasless)
3. Retries with `PAYMENT-SIGNATURE`
4. Seller middleware calls Gateway `settle` → `200` JSON

### Manual Payment-Signature (advanced)

If you already have a base64 `PAYMENT-SIGNATURE` payload (from a buyer SDK):

```bash
curl -i http://localhost:3000/premium \
  -H "PAYMENT-SIGNATURE: <base64-payload>"
```

Prefer `npm run pay` — building a valid signature by hand is error-prone.

## Arc Testnet / faucet

| Field | Value |
|-------|-------|
| Chain ID | `5042002` (`eip155:5042002`) |
| RPC | `https://rpc.testnet.arc.network` or `https://rpc.testnet.arc.io` |
| Explorer | https://testnet.arcscan.app |
| USDC faucet | https://faucet.circle.com (select Arc Testnet) |
| Gateway API | https://gateway-api-testnet.circle.com |

USDC is the native gas token on Arc; faucet funds both deposits and gas.

**Note:** Seller earnings appear in Gateway balance after batch settlement (can take minutes). Buyers need Gateway `available` balance before `npm run pay` succeeds.

## Layout

```
/workspace/arc-x402-seller
├── server.ts       # Express + createGatewayMiddleware
├── buyer.ts        # GatewayClient.pay settle demo
├── deposit.ts      # Buyer USDC → Gateway deposit
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## API surface (seller)

```ts
createGatewayMiddleware({
  sellerAddress: process.env.SELLER_WALLET_ADDRESS,
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
  networks: ["eip155:5042002"],
});
app.get("/premium", gateway.require("$0.01"), handler);
```

Alternative (not used here): `BatchFacilitatorClient` + `GatewayEvmScheme` with `@x402/express` — see Circle x402-seller howto.

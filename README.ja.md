# arc-x402-seller

[English](README.md) | 日本語

**Arc Testnet**（`eip155:5042002`）上で、Circle Gateway のナノペイメントを受け取る **x402 seller** の最小実装です。

- seller は Circle 提供の facilitator（`https://gateway-api-testnet.circle.com`）を使います
- seller 側に **Circle API キー** と **relayer の秘密鍵** は必要ありません
- 未払いのリクエストには `402` と `PAYMENT-REQUIRED` を返し、署名付きの支払いは Gateway が決済して `200` を返します

ローカルで「有料 API を公開し、buyer が USDC で呼び出す」一連の流れを試すためのリポジトリです。本番用の販売システムではありません。

参考にしたドキュメント:

- [Seller quickstart](https://developers.circle.com/gateway/nanopayments/quickstarts/seller)
- [x402 seller howto](https://developers.circle.com/gateway/nanopayments/howtos/x402-seller)
- サンプル: [BlockRunAI/circle-nanopayment-sample](https://github.com/BlockRunAI/circle-nanopayment-sample)

## まず試す: 402 を返す seller を起動する

実決済の準備をしなくても、支払い要求のレスポンスまでは確認できます。

```bash
npm install
cp .env.example .env
# .env の SELLER_WALLET_ADDRESS を、USDC の受取先にしたい EVM アドレスへ変更
npm start
```

別のターミナルで次を実行します。

```bash
curl -i http://localhost:3000/premium
```

`HTTP/1.1 402 Payment Required` と `PAYMENT-REQUIRED` ヘッダーが返れば成功です。`/health` では、設定されたネットワークと受取アドレスを確認できます。

## x402 と Gateway の役割

- **x402** は、HTTP の `402 Payment Required` を使ってクライアントに支払いを求めるプロトコルです。
- **Circle Gateway** では、buyer が USDC をあらかじめ Gateway 残高に移します。その後の支払いは署名だけで行えます。
- **facilitator** は、支払い署名を検証して決済（`settle`）する窓口です。このリポジトリでは Circle Gateway の API がこの役割を担います。

## 環境変数

| 変数 | 必須 | 役割 |
|-----|------|------|
| `SELLER_WALLET_ADDRESS` | はい（seller） | USDC の受取先となる公開 EVM アドレス |
| `PORT` | いいえ | HTTP ポート（既定値: `3000`） |
| `BUYER_PRIVATE_KEY` または `PRIVATE_KEY` | buyer のみ | EIP-3009 に署名する EOA の秘密鍵。relayer 用ではありません |
| `PREMIUM_URL` | いいえ | buyer の接続先（既定値: `http://localhost:$PORT/premium`） |

`.env.example` を `.env` にコピーして値を設定します。`.env` はコミットしないでください。

## 未払い時のレスポンスを詳しく見る

```bash
curl -i http://localhost:3000/premium
```

期待される結果:

- HTTP `402 Payment Required`
- `PAYMENT-REQUIRED` ヘッダー（base64 の JSON。`accepts[]` に `scheme: "exact"`、`extra.name: "GatewayWalletBatched"`、network `eip155:5042002`、amount `10000` = 0.01 USDC）

ヘッダーのデコード:

```bash
curl -s -D - http://localhost:3000/premium -o /dev/null \
  | awk -F': ' 'tolower($1)=="payment-required"{print $2}' \
  | tr -d '\r' | base64 -d | jq .
```

## 実際に支払う: buyer の準備と決済

実決済には、Arc Testnet 上で **Gateway 残高を持つ buyer** が必要です。EOA を使う方法と Circle Agent Wallet を使う方法があります。seller に relayer の鍵は必要ありません。

### EOA を使う場合

1. EOA を作成するか既存のものを使い、その秘密鍵を `.env` に `BUYER_PRIVATE_KEY=0x...` として設定します。
2. [Circle Faucet](https://faucet.circle.com) で **Arc Testnet** と **USDC** を選び、EOA に資金を入れます。
3. USDC を Gateway に入金します。この操作はオンチェーンで行われ、Arc では USDC をガスに使います。

```bash
npm run deposit -- 1
```

seller を起動したまま、別のターミナルで実行します。

```bash
npm run pay
```

`GatewayClient.pay()` は次の順で処理します。

1. `GET /premium` → 402 + `PAYMENT-REQUIRED`
2. Gateway Wallet に対して EIP-3009 に署名する（ガス不要）
3. `PAYMENT-SIGNATURE` を付けてリトライ
4. seller のミドルウェアが Gateway の `settle` を呼び、`200` の JSON を返す

### Circle Agent Wallet を使う場合（`.env` に秘密鍵を置かない）

EOA の秘密鍵の代わりに、Circle CLI で操作する [Circle Agent Wallet](https://developers.circle.com/agent-stack/agent-wallets) を buyer にできます。鍵は Circle が 2-of-2 MPC で管理し、エージェントには渡りません。以下は `@circle-fin/cli` 1.1.3（Node.js 20.18.2 以上）で確認した手順です。

```bash
# 1. CLI をインストールしてログイン(メールの OTP。初回ログインでウォレットが作られます)
npm install -g @circle-fin/cli
circle wallet login you@example.com --testnet

# 2. Agent Wallet のアドレスを確認し、資金を入れる(faucet が 20 USDC を送ります)
circle wallet list --type agent --chain ARC-TESTNET
circle wallet fund --address 0xYourAgentWallet --chain ARC-TESTNET

# 3. Gateway に入金する(オンチェーン。Arc のガスは USDC)
circle gateway deposit --amount 5 --address 0xYourAgentWallet --chain ARC-TESTNET --method direct
circle gateway balance --address 0xYourAgentWallet --chain ARC-TESTNET
```

seller を起動してから（`SELLER_WALLET_ADDRESS` には自分で管理するアドレスを設定）、CLI で支払います。

```bash
# 支払わずに、支払い要件だけ表示する
circle services pay http://localhost:3000/premium \
  --address 0xYourAgentWallet --chain ARC-TESTNET --estimate

# 支払う。価格が --max-amount を超える場合は拒否される
circle services pay http://localhost:3000/premium \
  --address 0xYourAgentWallet --chain ARC-TESTNET --max-amount 0.01
```

実際に試してわかったこと:

- どのコマンドでも `--chain ARC-TESTNET` を使います。ドキュメントには `ARC` と `ARC-TESTNET` が混在していますが、`ARC` は Arc mainnet です。
- `services pay` は `localhost` に対して動きます。トンネルは不要です。
- Agent Wallet はスマートコントラクトアカウント(ERC-4337)ですが、settle 後のレスポンスにある `paid_by` は、別の(コードを持たない)EOA のアドレスでした。両者の関係はドキュメントに書かれていません。
- ウォレット層の支出ポリシー(`circle wallet limit`)は **mainnet のみ**です。testnet で使えるのは `--max-amount` だけです。
- レスポンスの `transaction` は Gateway の決済 ID(UUID)で、オンチェーンの tx ハッシュではありません。残高はすぐ減ります(5 → 4.99 USDC)。オンチェーンへの反映は後でバッチ処理されます。
- `wallet execute` で Agent Wallet から任意のコントラクトを呼べます。たとえば Arc Testnet の ERC-8183 リファレンス実装 `AgenticCommerce`(`0x0747EEf0706327138c69792bF28Cd525089e4583`)も呼べます。[Create your first ERC-8183 job](https://docs.arc.io/arc/tutorials/create-your-first-erc-8183-job) を参照してください。

### 手動での Payment-Signature(上級者向け)

buyer SDK などで作った base64 の `PAYMENT-SIGNATURE` がすでにある場合:

```bash
curl -i http://localhost:3000/premium \
  -H "PAYMENT-SIGNATURE: <base64-payload>"
```

手で正しい署名を作るのはミスしやすいので、`npm run pay` をおすすめします。

## Arc Testnet / faucet

| 項目 | 値 |
|-------|-------|
| Chain ID | `5042002`(`eip155:5042002`) |
| RPC | `https://rpc.testnet.arc.network` または `https://rpc.testnet.arc.io` |
| Explorer | https://testnet.arcscan.app |
| USDC faucet | https://faucet.circle.com(Arc Testnet を選択) |
| Gateway API | https://gateway-api-testnet.circle.com |

Arc では USDC がネイティブのガストークンです。faucet の資金で、入金とガスの両方をまかなえます。

**注意:** seller の売上は、バッチ決済の後に Gateway 残高へ反映されます(数分かかることがあります)。`npm run pay` を成功させるには、buyer に Gateway の `available` 残高が必要です。

## ファイル構成

```
arc-x402-seller
├── server.ts       # Express + createGatewayMiddleware
├── buyer.ts        # GatewayClient.pay による settle のデモ
├── deposit.ts      # buyer の USDC を Gateway に入金
├── package.json
├── tsconfig.json
├── .env.example
├── README.md       # 英語版
└── README.ja.md    # 日本語版(このファイル)
```

## seller 側の実装

```ts
createGatewayMiddleware({
  sellerAddress: process.env.SELLER_WALLET_ADDRESS,
  facilitatorUrl: "https://gateway-api-testnet.circle.com",
  networks: ["eip155:5042002"],
});
app.get("/premium", gateway.require("$0.01"), handler);
```

別の方法(ここでは使っていません): `BatchFacilitatorClient` + `GatewayEvmScheme` を `@x402/express` と組み合わせます。Circle の x402-seller howto を参照してください。

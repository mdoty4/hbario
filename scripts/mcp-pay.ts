// scripts/mcp-pay.ts
// Sign + submit an HBAR transfer on testnet, used to pay an MCP order.
// Usage: npx tsx scripts/mcp-pay.ts <recipient> <amountHbar> <memo>
import {
  Client,
  AccountId,
  PrivateKey,
  Hbar,
  HbarUnit,
  TransferTransaction,
} from "@hashgraph/sdk";

async function main() {
  const [recipient, amountStr, ...memoParts] = process.argv.slice(2);
  const memo = memoParts.join(" ");
  if (!recipient || !amountStr) {
    throw new Error("usage: mcp-pay.ts <recipient> <amountHbar> <memo>");
  }
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`bad amount ${amountStr}`);
  }

  const accountId = process.env.PAYER_ACCOUNT_ID;
  const privateKey = process.env.PAYER_PRIVATE_KEY;
  if (!accountId || !privateKey) {
    throw new Error("PAYER_ACCOUNT_ID and PAYER_PRIVATE_KEY must be set");
  }

  const operator = AccountId.fromString(accountId);
  // Try ECDSA first (HashPack default), fall back to ED25519.
  let key;
  try {
    key = PrivateKey.fromStringECDSA(privateKey);
  } catch {
    key = PrivateKey.fromStringED25519(privateKey);
  }
  const network = (process.env.NETWORK ?? "testnet").toLowerCase();
  const client = (network === "mainnet" ? Client.forMainnet() : Client.forTestnet()).setOperator(operator, key);

  const hbar = Hbar.from(amount, HbarUnit.Hbar);
  const tx = await new TransferTransaction()
    .addHbarTransfer(operator, hbar.negated())
    .addHbarTransfer(AccountId.fromString(recipient), hbar)
    .setTransactionMemo(memo)
    .execute(client);

  const receipt = await tx.getReceipt(client);
  const txId = tx.transactionId.toString();
  console.log(JSON.stringify({
    transactionId: txId,
    status: receipt.status.toString(),
    payer: accountId,
    recipient,
    amountHbar: amount,
    memo,
    hashscan: `https://hashscan.io/testnet/transaction/${txId}`,
  }, null, 2));
  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

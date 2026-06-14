// ──────────────────────────────────────────────────────────────────────────────
// Smoke test for the LLM-driven workflow planner + compound compiler.
//
// Runs the four canonical Phase-1 prompts through `runWorkflowAgent` and
// `compileWorkflow`, then prints whether each produced the expected shape.
//
// Usage:
//   AI_PROVIDER=openai AI_API_KEY=sk-... AI_MODEL=gpt-4o-mini \
//     npx tsx scripts/test-compound-planner.ts
//
// Or pass `--prompt "..."` to test a single prompt.
// ──────────────────────────────────────────────────────────────────────────────

import { runWorkflowAgent } from "../src/lib/agents/workflowAgent.v2";
import { compileWorkflow } from "../src/lib/workflow/compiler";

interface Expectation {
  prompt: string;
  /** Expected agent intent. */
  intent: "compound" | "none";
  /** Expected step kinds in order (if intent=compound). */
  steps?: string[];
}

const TESTS: Expectation[] = [
  {
    prompt: "send 1 hbar to 0.0.1234 and 0.0.5678",
    intent: "compound",
    steps: ["bulk_payout"],
  },
  {
    prompt: "Create 50 hedera accounts",
    intent: "compound",
    steps: ["bulk_account_creation"],
  },
  {
    prompt: "send 10 hbar to 0.0.9999 and create a new account",
    intent: "compound",
    steps: ["single_payment", "bulk_account_creation"],
  },
  {
    prompt: "hello",
    intent: "none",
  },
];

function envProvider() {
  const apiKey = process.env.AI_API_KEY ?? "";
  if (!apiKey) return undefined;
  const provider = process.env.AI_PROVIDER ?? "openai";
  const apiBase =
    process.env.AI_API_BASE ??
    (provider === "anthropic"
      ? "https://api.anthropic.com/v1"
      : "https://api.openai.com/v1");
  const model = process.env.AI_MODEL ?? "gpt-4o-mini";
  return { provider, apiBase, apiKey, model };
}

async function runOne(t: Expectation) {
  console.log(`\n── PROMPT: "${t.prompt}"`);
  const result = await runWorkflowAgent(t.prompt, {
    userAccountId: "0.0.1001",
    network: "testnet",
    providerConfig: envProvider(),
  });

  console.log(`  intent: ${result.intent} (source=${result.source})`);
  console.log(`  reply : ${result.assistantMessage.slice(0, 140)}${result.assistantMessage.length > 140 ? "…" : ""}`);

  const intentOk = result.intent === t.intent;
  if (!intentOk) {
    console.log(`  ❌ expected intent=${t.intent}, got ${result.intent}`);
    return false;
  }

  if (t.intent === "none") {
    console.log("  ✅ conversational reply as expected");
    return true;
  }

  // compound expected — compile and check step kinds
  if (!result.draft) {
    console.log("  ❌ no draft on compound result");
    return false;
  }
  const c = compileWorkflow(result.draft);
  if (c.status !== "valid") {
    console.log(`  ❌ compile status=${c.status}: ${c.issues.map((i) => i.message).join("; ")}`);
    return false;
  }
  const wf = c.workflowJson as { workflowType: string; steps: Array<{ kind: string }> };
  const kinds = wf.steps.map((s) => s.kind);
  console.log(`  steps : [${kinds.join(", ")}]`);

  if (t.steps) {
    const expected = t.steps.join(",");
    const actual = kinds.join(",");
    if (expected !== actual) {
      console.log(`  ❌ expected step kinds [${expected}], got [${actual}]`);
      return false;
    }
  }
  console.log("  ✅ compound workflow compiles with expected step kinds");
  return true;
}

(async () => {
  if (!envProvider()) {
    console.error(
      "Set AI_API_KEY (and optionally AI_PROVIDER / AI_API_BASE / AI_MODEL) to run this smoke test.",
    );
    process.exit(1);
  }

  const onlyPromptIdx = process.argv.indexOf("--prompt");
  const tests =
    onlyPromptIdx >= 0
      ? [{ prompt: process.argv[onlyPromptIdx + 1] ?? "", intent: "compound" as const }]
      : TESTS;

  let passed = 0;
  for (const t of tests) {
    if (await runOne(t)) passed++;
  }
  console.log(`\n${passed}/${tests.length} prompt(s) passed.`);
  process.exit(passed === tests.length ? 0 : 1);
})();

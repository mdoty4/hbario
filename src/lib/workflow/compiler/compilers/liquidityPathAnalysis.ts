// ──────────────────────────────────────────────────────────────────────────────
// Liquidity Path Analysis Workflow Compiler
//
// Validates and normalizes liquidity_path_analysis workflow drafts.
// Marks workflows as analysis-only (no fund movement).
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentDraft,
  CompilationResult,
  CompilationIssue,
  LiquidityPathAnalysisWorkflowJson,
  WorkflowCompiler,
} from "../types";
import {
  generateRiskNotes,
  applyToolPlan,
  generateMetadata,
} from "../validators";

/**
 * Compiler for liquidity_path_analysis workflows.
 * Validates token pair, marks workflow as analysis-only.
 */
export class LiquidityPathAnalysisCompiler implements WorkflowCompiler {
  readonly type = "liquidity_path_analysis" as const;

  compile(draft: AgentDraft): CompilationResult {
    const issues: CompilationIssue[] = [];
    const data = draft.data ?? {};

    // ── Extract token pair ────────────────────────────────────────────────

    const fromToken =
      (data.from as string) ??
      (data.source as string) ??
      (data.sourceToken as string) ??
      (data.pairFrom as string);

    const toToken =
      (data.to as string) ??
      (data.destination as string) ??
      (data.targetToken as string) ??
      (data.pairTo as string);

    // Validate token identifiers
    if (!fromToken || typeof fromToken !== "string" || fromToken.trim().length === 0) {
      issues.push({
        severity: "error",
        message: "Source token is required for liquidity path analysis.",
        field: "from",
      });
      return {
        status: "invalid",
        issues,
        riskNotes: [],
      };
    }

    if (!toToken || typeof toToken !== "string" || toToken.trim().length === 0) {
      issues.push({
        severity: "error",
        message: "Destination token is required for liquidity path analysis.",
        field: "to",
      });
      return {
        status: "invalid",
        issues,
        riskNotes: [],
      };
    }

    const normalizedFrom = fromToken.trim().toUpperCase();
    const normalizedTo = toToken.trim().toUpperCase();

    // Warn if source and destination are the same
    if (normalizedFrom === normalizedTo) {
      issues.push({
        severity: "warning",
        message: `Source and destination tokens are the same (${normalizedFrom}). Analysis may not be meaningful.`,
        field: "tokenPair",
      });
    }

    // ── Build risk notes ──────────────────────────────────────────────────

    const riskNotes = generateRiskNotes(
      "liquidity_path_analysis",
      0,
      0,
      false
    );

    // ── Build workflow JSON ───────────────────────────────────────────────

    const toolPlan = applyToolPlan(
      data.toolPlan as import("@/lib/hedera/types").ToolPlan | undefined
    );

    const workflowJson: LiquidityPathAnalysisWorkflowJson = {
      workflowType: "liquidity_path_analysis",
      version: 1,
      analysisOnly: true,
      tokenPair: {
        from: normalizedFrom,
        to: normalizedTo,
      },
      riskNotes,
      toolPlan,
      metadata: generateMetadata(draft.type),
    };

    return {
      status: "valid",
      issues,
      workflowJson,
      riskNotes,
    };
  }
}

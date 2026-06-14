// ──────────────────────────────────────────────────────────────────────────────
// Workflow Compiler Factory
//
// Routes agent drafts to the correct compiler by workflow type.
// Provides the main compile() entry point used by the API layer.
// ──────────────────────────────────────────────────────────────────────────────

import {
  AgentDraft,
  CompilationResult,
  CompilationIssue,
  CompilationStatus,
  SUPPORTED_WORKFLOW_TYPES,
  WorkflowCompiler,
  WorkflowType,
} from "./types";
import { SinglePaymentCompiler } from "./compilers/singlePayment";
import { BulkPayoutCompiler } from "./compilers/bulkPayout";
import { LiquidityPathAnalysisCompiler } from "./compilers/liquidityPathAnalysis";
import { BulkAccountCreationCompiler } from "./compilers/bulkAccountCreation";
import { CompoundCompiler } from "./compilers/compound";

// ── Type Normalization ────────────────────────────────────────────────────────

/**
 * Map of legacy/alternate type names to canonical workflow types.
 * Allows the system to accept variations like "transfer" → "single_payment".
 */
const TYPE_ALIASES: Record<string, WorkflowType> = {
  // Single payment aliases
  "transfer": "single_payment",
  "single_payment": "single_payment",
  "single-payment": "single_payment",
  "hbar_transfer": "single_payment",
  "hbar-transfer": "single_payment",
  "send_hbar": "single_payment",
  "send-hbar": "single_payment",

  // Bulk payout aliases
  "bulk_payout": "bulk_payout",
  "bulk-payout": "bulk_payout",
  "batch-transfer": "bulk_payout",
  "batch_transfer": "bulk_payout",
  "multi_payment": "bulk_payout",
  "multi-payment": "bulk_payout",
  "payout": "bulk_payout",

  // Liquidity path analysis aliases
  "liquidity_path_analysis": "liquidity_path_analysis",
  "liquidity-path-analysis": "liquidity_path_analysis",
  "liquidity-analysis": "liquidity_path_analysis",
  "liquidity_analysis": "liquidity_path_analysis",
  "path_analysis": "liquidity_path_analysis",
  "path-analysis": "liquidity_path_analysis",
  "swap_analysis": "liquidity_path_analysis",
  "swap-analysis": "liquidity_path_analysis",

  // Bulk account creation aliases
  "bulk_account_creation": "bulk_account_creation",
  "bulk-account-creation": "bulk_account_creation",
  "create_accounts": "bulk_account_creation",
  "create-accounts": "bulk_account_creation",
  "account_creation": "bulk_account_creation",
  "account-creation": "bulk_account_creation",
  "bulk_create_accounts": "bulk_account_creation",
  "bulk-create-accounts": "bulk_account_creation",

  // Compound workflow aliases
  "compound": "compound",
  "multi_step": "compound",
  "multi-step": "compound",
  "composite": "compound",
  "plan": "compound",
};

/**
 * Normalize a workflow type string to a canonical type.
 * Returns undefined if the type is not recognized.
 */
function normalizeWorkflowType(rawType: string): WorkflowType | undefined {
  if (!rawType || typeof rawType !== "string") {
    return undefined;
  }

  const normalized = rawType.trim().toLowerCase();

  // Direct match
  if (SUPPORTED_WORKFLOW_TYPES.has(normalized as WorkflowType)) {
    return normalized as WorkflowType;
  }

  // Alias lookup
  return TYPE_ALIASES[normalized];
}

// ── Compiler Registry ─────────────────────────────────────────────────────────

/**
 * Build the registry of compilers.
 * Each workflow type maps to exactly one compiler instance.
 */
function buildCompilerRegistry(): Map<WorkflowType, WorkflowCompiler> {
  const registry = new Map<WorkflowType, WorkflowCompiler>();

  registry.set("single_payment", new SinglePaymentCompiler());
  registry.set("bulk_payout", new BulkPayoutCompiler());
  registry.set("liquidity_path_analysis", new LiquidityPathAnalysisCompiler());
  registry.set("bulk_account_creation", new BulkAccountCreationCompiler());
  registry.set("compound", new CompoundCompiler());

  return registry;
}

const COMPILER_REGISTRY = buildCompilerRegistry();

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if a workflow type is supported (including aliases).
 *
 * @param type - The raw workflow type string.
 * @returns True if the type is recognized and supported.
 */
export function isSupportedType(type: string): boolean {
  return normalizeWorkflowType(type) !== undefined;
}

/**
 * Get the canonical workflow type for a raw type string.
 *
 * @param type - The raw workflow type string.
 * @returns The canonical type, or undefined if not supported.
 */
export function getCanonicalType(type: string): WorkflowType | undefined {
  return normalizeWorkflowType(type);
}

/**
 * Get all supported workflow types.
 *
 * @returns Array of supported workflow type strings.
 */
export function getSupportedTypes(): WorkflowType[] {
  return Array.from(SUPPORTED_WORKFLOW_TYPES);
}

/**
 * Compile an agent draft into a validated, normalized workflow.
 *
 * This is the main entry point for the workflow compiler system.
 * It:
 * 1. Normalizes the workflow type (handles aliases)
 * 2. Routes to the correct compiler
 * 3. Returns a compilation result with status, issues, and workflow JSON
 *
 * @param draft - The raw agent draft to compile.
 * @returns A compilation result.
 */
export function compileWorkflow(draft: AgentDraft): CompilationResult {
  // ── Validate draft ────────────────────────────────────────────────────

  if (!draft || typeof draft !== "object") {
    return {
      status: "invalid",
      issues: [
        {
          severity: "error",
          message: "Draft must be a valid object.",
        },
      ],
      riskNotes: [],
    };
  }

  if (!draft.title || typeof draft.title !== "string" || draft.title.trim().length === 0) {
    return {
      status: "invalid",
      issues: [
        {
          severity: "error",
          message: "Draft must include a non-empty title.",
          field: "title",
        },
      ],
      riskNotes: [],
    };
  }

  if (!draft.type || typeof draft.type !== "string" || draft.type.trim().length === 0) {
    return {
      status: "invalid",
      issues: [
        {
          severity: "error",
          message: "Draft must include a workflow type.",
          field: "type",
        },
      ],
      riskNotes: [],
    };
  }

  // ── Normalize type ────────────────────────────────────────────────────

  const canonicalType = normalizeWorkflowType(draft.type);

  if (!canonicalType) {
    return {
      status: "invalid",
      issues: [
        {
          severity: "error",
          message: `Unsupported workflow type: "${draft.type}". Supported types: ${getSupportedTypes().join(", ")}.`,
          field: "type",
        },
      ],
      riskNotes: [],
    };
  }

  // ── Route to compiler ─────────────────────────────────────────────────

  const compiler = COMPILER_REGISTRY.get(canonicalType);

  if (!compiler) {
    return {
      status: "invalid",
      issues: [
        {
          severity: "error",
          message: `No compiler found for workflow type: "${canonicalType}".`,
          field: "type",
        },
      ],
      riskNotes: [],
    };
  }

  // ── Compile ───────────────────────────────────────────────────────────

  return compiler.compile(draft);
}

// ── Re-exports ────────────────────────────────────────────────────────────────

export {
  SUPPORTED_WORKFLOW_TYPES,
  type WorkflowType,
  type AgentDraft,
  type CompilationResult,
  type CompilationIssue,
  type CompilationStatus,
  type WorkflowCompiler,
  type CompiledWorkflowJson,
  type SinglePaymentWorkflowJson,
  type BulkPayoutWorkflowJson,
  type LiquidityPathAnalysisWorkflowJson,
  type BulkAccountCreationWorkflowJson,
  type CompoundWorkflowJson,
  type CompoundStep,
  type WorkflowMetadata,
} from "./types";


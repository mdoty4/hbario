// ──────────────────────────────────────────────────────────────────────────────
// Tool Router
//
// Validates agent-proposed tool plans against the backend-controlled allowlist.
// Rejects unknown tools, dangerous tools, and invalid arguments.
// Returns an approved tool plan that can be saved into workflow JSON.
// No private keys, no automatic fund movement.
// ──────────────────────────────────────────────────────────────────────────────

import {
  ToolPlan,
  ToolRoutingResult,
  ToolValidationResult,
} from "./types";
import {
  getAllowedToolNames,
  getToolEntry,
  isDangerousTool,
} from "./toolRegistry";

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a single tool name against the allowlist and denylist.
 */
function validateToolName(toolName: string): ToolValidationResult {
  // Check denylist first (safety-critical)
  if (isDangerousTool(toolName)) {
    return {
      tool: toolName,
      approved: false,
      reason: `Dangerous tool "${toolName}" is explicitly blocked by the denylist.`,
    };
  }

  // Check allowlist
  const allowed = getAllowedToolNames();
  if (!allowed.has(toolName)) {
    return {
      tool: toolName,
      approved: false,
      reason: `Unknown tool "${toolName}" is not in the allowlist.`,
    };
  }

  return { tool: toolName, approved: true };
}

/**
 * Validate arguments provided for a tool call against the registry schema.
 * Performs basic type checking and required-argument validation.
 */
function validateToolArgs(
  toolName: string,
  args: Record<string, unknown> | undefined
): string[] {
  const entry = getToolEntry(toolName);
  if (!entry) {
    return [`Tool "${toolName}" not found in registry.`];
  }

  const errors: string[] = [];

  for (const argSchema of entry.args) {
    if (argSchema.required) {
      if (!args || !(argSchema.name in args)) {
        errors.push(
          `Missing required argument "${argSchema.name}" for tool "${toolName}".`
        );
        continue;
      }

      const value = args[argSchema.name];
      if (value === undefined || value === null) {
        errors.push(
          `Required argument "${argSchema.name}" for tool "${toolName}" is null or undefined.`
        );
        continue;
      }

      const actualType = Array.isArray(value)
        ? "array"
        : typeof value;
      if (actualType !== argSchema.type) {
        errors.push(
          `Argument "${argSchema.name}" for tool "${toolName}" expected type "${argSchema.type}" but got "${actualType}".`
        );
      }
    }
  }

  return errors;
}

// ── Router ────────────────────────────────────────────────────────────────────

/**
 * Route an agent's proposed tool plan through the backend router.
 *
 * The router:
 * 1. Checks every tool name against the allowlist.
 * 2. Rejects any tool on the denylist.
 * 3. Validates basic arguments for each tool call.
 * 4. Returns an approved plan or a list of rejection reasons.
 *
 * @param plan - The tool plan proposed by the agent.
 * @returns A routing result indicating approval or rejection.
 */
export function routeToolPlan(plan: ToolPlan): ToolRoutingResult {
  const tools: ToolValidationResult[] = [];
  const rejectionReasons: string[] = [];

  // ── Validate required_tools list ────────────────────────────────────────

  if (!plan.required_tools || !Array.isArray(plan.required_tools)) {
    return {
      approved: false,
      tools: [],
      rejection_reasons: [
        "Tool plan must include a 'required_tools' array.",
      ],
    };
  }

  if (plan.required_tools.length === 0) {
    return {
      approved: false,
      tools: [],
      rejection_reasons: [
        "Tool plan must specify at least one tool in 'required_tools'.",
      ],
    };
  }

  for (const toolName of plan.required_tools) {
    const result = validateToolName(toolName);
    tools.push(result);
    if (!result.approved && result.reason) {
      rejectionReasons.push(result.reason);
    }
  }

  // ── Validate tool_calls arguments (if provided) ────────────────────────

  if (plan.tool_calls) {
    for (const call of plan.tool_calls) {
      const argErrors = validateToolArgs(call.name, call.args);
      for (const err of argErrors) {
        rejectionReasons.push(err);
        if (!tools.find((t) => t.tool === call.name)) {
          tools.push({
            tool: call.name,
            approved: false,
            reason: err,
          });
        }
      }
    }
  }

  // ── Build result ────────────────────────────────────────────────────────

  if (rejectionReasons.length > 0) {
    return {
      approved: false,
      tools,
      rejection_reasons: rejectionReasons,
    };
  }

  const approvedPlan: ToolPlan = {
    workflow_type: plan.workflow_type,
    required_tools: plan.required_tools,
    tool_calls: plan.tool_calls,
  };

  return {
    approved: true,
    tools,
    approved_plan: approvedPlan,
  };
}

// ── Serialization Helpers ─────────────────────────────────────────────────────

/**
 * Serialize an approved tool plan into a JSON string suitable for
 * storing in the workflowJson field of a Workflow record.
 *
 * @param plan - An approved tool plan.
 * @returns A JSON string representation.
 */
export function serializeToolPlan(plan: ToolPlan): string {
  return JSON.stringify(plan, null, 2);
}

/**
 * Deserialize and re-validate a previously saved tool plan from JSON.
 * This ensures that saved plans remain valid even if the registry changes.
 *
 * @param json - A JSON string containing a tool plan.
 * @returns The routing result for the deserialized plan.
 */
export function deserializeAndValidateToolPlan(json: string): ToolRoutingResult {
  let plan: ToolPlan;
  try {
    plan = JSON.parse(json) as ToolPlan;
  } catch {
    return {
      approved: false,
      tools: [],
      rejection_reasons: ["Failed to parse tool plan JSON."],
    };
  }
  return routeToolPlan(plan);
}

/**
 * Check whether a workflow type is supported.
 * Supported types are those that have at least one known tool sequence.
 */
export function isSupportedWorkflowType(workflowType: string): boolean {
  const supportedTypes = new Set([
    "transfer",
    "bulk_payout",
    "batch-transfer",
    "account_validation",
    "fee_estimate",
    "transaction_verification",
  ]);
  return supportedTypes.has(workflowType);
}

import { NextResponse } from "next/server";

/**
 * GET /api/services
 *
 * UCP/AP2-inspired service manifest endpoint.
 * Returns a machine-readable description of the services this agent provides.
 * Public — no authentication required.
 */
export async function GET() {
  return NextResponse.json({
    services: [
      {
        service_id: "workflow_generation",
        name: "Hedera Workflow Generation",
        description:
          "Accepts a natural language request and returns a compiled workflow JSON, human-readable summary, tool plan, and (after payment and approval) a transaction receipt.",
        price: "2 HBAR",
        currency: "HBAR",
        inputs: ["natural_language_request"],
        outputs: ["workflow_json", "human_summary", "tool_plan", "receipt"],
        payment_required: true,
        supported_workflow_types: [
          "single_payment",
          "bulk_payout",
          "liquidity_path_analysis",
        ],
        safety_model: "human_approval_required",
      },
    ],
  });
}

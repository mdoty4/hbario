// Next.js instrumentation hook.
// Runs once per server instance, before the first request.

import { validateEnvOrExit } from "@/lib/env";

export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    validateEnvOrExit();
  }
}

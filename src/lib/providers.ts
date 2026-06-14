// ──────────────────────────────────────────────────────────────────────────────
// Provider Registry
//
// Frontend registry mapping provider keys to their configuration details.
// Used by the UI to render provider selection, model pickers, and API config.
// ──────────────────────────────────────────────────────────────────────────────

// ── Types ──────────────────────────────────────────────────────────────────────

/** A single available model within a provider. */
export interface ProviderModel {
  /** The model identifier used in API calls. */
  id: string;
  /** Human-readable display name. */
  name: string;
}

/** Configuration details for a single AI provider. */
export interface ProviderEntry {
  /** Human-readable display name shown in the UI. */
  displayName: string;
  /** Default API base URL for the provider's API endpoint. */
  defaultApiBaseUrl: string;
  /** Array of available models for this provider. */
  models: ProviderModel[];
  /** Recommended default model identifier. */
  defaultModel: string;
}

/** The complete provider registry keyed by provider slug. */
export type ProviderRegistry = Record<string, ProviderEntry>;

// ── Registry ───────────────────────────────────────────────────────────────────

/**
 * Authoritative registry of supported AI providers.
 *
 * Each key is the provider's unique slug used internally.
 * The UI uses this to render provider selection dropdowns,
 * model pickers, and API configuration fields.
 */
export const PROVIDER_REGISTRY: ProviderRegistry = {
  // ── Custom / Manual ──────────────────────────────────────────────────────

  /**
   * Manual / Custom provider — user supplies their own API endpoint and model.
   * All defaults are empty so the UI requires explicit input.
   */
  custom: {
    displayName: "Manual",
    defaultApiBaseUrl: "",
    models: [],
    defaultModel: "",
  },

  // ── OpenAI ───────────────────────────────────────────────────────────────

  openai: {
    displayName: "OpenAI",
    defaultApiBaseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o Mini" },
      { id: "gpt-4-turbo", name: "GPT-4 Turbo" },
      { id: "gpt-4", name: "GPT-4" },
      { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo" },
    ],
    defaultModel: "gpt-4o",
  },

  // ── Anthropic ────────────────────────────────────────────────────────────

  anthropic: {
    displayName: "Anthropic",
    defaultApiBaseUrl: "https://api.anthropic.com",
    models: [
      { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", name: "Claude Opus 4" },
      { id: "claude-haiku-3-5-20241022", name: "Claude Haiku 3.5" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
    ],
    defaultModel: "claude-sonnet-4-20250514",
  },

  // ── Google Gemini ────────────────────────────────────────────────────────

  google: {
    displayName: "Google Gemini",
    defaultApiBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    models: [
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash" },
      { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite" },
      { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    ],
    defaultModel: "gemini-2.5-pro",
  },

  // ── X AI / Grok ──────────────────────────────────────────────────────────

  xai: {
    displayName: "X AI (Grok)",
    defaultApiBaseUrl: "https://api.x.ai/v1",
    models: [
      { id: "grok-4", name: "Grok 4" },
      { id: "grok-4-mini", name: "Grok 4 Mini" },
      { id: "grok-3", name: "Grok 3" },
      { id: "grok-3-mini", name: "Grok 3 Mini" },
    ],
    defaultModel: "grok-4",
  },
};

// ── Accessors ────────────────────────────────────────────────────────────────

/**
 * Get all provider keys (slugs) from the registry.
 */
export function getProviderKeys(): string[] {
  return Object.keys(PROVIDER_REGISTRY);
}

/**
 * Look up a provider entry by key. Returns undefined if not found.
 */
export function getProvider(key: string): ProviderEntry | undefined {
  return PROVIDER_REGISTRY[key];
}

/**
 * Get all provider entries as an array.
 */
export function getAllProviders(): ProviderEntry[] {
  return Object.values(PROVIDER_REGISTRY);
}

// ── DOM Prefix Mapping ───────────────────────────────────────────────────────

/** Valid configuration scopes. */
export type ConfigScope = "global" | "project" | "editor";

/**
 * Maps a configuration scope to its corresponding DOM ID prefix.
 *
 * | Scope     | DOM Prefix         |
 * |-----------|--------------------|
 * | global    | `config-`          |
 * | project   | `project-config-`  |
 * | editor    | `editor-config-`   |
 *
 * @example
 * getDomPrefix("global")  // → "config-"
 * getDomPrefix("project") // → "project-config-"
 * getDomPrefix("editor")  // → "editor-config-"
 */
export function getDomPrefix(scope: ConfigScope): string {
  const prefixMap: Record<ConfigScope, string> = {
    global: "config-",
    project: "project-config-",
    editor: "editor-config-",
  };
  return prefixMap[scope];
}

// ── Provider Change Handler ──────────────────────────────────────────────────

/**
 * Returns the DOM element IDs for a given scope.
 *
 * @example
 * getDomIds("global")
 * // → { provider: "config-provider", apiBase: "config-apiBase", model: "config-model" }
 */
export function getDomIds(scope: ConfigScope): {
  provider: string;
  apiBase: string;
  model: string;
} {
  const prefix = getDomPrefix(scope);
  return {
    provider: `${prefix}provider`,
    apiBase: `${prefix}apiBase`,
    model: `${prefix}model`,
  };
}

/**
 * Handler called when a provider dropdown selection changes.
 *
 * Looks up the selected provider in the registry, determines the DOM prefix
 * from the scope, and auto-populates the API Base URL and Model inputs
 * with the provider's defaults.
 *
 * @param providerKey - The provider slug (e.g., "openai", "anthropic", "custom")
 * @param scope - The configuration scope ("global", "project", or "editor")
 *
 * @example
 * // In a React component:
 * const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
 *   onProviderChange(e.target.value, "global");
 * };
 */
export function onProviderChange(providerKey: string, scope: ConfigScope): void {
  // Look up the provider in the registry
  const provider = PROVIDER_REGISTRY[providerKey];
  if (!provider) {
    console.warn(`Provider "${providerKey}" not found in registry.`);
    return;
  }

  // Determine DOM prefix from scope
  const prefix = getDomPrefix(scope);

  // Auto-populate API Base URL input
  const apiBaseInput = document.getElementById(`${prefix}apiBase`) as HTMLInputElement | null;
  if (apiBaseInput) {
    apiBaseInput.value = provider.defaultApiBaseUrl;
  }

  // Auto-populate Model input
  const modelInput = document.getElementById(`${prefix}model`) as HTMLInputElement | null;
  if (modelInput) {
    modelInput.value = provider.defaultModel;
  }
}

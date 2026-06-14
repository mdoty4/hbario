"use client";

import { useEffect, useRef, useState } from "react";
import {
  PROVIDER_REGISTRY,
  onProviderChange,
  getDomPrefix,
  type ConfigScope,
  type ProviderEntry,
} from "@/lib/providers";
import { updateOverrideBadge } from "@/lib/overrideBadge";

/** Shape of a project returned by GET /api/projects. */
interface ProjectData {
  id: string;
  name: string;
  provider: string | null;
  apiBase: string | null;
  apiKey: string | null;
  model: string | null;
  maxTokens: number | null;
}

/** Tracks which fields have project-level overrides (non-null). */
interface OverrideFlags {
  provider: boolean;
  apiBase: boolean;
  apiKey: boolean;
  model: boolean;
  maxTokens: boolean;
}

interface SettingsPanelProps {
  /** Which configuration scope this panel manages. */
  scope: ConfigScope;
}

export default function SettingsPanel({ scope }: SettingsPanelProps) {
  const prefix = getDomPrefix(scope);

  const [provider, setProvider] = useState("custom");
  const [apiBase, setApiBase] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Fetched projects list for project-specific configuration.
  const [projects, setProjects] = useState<ProjectData[]>([]);

  // Tracks which fields show the "OVERRIDDEN" badge for the selected project.
  const [overridden, setOverridden] = useState<OverrideFlags>({
    provider: false,
    apiBase: false,
    apiKey: false,
    model: false,
    maxTokens: false,
  });

  // Ref to track whether initial config load has completed.
  // Ensures the provider-change effect only overwrites with saved values once.
  const loadedFromConfig = useRef(false);

  // Ref to track whether the project config select has been populated.
  // Prevents duplicate population of <option> elements.
  const projectSelectPopulated = useRef(false);

  // Sync OVERRIDDEN badge visibility with the overridden state via DOM helper.
  useEffect(() => {
    updateOverrideBadge(`${prefix}override-provider`, overridden.provider);
    updateOverrideBadge(`${prefix}override-apiBase`, overridden.apiBase);
    updateOverrideBadge(`${prefix}override-apiKey`, overridden.apiKey);
    updateOverrideBadge(`${prefix}override-model`, overridden.model);
    updateOverrideBadge(`${prefix}override-maxTokens`, overridden.maxTokens);
  }, [overridden, prefix]);

  // Watch provider changes — on initial load, calls onProviderChange() → overwrites with saved values.
  useEffect(() => {
    if (!loadedFromConfig.current) {
      // Fire the provider change handler to auto-populate DOM fields with provider defaults
      onProviderChange(provider, scope);

      // Overwrite DOM inputs with saved configuration values
      const apiBaseInput = document.getElementById(`${prefix}apiBase`) as HTMLInputElement | null;
      if (apiBaseInput) apiBaseInput.value = apiBase;

      const apiKeyInput = document.getElementById(`${prefix}apiKey`) as HTMLInputElement | null;
      if (apiKeyInput) apiKeyInput.value = apiKey;

      const modelInput = document.getElementById(`${prefix}model`) as HTMLInputElement | null;
      if (modelInput) modelInput.value = model;

      const maxTokensInput = document.getElementById(`${prefix}maxTokens`) as HTMLInputElement | null;
      if (maxTokensInput) maxTokensInput.value = maxTokens;

      loadedFromConfig.current = true;
    }
  }, [provider, apiBase, apiKey, model, maxTokens, prefix, scope]);

  // Load current configuration on mount
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/config");
        if (res.ok) {
          const data = await res.json();
          // Set provider dropdown first — this triggers the watcher effect above
          setProvider(data.provider || "custom");
          setApiBase(data.apiBase || "");
          setApiKey(data.apiKey || "");
          setModel(data.model || "");
          setMaxTokens(data.maxTokens != null ? String(data.maxTokens) : "");
        }
      } catch (err) {
        console.error("Failed to load config:", err);
        setError("Failed to load configuration.");
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  // Native DOM change listener on provider dropdown → onProviderChange(this.value, scope)
  useEffect(() => {
    const providerSelect = document.getElementById(`${prefix}provider`) as HTMLSelectElement | null;
    if (!providerSelect) return;

    const handleChange = () => {
      onProviderChange(providerSelect.value, scope);
    };

    providerSelect.addEventListener("change", handleChange);

    return () => {
      providerSelect.removeEventListener("change", handleChange);
    };
  }, [prefix, scope]);

  /**
   * populateProjectConfigSelect — Fetches GET /api/projects and populates
   * the project config select dropdown with <option> elements.
   * Also stores the fetched list in state for loadProjectConfig().
   * Uses a flag to prevent duplicate population.
   */
  const populateProjectConfigSelect = async () => {
    if (projectSelectPopulated.current) return;

    try {
      const res = await fetch("/api/projects");
      if (res.ok) {
        const data = await res.json();
        // Store projects in state so loadProjectConfig() can look them up.
        setProjects(data);
        const select = document.getElementById("project-config-project") as HTMLSelectElement | null;
        if (select) {
          data.forEach((project: { id: string; name: string }) => {
            const option = document.createElement("option");
            option.value = project.id;
            option.textContent = project.name;
            select.appendChild(option);
          });
          projectSelectPopulated.current = true;
        }
      }
    } catch (err) {
      console.error("Failed to populate project config select:", err);
    }
  };

  // Populate the project config select on mount
  useEffect(() => {
    populateProjectConfigSelect();
  }, []);

  // Handler for provider dropdown selection — fires onProviderChange
  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedKey = e.target.value;
    setProvider(selectedKey);
    setError(null);

    // Fire the provider change handler to auto-populate DOM fields
    onProviderChange(selectedKey, scope);

    // Also update React state with the provider defaults
    const entry = PROVIDER_REGISTRY[selectedKey];
    if (entry) {
      setApiBase(entry.defaultApiBaseUrl);
      setModel(entry.defaultModel);
    }
  };

  /**
   * loadProjectConfig — Reads the selected project ID from the dropdown,
   * finds the matching project in the fetched list, and populates fields.
   * Shows/hides "OVERRIDDEN" badges based on non-null values.
   * Triggers onProviderChange() if provider is set.
   * Bound to the project config dropdown change event.
   */
  const loadProjectConfig = () => {
    const select = document.getElementById("project-config-project") as HTMLSelectElement | null;
    if (!select) return;

    const selectedId = select.value;
    if (!selectedId) {
      // No project selected — clear overrides
      setOverridden({
        provider: false,
        apiBase: false,
        apiKey: false,
        model: false,
        maxTokens: false,
      });
      return;
    }

    // Find the selected project in the fetched list
    const project = projects.find((p) => p.id === selectedId);
    if (!project) return;

    // Determine which fields are overridden (non-null)
    const hasProvider = project.provider != null && project.provider !== "";
    const hasApiBase = project.apiBase != null && project.apiBase !== "";
    const hasApiKey = project.apiKey != null;
    const hasModel = project.model != null && project.model !== "";
    const hasMaxTokens = project.maxTokens != null;

    // Update override flags for OVERRIDDEN badges
    setOverridden({
      provider: hasProvider,
      apiBase: hasApiBase,
      apiKey: hasApiKey,
      model: hasModel,
      maxTokens: hasMaxTokens,
    });

    // Populate form fields with project values where overridden
    if (hasProvider) {
      setProvider(project.provider!);
      // Trigger onProviderChange() to auto-fill apiBase and model from provider defaults
      onProviderChange(project.provider!, scope);
    }
    if (hasApiBase) {
      setApiBase(project.apiBase!);
    }
    if (hasApiKey) {
      setApiKey(project.apiKey!);
    }
    if (hasModel) {
      setModel(project.model!);
    }
    if (hasMaxTokens) {
      setMaxTokens(String(project.maxTokens!));
    }
  };

  // Bind loadProjectConfig to the project config dropdown change event
  useEffect(() => {
    const projectSelect = document.getElementById("project-config-project") as HTMLSelectElement | null;
    if (!projectSelect) return;

    const handleChange = () => {
      loadProjectConfig();
    };

    projectSelect.addEventListener("change", handleChange);

    return () => {
      projectSelect.removeEventListener("change", handleChange);
    };
  }, [projects]);

  /**
   * saveConfig — Reads the current form state, POSTs to /api/config,
   * and shows a success toast/message (or error) on completion.
   * Bound to the save button.
   */
  const saveConfig = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiBase,
          apiKey,
          model,
          maxTokens: maxTokens ? parseInt(maxTokens, 10) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save configuration");
      }

      const data = await res.json();
      setSuccess(data.message || "Configuration saved successfully.");

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  /**
   * saveProjectConfig — Reads the selected project ID from the dropdown,
   * reads the current form fields, sends PUT /api/projects/:id with the
   * field values (empty string → null to clear overrides), and updates
   * the OVERRIDDEN badges based on the response.
   * Bound to the save project config button.
   */
  const saveProjectConfig = async () => {
    const select = document.getElementById("project-config-project") as HTMLSelectElement | null;
    if (!select || !select.value) {
      setError("Please select a project to save configuration.");
      return;
    }

    const projectId = select.value;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: provider && provider !== "custom" ? provider : null,
          apiBase: apiBase || null,
          apiKey: apiKey || null,
          model: model || null,
          maxTokens: maxTokens ? parseInt(maxTokens, 10) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save project configuration");
      }

      const data = await res.json();
      const updatedProject = data.project;

      // Update OVERRIDDEN badges based on the saved project data
      setOverridden({
        provider: updatedProject.provider != null && updatedProject.provider !== "",
        apiBase: updatedProject.apiBase != null && updatedProject.apiBase !== "",
        apiKey: updatedProject.apiKey != null,
        model: updatedProject.model != null && updatedProject.model !== "",
        maxTokens: updatedProject.maxTokens != null,
      });

      setSuccess(data.message || "Project configuration saved successfully.");

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save project configuration");
    } finally {
      setSaving(false);
    }
  };

  /**
   * clearProjectConfig — Confirms with the user, then sends
   * { provider: null, apiBase: null, apiKey: null, model: null, maxTokens: null }
   * via PUT /api/projects/:id to clear all project-level overrides.
   * On success, clears the UI form fields and hides all OVERRIDDEN badges.
   * Bound to the clear project config button.
   */
  const clearProjectConfig = async () => {
    const select = document.getElementById("project-config-project") as HTMLSelectElement | null;
    if (!select || !select.value) {
      setError("Please select a project to clear configuration.");
      return;
    }

    // Confirm before clearing
    if (!confirm("Are you sure you want to clear all project configuration overrides? This will reset all fields to inherit from the global config.")) {
      return;
    }

    const projectId = select.value;
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: null,
          apiBase: null,
          apiKey: null,
          model: null,
          maxTokens: null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to clear project configuration");
      }

      // Clear all form fields
      setProvider("custom");
      setApiBase("");
      setApiKey("");
      setModel("");
      setMaxTokens("");

      // Hide all OVERRIDDEN badges
      setOverridden({
        provider: false,
        apiBase: false,
        apiKey: false,
        model: false,
        maxTokens: false,
      });

      setSuccess("Project configuration cleared successfully. All fields now inherit from global config.");

      // Auto-dismiss success message after 3 seconds
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear project configuration");
    } finally {
      setSaving(false);
    }
  };

  // Get available models for the selected provider
  const availableModels: ProviderEntry["models"] =
    PROVIDER_REGISTRY[provider]?.models ?? [];

  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-4 bg-gray-200 rounded w-1/3" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
          <div className="h-10 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        AI Provider Settings
      </h2>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 p-3">
          <p className="text-sm text-green-800">{success}</p>
        </div>
      )}

      <div className="space-y-4">
        {/* Project Config Select */}
        <div>
          <label
            htmlFor="project-config-project"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Project Configuration
          </label>
          <select
            id="project-config-project"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">— Select a project —</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Select a project to load or save project-specific overrides. Overrides take precedence over global config.
          </p>
        </div>

        {/* Provider Dropdown */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label
              htmlFor={`${prefix}provider`}
              className="block text-sm font-medium text-gray-700"
            >
              Provider
            </label>
            <span
              id={`${prefix}override-provider`}
              style={{ display: "none" }}
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              OVERRIDDEN
            </span>
          </div>
          <select
            id={`${prefix}provider`}
            value={provider}
            onChange={handleProviderChange}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {Object.entries(PROVIDER_REGISTRY).map(([key, entry]) => (
              <option key={key} value={key}>
                {entry.displayName}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Select the AI provider you want to use. Choosing a provider will auto-fill the API Base URL and Model fields.
          </p>
        </div>

        {/* API Base URL */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label
              htmlFor={`${prefix}apiBase`}
              className="block text-sm font-medium text-gray-700"
            >
              API Base URL
            </label>
            <span
              id={`${prefix}override-apiBase`}
              style={{ display: "none" }}
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              OVERRIDDEN
            </span>
          </div>
          <input
            id={`${prefix}apiBase`}
            type="url"
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder="e.g., https://api.openai.com/v1"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            The base URL for the AI provider&apos;s API endpoint. Auto-filled when selecting a known provider.
          </p>
        </div>

        {/* API Key */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label
              htmlFor={`${prefix}apiKey`}
              className="block text-sm font-medium text-gray-700"
            >
              API Key
            </label>
            <span
              id={`${prefix}override-apiKey`}
              style={{ display: "none" }}
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              OVERRIDDEN
            </span>
          </div>
          <input
            id={`${prefix}apiKey`}
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            Your secret API key for authenticating with the provider. This value is stored securely and never echoed back.
          </p>
        </div>

        {/* Model */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label
              htmlFor={`${prefix}model`}
              className="block text-sm font-medium text-gray-700"
            >
              Model
            </label>
            <span
              id={`${prefix}override-model`}
              style={{ display: "none" }}
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              OVERRIDDEN
            </span>
          </div>
          {availableModels.length > 0 ? (
            <select
              id={`${prefix}model`}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {availableModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${prefix}model`}
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="Enter model name manually"
              className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          )}
          <p className="mt-1 text-xs text-gray-500">
            The AI model to use for generating responses. Pre-populated with available models for known providers.
          </p>
        </div>

        {/* Max Tokens */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <label
              htmlFor={`${prefix}maxTokens`}
              className="block text-sm font-medium text-gray-700"
            >
              Max Tokens
            </label>
            <span
              id={`${prefix}override-maxTokens`}
              style={{ display: "none" }}
              className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
            >
              OVERRIDDEN
            </span>
          </div>
          <input
            id={`${prefix}maxTokens`}
            type="number"
            min="1"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            placeholder="e.g., 4096"
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <p className="mt-1 text-xs text-gray-500">
            The maximum number of tokens the model can generate in a single response. Leave empty for the provider default.
          </p>
        </div>

        {/* Save Buttons */}
        <div className="config-actions">
          <button
            onClick={saveConfig}
            disabled={saving}
            className="config-actions-primary"
          >
            {saving ? "Saving..." : "Save Global Config"}
          </button>
          <button
            onClick={saveProjectConfig}
            disabled={saving}
            className="config-actions-primary"
            style={{ backgroundColor: "#059669" }}
          >
            {saving ? "Saving..." : "Save Project Config"}
          </button>
          <button
            onClick={clearProjectConfig}
            disabled={saving}
            className="config-actions-primary"
            style={{ backgroundColor: "#dc2626" }}
          >
            {saving ? "Clearing..." : "Clear Project Config"}
          </button>
        </div>
      </div>
    </div>
  );
}


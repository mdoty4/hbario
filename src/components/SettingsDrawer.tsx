"use client";

import { useState } from "react";
import { useSettingsDrawer } from "./SettingsDrawerContext";
import SettingsPanel from "./SettingsPanel";
import TelegramSettings from "./TelegramSettings";
import MCPSettings from "./MCPSettings";
import IntegrationsSettings from "./IntegrationsSettings";

type TabId =
  | "ai-provider"
  | "account"
  | "preferences"
  | "telegram"
  | "mcp"
  | "integrations";

interface Tab {
  id: TabId;
  label: string;
}

const TABS: Tab[] = [
  { id: "ai-provider", label: "AI Provider" },
  { id: "telegram", label: "Telegram" },
  { id: "mcp", label: "MCP" },
  { id: "integrations", label: "Integrations" },
  { id: "account", label: "Account" },
  { id: "preferences", label: "Preferences" },
];

export default function SettingsDrawer() {
  const { isOpen, closeSettingsDrawer } = useSettingsDrawer();
  const [activeTab, setActiveTab] = useState<TabId>("ai-provider");

  return (
    <>
      {/* Backdrop overlay */}
      <div
        className={`settings-drawer-backdrop fixed inset-0 z-40 bg-black/40 transition-opacity duration-300 ${
          isOpen ? "open opacity-100" : "pointer-events-none opacity-0"
        }`}
        onClick={closeSettingsDrawer}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`settings-drawer ${isOpen ? "open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
      >
        {/* Header with title and close button */}
        <div className="drawer-header">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button
            id="settings-close"
            onClick={closeSettingsDrawer}
            className="drawer-close-btn"
            aria-label="Close settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>

        {/* Tab navigation bar */}
        <nav className="drawer-tabs" aria-label="Settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`drawer-tab-btn${activeTab === tab.id ? " active" : ""}`}
              aria-selected={activeTab === tab.id}
              role="tab"
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Scrollable body */}
        <div className="drawer-body">
          {/* AI Provider tab */}
          <div className={`drawer-tab-content${activeTab === "ai-provider" ? " active" : ""}`}>
            <h3 className="mb-4 text-sm font-medium text-gray-700">AI Provider Configuration</h3>
            <SettingsPanel scope="global" />
          </div>

          {/* Telegram tab */}
          <div className={`drawer-tab-content${activeTab === "telegram" ? " active" : ""}`}>
            <h3 className="mb-4 text-sm font-medium text-gray-700">Telegram Bot Configuration</h3>
            <TelegramSettings />
          </div>

          {/* MCP tab */}
          <div className={`drawer-tab-content${activeTab === "mcp" ? " active" : ""}`}>
            <h3 className="mb-4 text-sm font-medium text-gray-700">MCP Server Configuration</h3>
            <MCPSettings />
          </div>

          {/* Integrations tab */}
          <div className={`drawer-tab-content${activeTab === "integrations" ? " active" : ""}`}>
            <h3 className="mb-4 text-sm font-medium text-gray-700">Integrations Overview</h3>
            <IntegrationsSettings
              onTabChange={(tabId) => {
                if (TABS.some((t) => t.id === tabId)) {
                  setActiveTab(tabId as TabId);
                }
              }}
            />
          </div>

          {/* Account tab */}
          <div className={`drawer-tab-content${activeTab === "account" ? " active" : ""}`}>
            <h3 className="mb-4 text-sm font-medium text-gray-700">Account Settings</h3>
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Account management settings coming soon.
              </p>
            </div>
          </div>

          {/* Preferences tab */}
          <div className={`drawer-tab-content${activeTab === "preferences" ? " active" : ""}`}>
            <h3 className="mb-4 text-sm font-medium text-gray-700">Preferences</h3>
            <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-gray-500">
                Preference settings coming soon.
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

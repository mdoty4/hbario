"use client";

type TabId =
  | "ai-provider"
  | "account"
  | "preferences"
  | "telegram"
  | "mcp"
  | "integrations"
  | "discord"
  | "slack"
  | "webhook"
  | "github";

interface IntegrationCard {
  name: string;
  description: string;
  status: "connected" | "disconnected" | "not-configured";
  icon: string;
  tabId: TabId;
}

interface IntegrationsSettingsProps {
  onTabChange?: (tabId: TabId) => void;
}

export default function IntegrationsSettings({ onTabChange }: IntegrationsSettingsProps) {
  const integrations: IntegrationCard[] = [
    {
      name: "Telegram",
      description: "Receive workflow notifications and send commands via Telegram bot.",
      status: "not-configured",
      icon: "✈️",
      tabId: "telegram",
    },
    {
      name: "MCP Server",
      description: "Connect to Model Context Protocol servers for extended tool execution.",
      status: "not-configured",
      icon: "🔗",
      tabId: "mcp",
    },
    {
      name: "Discord",
      description: "Integration with Discord for team notifications and workflow management.",
      status: "not-configured",
      icon: "🎮",
      tabId: "discord",
    },
    {
      name: "Slack",
      description: "Send workflow updates and receive commands through Slack channels.",
      status: "not-configured",
      icon: "💬",
      tabId: "slack",
    },
    {
      name: "Webhook",
      description: "Custom webhook endpoints for integrating with external services.",
      status: "not-configured",
      icon: "🪝",
      tabId: "webhook",
    },
    {
      name: "GitHub",
      description: "Connect GitHub repositories for automated workflow triggers.",
      status: "not-configured",
      icon: "🐙",
      tabId: "github",
    },
  ];

  const statusStyles: Record<string, string> = {
    connected: "bg-green-100 text-green-800 border-green-200",
    disconnected: "bg-yellow-100 text-yellow-800 border-yellow-200",
    "not-configured": "bg-gray-100 text-gray-600 border-gray-200",
  };

  const statusLabels: Record<string, string> = {
    connected: "Connected",
    disconnected: "Disconnected",
    "not-configured": "Not Configured",
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        Integrations
      </h2>
      <p className="text-sm text-gray-500 mb-6">
        Manage your connected services and integrations for workflow automation.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {integrations.map((integration) => (
          <div
            key={integration.name}
            className="rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition"
          >
            <div className="flex items-start gap-3">
              <span className="text-2xl">{integration.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">
                    {integration.name}
                  </h3>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusStyles[integration.status]}`}
                  >
                    {statusLabels[integration.status]}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-500 line-clamp-2">
                  {integration.description}
                </p>
                <button
                  onClick={() => onTabChange?.(integration.tabId)}
                  className="mt-3 text-xs font-medium text-blue-600 hover:text-blue-500"
                >
                  Configure &rarr;
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

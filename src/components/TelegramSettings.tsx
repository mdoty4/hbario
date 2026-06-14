"use client";

import { useState } from "react";

interface TelegramSettingsProps {
  onSave?: (config: TelegramConfig) => void;
}

interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
  webhookUrl: string;
}

export default function TelegramSettings({ onSave }: TelegramSettingsProps) {
  const [enabled, setEnabled] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleTestConnection = async () => {
    if (!botToken) {
      setError("Please enter a bot token to test the connection.");
      return;
    }
    setTesting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/telegram/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botToken }),
      });

      if (res.ok) {
        const data = await res.json();
        setSuccess(data.message || "Connection successful!");
      } else {
        const data = await res.json();
        throw new Error(data.error || "Connection failed");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to test connection");
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const config: TelegramConfig = {
      enabled,
      botToken,
      chatId,
      webhookUrl,
    };

    try {
      const res = await fetch("/api/telegram/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save configuration");
      }

      setSuccess("Telegram settings saved successfully.");
      onSave?.(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save configuration");
    } finally {
      setSaving(false);
    }
  };

  const inputClasses =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed";

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Telegram Integration
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
        {/* Enable Toggle */}
        <div className="flex items-center justify-between rounded-md border border-gray-200 p-4">
          <div>
            <p className="text-sm font-medium text-gray-900">Enable Telegram Bot</p>
            <p className="text-xs text-gray-500 mt-1">
              Receive workflow notifications and commands via Telegram.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled}
            onClick={() => setEnabled(!enabled)}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
              enabled ? "bg-blue-600" : "bg-gray-200"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                enabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Bot Token */}
        <div>
          <label
            htmlFor="telegram-bot-token"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Bot Token
          </label>
          <input
            id="telegram-bot-token"
            type="password"
            value={botToken}
            onChange={(e) => setBotToken(e.target.value)}
            disabled={!enabled}
            placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
            className={inputClasses}
          />
          <p className="mt-1 text-xs text-gray-500">
            Your Telegram bot token from @BotFather. Stored securely and never echoed back.
          </p>
        </div>

        {/* Chat ID */}
        <div>
          <label
            htmlFor="telegram-chat-id"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Chat ID
          </label>
          <input
            id="telegram-chat-id"
            type="text"
            value={chatId}
            onChange={(e) => setChatId(e.target.value)}
            disabled={!enabled}
            placeholder="-1001234567890"
            className={inputClasses}
          />
          <p className="mt-1 text-xs text-gray-500">
            The Telegram chat or group ID where notifications should be sent.
          </p>
        </div>

        {/* Webhook URL */}
        <div>
          <label
            htmlFor="telegram-webhook-url"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Webhook URL
          </label>
          <input
            id="telegram-webhook-url"
            type="url"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            disabled={!enabled}
            placeholder="https://your-domain.com/api/telegram/webhook"
            className={inputClasses}
          />
          <p className="mt-1 text-xs text-gray-500">
            The webhook URL for receiving Telegram updates. Leave empty to use polling mode.
          </p>
        </div>

        {/* Actions */}
        <div className="config-actions">
          <button
            onClick={handleTestConnection}
            disabled={testing || !enabled}
            className="config-actions-secondary"
          >
            {testing ? "Testing..." : "Test Connection"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !enabled}
            className="config-actions-primary"
          >
            {saving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

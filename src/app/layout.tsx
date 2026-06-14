import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import { WalletProviderWrapper } from "@/context/WalletContext";
import Navbar from "@/components/Navbar";
import { SettingsDrawerProvider } from "@/components/SettingsDrawerContext";
import SettingsDrawer from "@/components/SettingsDrawer";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://hbario.com"),
  title: {
    default: "hbario — Hedera workflows, on demand",
    template: "%s · hbario",
  },
  description:
    "hbario is a payment-gated Hedera commerce agent. Pay it in HBAR — from the chat as a human or over MCP as an AI agent — and get a verified Hedera workflow back. Built on Hedera Agent Kit; transfers signed by your wallet and verified on the Mirror Node.",
  applicationName: "hbario",
  keywords: [
    "hedera",
    "hbar",
    "payments",
    "agent",
    "mcp",
    "x402",
    "walletconnect",
  ],
  openGraph: {
    type: "website",
    url: "https://hbario.com",
    siteName: "hbario",
    title: "hbario — Hedera workflows, on demand",
    description:
      "A payment-gated commerce agent. Pay in HBAR. Get a verified Hedera workflow back. Humans use the chat. AI agents hire it over MCP.",
  },
  twitter: {
    card: "summary_large_image",
    title: "hbario — Hedera workflows, on demand",
    description:
      "Pay in HBAR. Get a verified Hedera workflow back. Humans use the chat. AI agents hire it over MCP.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SettingsDrawerProvider>
          <AuthProvider>
            <WalletProviderWrapper>
              <Navbar />
              <main className="flex-1">{children}</main>
              <SettingsDrawer />
            </WalletProviderWrapper>
          </AuthProvider>
        </SettingsDrawerProvider>
      </body>
    </html>
  );
}


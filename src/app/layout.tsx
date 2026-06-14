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
    default: "hbario — natural-language payments on Hedera",
    template: "%s · hbario",
  },
  description:
    "hbario turns plain-English requests into signed, verified Hedera workflows. Conversational HBAR payments for humans, with a built-in MCP endpoint so other AI agents can hire it.",
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
    title: "hbario — natural-language payments on Hedera",
    description:
      "Tell hbario what to pay. It plans the workflow, your wallet signs it, and every HBAR transfer is verified against the Hedera Mirror Node. Also speaks Model Context Protocol so other agents can hire it.",
  },
  twitter: {
    card: "summary_large_image",
    title: "hbario — natural-language payments on Hedera",
    description:
      "Conversational HBAR payments on Hedera, payable by humans and AI agents alike.",
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


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
  title: "hbario",
  description: "hbario — agentic payments on Hedera",
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


import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "PredictOS - The OpenSource All-In-One Prediction Market Framework",
  description: "The all-in-one open-source framework for prediction markets. Build agents, analyze markets, and trade smarter with AI-powered tools for Kalshi, Polymarket, and beyond.",
  keywords: ["prediction markets", "kalshi", "polymarket", "trading framework", "AI analysis", "open source", "trading agents", "market analytics", "SDK"],
  icons: {
    icon: "/logo.jpg",
    apple: "/logo.jpg",
  },
  openGraph: {
    title: "PredictOS - The OpenSource All-In-One Prediction Market Framework",
    description: "The all-in-one open-source framework for prediction markets. Terminal, Agents, Analytics, and SDK.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Telegram Mini App SDK — enables native theming, back button, and haptics */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased overflow-hidden">
        {/* Background Effects */}
        <div className="fixed inset-0 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />
        <div className="fixed inset-0 grid-bg opacity-30 pointer-events-none" />

        {/* Main Content */}
        <div className="relative z-10 h-screen">
          {children}
        </div>
      </body>
    </html>
  );
}

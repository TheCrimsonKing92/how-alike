import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import DevPrewarm from "@/components/DevPrewarm";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "How Alike — Face Similarity",
  description: "Client-side face similarity analyzer",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}>
        {process.env.NODE_ENV !== "production" ? <DevPrewarm /> : null}
        {/* PWA manifest */}
        <link rel="manifest" href="/manifest.webmanifest" />
        {/* Register service worker in production */}
        {process.env.NODE_ENV === "production" ? (
          <Script id="sw-register" strategy="afterInteractive">
            {`
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
              }
            `}
          </Script>
        ) : null}
        <header className="border-b border-black/10 dark:border-white/15">
          <div className="mx-auto w-full max-w-6xl px-6 py-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold">How Alike</h1>
            <nav className="text-sm opacity-80">Privacy-first, on-device analysis</nav>
          </div>
        </header>
        <main className="flex-1">
          {children}
        </main>
        <footer className="border-t border-black/10 dark:border-white/15">
          <div className="mx-auto w-full max-w-6xl px-6 py-4 text-sm opacity-80">
            © {new Date().getFullYear()} How Alike
          </div>
        </footer>
      </body>
    </html>
  );
}

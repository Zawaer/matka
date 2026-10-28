import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Matka — your journey, mapped",
  description: "Self-hosted location history, timeline and places.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* /embed/ pages (the phone app's WebView) hide the web chrome before
            first paint, so the app's own tab bar is the only nav; ?theme= makes
            the page follow the app's light/dark choice. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var d=document.documentElement;if(location.pathname.startsWith("/embed/"))d.classList.add("embed");var m=/[?&]theme=(light|dark)\b/.exec(location.search);if(m)d.dataset.theme=m[1]})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <a
          href="#main"
          className="sr-only z-50 rounded-control bg-surface px-3 py-2 text-sm font-medium text-text shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          Skip to content
        </a>
        <div className="min-h-screen sm:flex">
          <Nav />
          <main id="main" tabIndex={-1} className="min-w-0 flex-1 pb-20 outline-none sm:pb-0">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

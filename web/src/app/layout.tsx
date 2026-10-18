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
        {/* ?embed=1 (used by the mobile app's WebView) hides the web chrome
            before first paint, so the app's own tab bar is the only nav. ?theme= makes
            the page follow the app's light/dark choice. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var q=location.search,d=document.documentElement;if(/[?&]embed=1\\b/.test(q))d.classList.add("embed");var m=/[?&]theme=(light|dark)\\b/.exec(q);if(m)d.dataset.theme=m[1]})()`,
          }}
        />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <div className="min-h-screen md:flex">
          <Nav />
          <main className="min-w-0 flex-1 pb-20 md:pb-0">{children}</main>
        </div>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { Barlow, Barlow_Condensed } from "next/font/google";
// The stylesheet is layered, and order matters: globals (tokens, base, components)
// → theme (dark overrides those tokens) → motion → states.
import "./globals.css";
import "./theme-dark.css";
import "./motion.css";
import "./states.css";
import PWA from "./pwa";
import { PRE_PAINT_SCRIPT } from "@/components/theme";

// The Industry design system pairs Barlow Condensed headings over Barlow body
// text. Loading them here binds them to the --font-* tokens globals.css reads.
const barlow = Barlow({ subsets: ["latin"], weight: ["400", "500", "700"], variable: "--font-barlow", display: "swap" });
const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-barlow-condensed",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Research-to-Deck",
  description: "Name a topic. We screen the OpenAlex corpus, read the papers that matter, and compose a cited PowerPoint.",
  applicationName: "Research-to-Deck",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "R2Deck",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  // One theme colour per scheme, matching --color-bg in globals.css and theme-dark.css,
  // so the browser chrome sits flush with the page ground. These follow the OS; when
  // the user forces a theme, ThemeSwitch repoints them (see theme.ts).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f3" },
    { media: "(prefers-color-scheme: dark)", color: "#14191e" },
  ],
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      {/* suppressHydrationWarning: the pre-paint script sets data-theme on <html>
          before React hydrates, so the attribute legitimately differs from the server
          HTML. It applies to this element's own attributes only, not its children. */}
      <html lang="en" className={`${barlow.variable} ${barlowCondensed.variable}`} suppressHydrationWarning>
        <head>
          {/* Must run before first paint, or a stored "dark" flashes light for a frame. */}
          <script dangerouslySetInnerHTML={{ __html: PRE_PAINT_SCRIPT }} />
        </head>
        <body>
          {children}
          <PWA />
        </body>
      </html>
    </ClerkProvider>
  );
}

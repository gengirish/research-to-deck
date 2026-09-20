import type { Metadata, Viewport } from "next";
import "./globals.css";
import PWA from "./pwa";

export const metadata: Metadata = {
  title: "Research-to-Deck",
  description: "Turn 50+ papers into a cited, branded slide deck in minutes.",
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
  themeColor: "#0a0f1c",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <PWA />
      </body>
    </html>
  );
}

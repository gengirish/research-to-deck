import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Research-to-Deck",
  description: "Turn 50+ papers into a cited, branded slide deck in minutes.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

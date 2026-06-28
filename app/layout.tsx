import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Accessibility Monitor — free WCAG scan & EAA compliance monitoring",
  description:
    "Scan any website for accessibility issues in seconds, then monitor it continuously for ongoing EU Accessibility Act (EAA) audit evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

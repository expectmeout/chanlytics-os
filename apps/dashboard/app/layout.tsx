import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Chanlytics OS",
  description: "The business workspace where AI agents do the work and you make the calls.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}

import type { ReactNode } from "react";
import "./globals.css";

// The `lang` attribute becomes locale-aware when i18n lands; until then the
// source locale is the only one.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

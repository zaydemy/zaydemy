import { getDirection } from "@zaydemy/i18n";
import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { JetBrains_Mono, Lexend } from "next/font/google";
import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme-provider";
import { getConfig } from "@/lib/server/services";
import "./globals.css";

// latin-ext covers Turkish (ğ, ş, İ, ı) and most European languages.
const lexend = Lexend({ subsets: ["latin", "latin-ext"], variable: "--font-lexend" });
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  variable: "--font-jetbrains-mono",
});

export function generateMetadata(): Metadata {
  const { appName } = getConfig();
  return { title: { default: appName, template: `%s · ${appName}` } };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();

  return (
    <html
      lang={locale}
      dir={getDirection(locale)}
      className={`${lexend.variable} ${jetbrainsMono.variable}`}
      // next-themes sets the theme class before hydration.
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider>
          <NextIntlClientProvider>{children}</NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";

import { FlashProvider } from "../components/flash-provider";
import { LocaleSwitcher } from "../components/locale-switcher";
import { getI18n } from "../lib/i18n.server";
import "./globals.css";

export const metadata: Metadata = {
  title: "OmniList",
  description: "Create once, publish everywhere."
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale, dictionary } = await getI18n();

  return (
    <html lang={locale}>
      <body>
        <FlashProvider>
          <div className="app-toolbar">
            <div className="app-toolbar-inner">
              <span className="app-wordmark">{dictionary.common.appName}</span>
              <LocaleSwitcher currentLocale={locale} label={dictionary.layout.language} localeNames={dictionary.layout.localeNames} />
            </div>
          </div>
          {children}
        </FlashProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { DEFAULT_THEME, themeScript } from "@/lib/theme/themes";
import { ThemeSync } from "@/components/theme/theme-client";
import "./globals.css";

/*
 * Allo (Josh Puckett, SIL Open Font License 1.1), the variable "Friendly"
 * cut: weights 100 to 900, optical size follows the font size. Served from
 * this origin, so the CSP stays at font-src 'self'. License: src/fonts/allo/OFL.txt.
 */
const allo = localFont({
  src: "../fonts/allo/AlloVariableFriendly.woff2",
  variable: "--font-allo",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Lindgrün Anfragen", template: "%s | Lindgrün Anfragen" },
  description: "Anfragen-CRM für einen Catering- und Eventbetrieb (Demo mit erfundenen Daten).",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0c0f" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="de" data-theme={DEFAULT_THEME} className={`${allo.variable} h-full`} suppressHydrationWarning>
      <head>
        {/* Constant script from a fixed list, see src/lib/theme/themes.ts. Runs before the first paint. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript() }} />
      </head>
      <body className="min-h-full text-sm">
        <ThemeSync />
        {children}
      </body>
    </html>
  );
}

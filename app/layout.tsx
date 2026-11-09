import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { THEME_COLORS, THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const title = "RFF – cheap flights, beyond direct";
const description =
  "Find the cheapest flights, including one-stop connections you can't book as one trip. Flexible dates, price calendar and \"Anywhere\" search.";

export const metadata: Metadata = {
  // Absolute links in previews and the canonical address; set SITE_URL if the site moves
  metadataBase: new URL(process.env.SITE_URL ?? "https://rff.fvcloud.eu"),
  title,
  description,
  // Search engines list rff.fvcloud.eu, not rffapp.azurewebsites.net
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "RFF",
    title,
    description,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  icons: {
    icon: "/logo.svg?v=4",
    shortcut: "/logo.svg?v=4",
    apple: "/pwa-icons/180.png",
  },
  // When added to an iPhone home screen: open full screen, named "RFF"
  appleWebApp: {
    capable: true,
    title: "RFF",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  // Follows the system setting from the first frame; ThemeToggle overrides it when a theme was picked with the switch
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLORS.dark },
  ],
  // Draw behind the phone's status bar and notch; the page adds the needed padding (safe-area insets)
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

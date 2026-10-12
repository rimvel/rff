import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const title = "RFF – cheap flights, beyond direct";
const description =
  "Find the cheapest flights, including one-stop connections you can't book as one trip. Flexible dates, price calendar and \"Anywhere\" search.";

export const metadata: Metadata = {
  // Absolute links in previews; set SITE_URL if the site moves
  metadataBase: new URL(process.env.SITE_URL ?? "https://rffapp.azurewebsites.net"),
  title,
  description,
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
  themeColor: "#5161ce",
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
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}

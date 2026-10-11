import type { Metadata } from "next";
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
    apple: "/logo.svg?v=4",
  },
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

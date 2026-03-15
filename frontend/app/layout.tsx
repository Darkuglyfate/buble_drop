import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import {
  bubbleDropAppIdentity,
  getBubbleDropAppUrl,
} from "./app-metadata";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const appUrl = getBubbleDropAppUrl();

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: bubbleDropAppIdentity.name,
    template: bubbleDropAppIdentity.titleTemplate,
  },
  description: bubbleDropAppIdentity.description,
  applicationName: bubbleDropAppIdentity.name,
  category: bubbleDropAppIdentity.categorySuggestion,
  keywords: [
    "Base app",
    "daily check-in",
    "bubble session",
    "XP progression",
    "rare rewards",
    "partner tokens",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: appUrl,
    title: bubbleDropAppIdentity.name,
    description: bubbleDropAppIdentity.description,
    siteName: bubbleDropAppIdentity.name,
  },
  twitter: {
    card: "summary",
    title: bubbleDropAppIdentity.name,
    description: bubbleDropAppIdentity.description,
  },
  icons: {
    icon: "/favicon.ico",
  },
  other: {
    "base:app_id": "69b7314fd6271e8cedf2addb",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

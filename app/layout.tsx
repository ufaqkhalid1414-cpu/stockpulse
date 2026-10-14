import { DM_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { StoreProvider } from "@/lib/store";
import { allowIndexing, siteUrl } from "@/lib/seo";
import "./globals.css";

const dm = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

const title = "StockPulse — See your stock clearly";
const description =
  "Calm inventory for shop owners. Track warehouse, shop, and online stock in one place, with WhatsApp login and alerts.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: title,
    template: "%s · StockPulse",
  },
  description,
  applicationName: "StockPulse",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icons/favicon.ico", sizes: "any" },
      { url: "/icons/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
  appleWebApp: {
    capable: true,
    title: "StockPulse",
    statusBarStyle: "default",
  },
  openGraph: {
    title,
    description,
    siteName: "StockPulse",
    type: "website",
    locale: "en",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
  },
  robots: allowIndexing()
    ? { index: true, follow: true }
    : { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#2D3B5E",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={dm.variable} suppressHydrationWarning>
      <body className="bg-cream font-sans text-navy antialiased">
        <StoreProvider>
          <Providers>{children}</Providers>
        </StoreProvider>
      </body>
    </html>
  );
}

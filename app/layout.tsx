import { DM_Sans } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import { StoreProvider } from "@/lib/store";
import "./globals.css";

const dm = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "StockPulse",
    template: "%s · StockPulse",
  },
  description:
    "StockPulse — calm inventory for shop owners across warehouse, shop, and online. WhatsApp login, daily reports, and price alerts.",
};

export const viewport: Viewport = {
  themeColor: "#FAF6EE",
  width: "device-width",
  initialScale: 1,
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

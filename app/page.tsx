import { existsSync } from "fs";
import path from "path";
import type { Metadata } from "next";
import { HomeClient } from "./HomeClient";
import { allowIndexing } from "@/lib/seo";

const title = "StockPulse — See your stock clearly";
const description =
  "Calm inventory for shop owners. Track warehouse, shop, and online stock in one place, with WhatsApp login and alerts.";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/" },
  openGraph: {
    title,
    description,
    type: "website",
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

export default function HomePage() {
  const heroPath = path.join(process.cwd(), "public", "images", "landing", "hero-shop.jpg");
  const heroBg = existsSync(heroPath) ? "/images/landing/hero-shop.jpg" : null;
  return <HomeClient heroBg={heroBg} />;
}

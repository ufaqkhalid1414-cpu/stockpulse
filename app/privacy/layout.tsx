import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How StockPulse collects, stores, and protects business stock data.",
};

export default function PrivacyLayout({ children }: { children: React.ReactNode }) {
  return children;
}

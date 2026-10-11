import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Use",
  description: "Terms for using StockPulse early-access inventory tools.",
};

export default function TermsLayout({ children }: { children: React.ReactNode }) {
  return children;
}

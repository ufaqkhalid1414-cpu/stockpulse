import type { MetadataRoute } from "next";
import { allowIndexing, siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  if (!allowIndexing()) return [];
  const base = siteUrl();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}

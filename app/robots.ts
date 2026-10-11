import type { MetadataRoute } from "next";
import { allowIndexing, siteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  if (!allowIndexing()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
    };
  }
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

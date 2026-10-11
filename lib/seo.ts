/** Site URL for metadata / OG / sitemap. Never hardcode a production domain. */
export function siteUrl() {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, "");
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}

/** Indexing stays off unless explicitly enabled. */
export function allowIndexing() {
  return process.env.ALLOW_INDEXING === "true";
}

import { canImportProducts, requireAccess } from "@/lib/access";
import { jsonNoStore } from "@/lib/api-response";
import { buildImportTemplateCsv } from "@/lib/product-import";

export const runtime = "nodejs";

export async function GET() {
  const ctx = await requireAccess();
  if (!ctx) return jsonNoStore({ error: "Please log in with WhatsApp first" }, { status: 401 });
  if (!canImportProducts(ctx.role)) {
    return jsonNoStore({ error: "Only owners can import products." }, { status: 403 });
  }
  const csv = buildImportTemplateCsv();
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="stockpulse-import-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}

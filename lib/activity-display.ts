import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { t, type Lang } from "@/lib/i18n";
import type { AccessRole, ActivityHistoryItem, Location } from "@/lib/types";

function roleLabel(lang: Lang, role: AccessRole) {
  if (role === "equal_owner" || role === "co_owner") return t(lang, "activityRoleOwner");
  return t(lang, "activityRoleStaff");
}

function locationName(lang: Lang, location: Location | null) {
  if (!location) return null;
  if (location === "warehouse") return t(lang, "warehouse");
  if (location === "shop") return t(lang, "shop");
  return t(lang, "online");
}

export function activityActionLabel(lang: Lang, item: ActivityHistoryItem) {
  switch (item.action) {
    case "product_added":
      return t(lang, "activityActionProductAdded");
    case "stock_deducted":
      return t(lang, "activityActionStockDeducted");
    case "purchase_price_changed":
      return t(lang, "activityActionPriceChanged");
    case "staff_added":
      return t(lang, "activityActionStaffAdded");
    case "owner_added":
      return t(lang, "activityActionOwnerAdded");
    case "owner_removed":
      return t(lang, "activityActionOwnerRemoved");
    case "settings_changed":
      return t(lang, "activityActionSettingsChanged");
    default:
      return item.summary;
  }
}

export function activityWhatLine(lang: Lang, item: ActivityHistoryItem) {
  const name = item.productName || "";
  switch (item.action) {
    case "product_added":
      return t(lang, "activityWhatProductAdded", {
        qty: formatQty(Math.abs(item.quantityChange ?? 0)),
        name,
      });
    case "stock_deducted":
      return t(lang, "activityWhatStockDeducted", {
        qty: formatQty(Math.abs(item.quantityChange ?? 0)),
        name,
      });
    case "purchase_price_changed":
      return t(lang, "activityWhatPriceChanged", { name });
    case "staff_added":
    case "owner_added":
    case "owner_removed":
    case "settings_changed":
      return item.summary;
    default:
      return item.summary;
  }
}

export function activityWhereLine(lang: Lang, item: ActivityHistoryItem) {
  if (item.fromLocation && item.toLocation) {
    return `${locationName(lang, item.fromLocation)} → ${locationName(lang, item.toLocation)}`;
  }
  return locationName(lang, item.location);
}

export function activityChangeLine(lang: Lang, item: ActivityHistoryItem) {
  if (item.action === "purchase_price_changed" && item.previousValue != null && item.newValue != null) {
    return `${formatMoney(item.previousValue)} → ${formatMoney(item.newValue)}`;
  }
  if (item.previousValue != null && item.newValue != null) {
    const loc = locationName(lang, item.location);
    const stock = `${formatQty(item.previousValue)} → ${formatQty(item.newValue)}`;
    if (item.previousTotal != null && item.newTotal != null) {
      const total = t(lang, "activityTotalChange", {
        previous: formatQty(item.previousTotal),
        next: formatQty(item.newTotal),
      });
      return loc ? `${loc}: ${stock} · ${total}` : `${stock} · ${total}`;
    }
    return loc ? `${loc}: ${stock}` : stock;
  }
  return item.detail;
}

export function formatActivityCard(lang: Lang, item: ActivityHistoryItem) {
  return {
    who: `${item.actorName} · ${roleLabel(lang, item.actorRole)}`,
    what: activityWhatLine(lang, item),
    where: activityWhereLine(lang, item),
    change: activityChangeLine(lang, item),
    when: formatDateTime(item.createdAt, lang),
    action: activityActionLabel(lang, item),
  };
}

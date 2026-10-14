import type { AccessRole, Permission } from "@/lib/types";

export function parseStaffPermission(raw: unknown): Permission {
  const value = String(raw || "").trim().toLowerCase();
  if (value === "add" || value === "sell" || value === "move" || value === "view") return value;
  return "view";
}

export function roleFromPermission(permission: Permission): AccessRole {
  if (permission === "add") return "staff_add";
  if (permission === "sell") return "staff_sell";
  if (permission === "move") return "staff_move";
  return "staff_view";
}

export function permissionLabelKey(permission: Permission): "permView" | "permAdd" | "permSell" | "permMove" {
  if (permission === "add") return "permAdd";
  if (permission === "sell") return "permSell";
  if (permission === "move") return "permMove";
  return "permView";
}

export function permissionActivityLabel(permission: Permission): string {
  if (permission === "add") return "add stock";
  if (permission === "sell") return "record sales";
  if (permission === "move") return "move stock";
  return "view only";
}

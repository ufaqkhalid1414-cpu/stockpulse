import { firestoreDb, newId, nowIso } from "@/lib/db";
import { sendWhatsApp } from "@/lib/twilio";

export type OutboundStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed"
  | "window_closed";

export type OutboundMessage = {
  id: string;
  businessId: string;
  toPhone: string;
  kind: string;
  bodyPreview: string;
  status: OutboundStatus;
  providerSid: string | null;
  failReason: string | null;
  attempt: number;
  nextRetryAt: string | null;
  createdAt: string;
  updatedAt: string;
};

const RETRY_DELAYS_MS = [60_000, 10 * 60_000, 60 * 60_000]; // 1m, 10m, 1h

function col(businessId: string) {
  return firestoreDb().collection("businesses").doc(businessId).collection("outboundMessages");
}

export function classifySendFailure(message: string | null | undefined): {
  status: OutboundStatus;
  permanent: boolean;
} {
  const m = String(message || "").toLowerCase();
  if (
    m.includes("63016") ||
    m.includes("outside the allowed window") ||
    m.includes("24 hour") ||
    m.includes("re-opt") ||
    m.includes("sandbox") && m.includes("join")
  ) {
    return { status: "window_closed", permanent: true };
  }
  if (m.includes("not a valid") || m.includes("not a whatsapp") || m.includes("21211")) {
    return { status: "failed", permanent: true };
  }
  return { status: "failed", permanent: false };
}

export async function recordAndSendWhatsApp(input: {
  businessId: string;
  toPhone: string;
  kind: string;
  body: string;
  mediaUrl?: string;
}): Promise<OutboundMessage> {
  const id = newId();
  const createdAt = nowIso();
  const base: OutboundMessage = {
    id,
    businessId: input.businessId,
    toPhone: input.toPhone,
    kind: input.kind,
    bodyPreview: input.body.slice(0, 240),
    status: "queued",
    providerSid: null,
    failReason: null,
    attempt: 1,
    nextRetryAt: null,
    createdAt,
    updatedAt: createdAt,
  };
  await col(input.businessId).doc(id).set(base);

  const appBase = (process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
  const statusCallback = appBase
    ? `${appBase}/api/twilio/status?businessId=${encodeURIComponent(input.businessId)}`
    : undefined;

  try {
    const sent = await sendWhatsApp(input.toPhone, input.body, input.mediaUrl, {
      statusCallback,
    });
    if (sent.skipped) {
      const updated: OutboundMessage = {
        ...base,
        status: "failed",
        failReason: sent.error || "Twilio is not configured",
        updatedAt: nowIso(),
      };
      await col(input.businessId).doc(id).set(updated, { merge: true });
      return updated;
    }
    const updated: OutboundMessage = {
      ...base,
      status: "sent",
      providerSid: sent.sid,
      updatedAt: nowIso(),
    };
    await col(input.businessId).doc(id).set(updated, { merge: true });
    return updated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Send failed";
    const { status, permanent } = classifySendFailure(msg);
    const updated: OutboundMessage = {
      ...base,
      status,
      failReason: status === "window_closed" ? "Window closed" : msg,
      nextRetryAt: permanent ? null : new Date(Date.now() + RETRY_DELAYS_MS[0]).toISOString(),
      updatedAt: nowIso(),
    };
    await col(input.businessId).doc(id).set(updated, { merge: true });
    return updated;
  }
}

export async function applyProviderStatus(input: {
  businessId: string;
  providerSid: string;
  status: string;
  errorCode?: string | null;
  errorMessage?: string | null;
}): Promise<void> {
  const snap = await col(input.businessId).where("providerSid", "==", input.providerSid).limit(1).get();
  if (snap.empty) return;
  const doc = snap.docs[0];
  const mapped = mapTwilioStatus(input.status, input.errorCode, input.errorMessage);
  await doc.ref.set(
    {
      status: mapped.status,
      failReason: mapped.failReason,
      updatedAt: nowIso(),
    },
    { merge: true },
  );
}

function mapTwilioStatus(
  status: string,
  errorCode?: string | null,
  errorMessage?: string | null,
): { status: OutboundStatus; failReason: string | null } {
  const s = status.toLowerCase();
  if (s === "queued" || s === "accepted") return { status: "queued", failReason: null };
  if (s === "sent" || s === "sending") return { status: "sent", failReason: null };
  if (s === "delivered") return { status: "delivered", failReason: null };
  if (s === "read") return { status: "read", failReason: null };
  if (s === "failed" || s === "undelivered") {
    const classified = classifySendFailure(`${errorCode || ""} ${errorMessage || ""}`);
    return {
      status: classified.status,
      failReason: classified.status === "window_closed" ? "Window closed" : errorMessage || errorCode || "Failed",
    };
  }
  return { status: "sent", failReason: null };
}

/** Retry due failed messages (max 3 attempts). Skips window_closed / permanent. */
export async function retryDueOutbound(businessId: string, now = Date.now()): Promise<number> {
  const snap = await col(businessId).where("status", "==", "failed").limit(50).get();
  let retried = 0;
  for (const doc of snap.docs) {
    const data = doc.data() as OutboundMessage;
    if (!data.nextRetryAt || data.attempt >= 3) continue;
    if (new Date(data.nextRetryAt).getTime() > now) continue;
    const body = data.bodyPreview;
    try {
      const sent = await sendWhatsApp(data.toPhone, body);
      const attempt = data.attempt + 1;
      if (sent.skipped) {
        await doc.ref.set(
          {
            attempt,
            failReason: sent.error,
            nextRetryAt: attempt >= 3 ? null : new Date(now + RETRY_DELAYS_MS[Math.min(attempt - 1, 2)]).toISOString(),
            updatedAt: nowIso(),
          },
          { merge: true },
        );
        continue;
      }
      await doc.ref.set(
        {
          status: "sent",
          providerSid: sent.sid,
          attempt,
          failReason: null,
          nextRetryAt: null,
          updatedAt: nowIso(),
        },
        { merge: true },
      );
      retried += 1;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Retry failed";
      const { status, permanent } = classifySendFailure(msg);
      const attempt = data.attempt + 1;
      await doc.ref.set(
        {
          status,
          failReason: status === "window_closed" ? "Window closed" : msg,
          attempt,
          nextRetryAt:
            permanent || attempt >= 3
              ? null
              : new Date(now + RETRY_DELAYS_MS[Math.min(attempt - 1, 2)]).toISOString(),
          updatedAt: nowIso(),
        },
        { merge: true },
      );
    }
  }
  return retried;
}

export async function outboundStatsToday(businessId: string, timeZone: string) {
  const { localDateKey } = await import("@/lib/timezone");
  const today = localDateKey(new Date(), timeZone);
  const snap = await col(businessId).orderBy("createdAt", "desc").limit(300).get();
  let sent = 0;
  let failed = 0;
  let windowClosed = 0;
  let lastFailReason: string | null = null;
  for (const doc of snap.docs) {
    const data = doc.data() as OutboundMessage;
    const created = new Date(data.createdAt);
    if (Number.isNaN(created.getTime())) continue;
    if (localDateKey(created, timeZone) !== today) continue;
    if (data.status === "failed") {
      failed += 1;
      lastFailReason = data.failReason;
    } else if (data.status === "window_closed") {
      windowClosed += 1;
      lastFailReason = "Window closed";
    } else if (
      data.status === "sent" ||
      data.status === "delivered" ||
      data.status === "read" ||
      data.status === "queued"
    ) {
      sent += 1;
    }
  }
  return { sent, failed, windowClosed, lastFailReason, today };
}

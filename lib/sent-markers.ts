import { firestoreDb, nowIso } from "@/lib/db";

/**
 * Atomic "sent once per period" claim (Prompt 18 rule 4).
 * Returns true if THIS caller won the claim and should send.
 * Returns false if already claimed (second run / retry / double trigger).
 */
export async function claimSentMarker(input: {
  businessId: string;
  personPhone: string;
  messageType: string;
  period: string;
}): Promise<boolean> {
  const docId = [
    input.messageType,
    input.personPhone.replace(/[^0-9+]/g, "_"),
    input.period,
  ].join("__");
  const ref = firestoreDb()
    .collection("businesses")
    .doc(input.businessId)
    .collection("sentMarkers")
    .doc(docId);

  return firestoreDb().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (snap.exists) return false;
    txn.set(ref, {
      businessId: input.businessId,
      personPhone: input.personPhone,
      messageType: input.messageType,
      period: input.period,
      claimedAt: nowIso(),
    });
    return true;
  });
}

/** Instant alerts: claim once per event key. */
export async function claimEventAlertKey(input: {
  businessId: string;
  eventKey: string;
}): Promise<boolean> {
  const ref = firestoreDb()
    .collection("businesses")
    .doc(input.businessId)
    .collection("sentMarkers")
    .doc(`event__${input.eventKey.replace(/[^0-9a-zA-Z_-]/g, "_")}`);
  return firestoreDb().runTransaction(async (txn) => {
    const snap = await txn.get(ref);
    if (snap.exists) return false;
    txn.set(ref, { eventKey: input.eventKey, claimedAt: nowIso() });
    return true;
  });
}

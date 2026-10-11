import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let app: App | null = null;
let db: Firestore | null = null;

function loadServiceAccount() {
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim();
  if (json) {
    const parsed = JSON.parse(json) as {
      project_id: string;
      client_email: string;
      private_key: string;
    };
    return {
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: parsed.private_key.replace(/\\n/g, "\n"),
    };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  let privateKey = process.env.FIREBASE_PRIVATE_KEY?.trim();
  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Firebase is not configured. Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_PROJECT_ID + FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env.local",
    );
  }
  privateKey = privateKey.replace(/\\n/g, "\n");
  return { projectId, clientEmail, privateKey };
}

export function getFirebaseApp(): App {
  if (app) return app;
  if (getApps().length > 0) {
    app = getApps()[0]!;
    return app;
  }
  const sa = loadServiceAccount();
  app = initializeApp({
    credential: cert({
      projectId: sa.projectId,
      clientEmail: sa.clientEmail,
      privateKey: sa.privateKey,
    }),
    projectId: sa.projectId,
  });
  return app;
}

export function getAdminFirestore(): Firestore {
  if (db) return db;
  db = getFirestore(getFirebaseApp());
  return db;
}

export function firebaseConfigured() {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim() ||
      (process.env.FIREBASE_PROJECT_ID?.trim() &&
        process.env.FIREBASE_CLIENT_EMAIL?.trim() &&
        process.env.FIREBASE_PRIVATE_KEY?.trim()),
  );
}

export function phoneDocId(phone: string) {
  return phone.replace(/\+/g, "p").replace(/\s+/g, "");
}

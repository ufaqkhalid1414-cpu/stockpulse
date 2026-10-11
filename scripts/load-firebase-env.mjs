/**
 * Safely append Firebase credentials from a local service-account JSON into .env.local
 * Usage (from project root):
 *   node scripts/load-firebase-env.mjs "C:\Users\...\your-adminsdk.json"
 *
 * Does not print private keys.
 */
import fs from "fs";
import path from "path";

const jsonPath = process.argv[2];
if (!jsonPath) {
  console.error('Usage: node scripts/load-firebase-env.mjs "path\\to\\serviceAccount.json"');
  process.exit(1);
}

const abs = path.resolve(jsonPath);
if (!fs.existsSync(abs)) {
  console.error("File not found:", abs);
  process.exit(1);
}

const sa = JSON.parse(fs.readFileSync(abs, "utf8"));
if (!sa.project_id || !sa.client_email || !sa.private_key) {
  console.error("JSON does not look like a Firebase service account.");
  process.exit(1);
}

const envPath = path.join(process.cwd(), ".env.local");
let existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";

// Strip previous Firebase keys
existing = existing
  .split(/\r?\n/)
  .filter(
    (line) =>
      !line.startsWith("DATABASE_BACKEND=") &&
      !line.startsWith("FIREBASE_PROJECT_ID=") &&
      !line.startsWith("FIREBASE_CLIENT_EMAIL=") &&
      !line.startsWith("FIREBASE_PRIVATE_KEY=") &&
      !line.startsWith("FIREBASE_SERVICE_ACCOUNT_JSON="),
  )
  .join("\n")
  .replace(/\n{3,}/g, "\n\n")
  .trimEnd();

const privateKey = String(sa.private_key).replace(/\r\n/g, "\n");
const block = [
  "",
  "DATABASE_BACKEND=firestore",
  `FIREBASE_PROJECT_ID=${sa.project_id}`,
  `FIREBASE_CLIENT_EMAIL=${sa.client_email}`,
  `FIREBASE_PRIVATE_KEY="${privateKey.replace(/\n/g, "\\n")}"`,
  "",
].join("\n");

fs.writeFileSync(envPath, `${existing}${block}`, "utf8");
console.log("Updated .env.local with Firebase keys for project:", sa.project_id);
console.log("DATABASE_BACKEND=firestore");
console.log("Private key was NOT printed.");

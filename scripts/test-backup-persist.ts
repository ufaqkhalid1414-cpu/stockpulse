import { ensureDbReady, getDb, usingTurso } from "@/lib/db";
import { createBusiness, getBusiness, runBackup, listBackupHistory } from "@/lib/db/queries";

async function main() {
  await ensureDbReady();
  console.log("database:", usingTurso() ? "turso" : "local-file");

  const marker = `persist-check-${Date.now()}`;
  const created = await createBusiness({
    name: marker,
    language: "en",
    ownerWhatsapp: "+92 300 1112233",
    seedSample: false,
  });
  console.log("created business", created.id, created.name);

  const backup = await runBackup(created.id);
  console.log("backup", backup);

  const history = await listBackupHistory(created.id);
  console.log("history count", history.length, "latest", history[0]);

  const again = await getBusiness(created.id);
  if (!again || again.name !== marker) {
    throw new Error("business not readable after write");
  }
  console.log("persistence write/read OK");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

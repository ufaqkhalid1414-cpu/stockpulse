import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const dir = path.dirname(fileURLToPath(import.meta.url));

const files = fs
  .readdirSync(dir)
  .filter((f) => /^\d{2}-.*\.md$/.test(f))
  .sort();

for (const md of files) {
  const input = path.join(dir, md);
  console.log("PDF:", md);
  execSync(`npx --yes md-to-pdf "${input}"`, {
    stdio: "inherit",
    cwd: dir,
  });
}

console.log("Done. PDFs in", dir);

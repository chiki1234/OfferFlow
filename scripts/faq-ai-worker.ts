import { config } from "dotenv";
import { setTimeout as delay } from "node:timers/promises";
import { executeNextFaqImportAnalysis } from "../src/modules/interview-knowledge/faq-import";
import { getDatabaseRuntime } from "../src/db/runtime";

config({ path: [".env.local", ".env"] });
let stopped = false;
process.on("SIGINT", () => { stopped = true; });
process.on("SIGTERM", () => { stopped = true; });
console.info("FAQ AI worker started");
try {
  while (!stopped) {
    try {
      if (!await executeNextFaqImportAnalysis()) await delay(2000);
    } catch {
      console.error("FAQ AI worker could not process a task; retrying shortly");
      await delay(5000);
    }
  }
} finally { await getDatabaseRuntime().close(); }

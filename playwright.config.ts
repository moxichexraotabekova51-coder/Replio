import { existsSync, readFileSync } from "node:fs";
import { defineConfig } from "@playwright/test";

// .env.local'ni yuklaymiz (service role kaliti test ma'lumotlarini tayyorlash uchun kerak)
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

// E2E: lokal Supabase (supabase start) + next dev + e2e/mock-checkout.mjs ishlab turishi kerak.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    viewport: { width: 1440, height: 900 },
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : undefined,
    trace: "retain-on-failure",
  },
});

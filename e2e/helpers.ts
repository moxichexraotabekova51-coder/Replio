import { createClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import type { Database } from "../src/lib/supabase/database.types";

export const admin = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false } },
);

export const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots";

/** Yangi foydalanuvchi: ro'yxatdan o'tish + akkaunt yaratish. Akkaunt id'sini qaytaradi. */
export async function signupAndOnboard(page: Page, name = "Ali Valiyev", account = "Ali do'koni") {
  const email = `u${Date.now()}${Math.floor(Math.random() * 1000)}@test.uz`;
  await page.goto("/signup");
  await page.fill("#fullName", name);
  await page.fill("#email", email);
  await page.fill("#password", "password123");
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app\/onboarding/);
  await page.fill("#acc-name", account);
  await page.click("button[type=submit]");
  await page.waitForURL(/\/app$/);
  const { data } = await admin.from("accounts").select("id, owner_id").eq("name", account).order("created_at", { ascending: false }).limit(1).single();
  return { email, accountId: data!.id, userId: data!.owner_id };
}

export async function railClick(page: Page, label: string) {
  await page.getByRole("navigation", { name: "Asosiy navigatsiya" }).getByRole("link", { name: label, exact: true }).click();
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

/** Radix submenu elementini haqiqiy sichqoncha harakati (bir necha qadam) bilan bosish */
export async function clickSubmenuItem(page: Page, name: string) {
  const item = page.getByRole("menuitem", { name, exact: true });
  await item.waitFor();
  await page.waitForTimeout(150);
  const box = (await item.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.mouse.down();
  await page.mouse.up();
}

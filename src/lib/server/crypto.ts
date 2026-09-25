import "server-only";

// Bot tokenlarini AES-256-GCM bilan shifrlash (BOT_TOKEN_KEY — 32 bayt hex).
// Format: "v1:" + base64(iv[12] || ciphertext+tag). Edge Function'da xuddi shu algoritm (WebCrypto).

function keyBytes(): Uint8Array<ArrayBuffer> {
  const hex = process.env.BOT_TOKEN_KEY ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("BOT_TOKEN_KEY must be 64 hex chars");
  return Uint8Array.from(hex.match(/../g)!.map((b) => parseInt(b, 16)));
}

async function importKey() {
  return crypto.subtle.importKey("raw", keyBytes(), "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await importKey(), new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return `v1:${Buffer.from(out).toString("base64")}`;
}

export async function decryptSecret(enc: string): Promise<string> {
  if (!enc.startsWith("v1:")) throw new Error("unknown secret format");
  const raw = Buffer.from(enc.slice(3), "base64");
  const bytes = new Uint8Array(raw);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bytes.slice(0, 12) }, await importKey(), bytes.slice(12));
  return new TextDecoder().decode(pt);
}

// Bot tokenini ochish (src/lib/server/crypto.ts bilan bir xil format: "v1:" + base64(iv || ct)).

let cachedKey: CryptoKey | null = null;

async function key(hex: string): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  if (!/^[0-9a-f]{64}$/i.test(hex)) throw new Error("BOT_TOKEN_KEY must be 64 hex chars");
  const bytes = new Uint8Array(hex.match(/../g)!.map((b) => parseInt(b, 16)));
  cachedKey = await crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["decrypt"]);
  return cachedKey;
}

export async function decryptSecret(enc: string, hexKey: string): Promise<string> {
  if (!enc.startsWith("v1:")) throw new Error("unknown secret format");
  const raw = Uint8Array.from(atob(enc.slice(3)), (c) => c.charCodeAt(0));
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, await key(hexKey), raw.slice(12));
  return new TextDecoder().decode(pt);
}

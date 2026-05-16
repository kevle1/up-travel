import { describe, expect, it } from "vitest";
import { verifyUpWebhook } from "../../src/webhook/verify";

async function signed(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

describe("verifyUpWebhook", () => {
  it("accepts a valid signature", async () => {
    const body = '{"data":{"id":"x"}}';
    const sig = await signed(body, "shh");
    expect(await verifyUpWebhook(body, sig, "shh")).toBe(true);
  });

  it("rejects a tampered payload", async () => {
    const body = '{"data":{"id":"x"}}';
    const sig = await signed(body, "shh");
    expect(await verifyUpWebhook(body + "!", sig, "shh")).toBe(false);
  });

  it("rejects wrong secret", async () => {
    const body = '{"data":{"id":"x"}}';
    const sig = await signed(body, "shh");
    expect(await verifyUpWebhook(body, sig, "nope")).toBe(false);
  });
});

/**
 * LINE Core — Webhook Signature Verification
 *
 * HMAC-SHA256 based X-Line-Signature verification.
 */

/**
 * Verify LINE webhook signature using HMAC-SHA256.
 * @param rawBody - Raw request body string
 * @param signature - X-Line-Signature header value
 * @param channelSecret - LINE Channel Secret
 * @returns true if signature is valid
 */
export async function verifySignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
): Promise<boolean> {
  if (!rawBody || !signature || !channelSecret) return false;

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );

    const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));

    // Timing-safe comparison
    if (expected.length !== signature.length) return false;
    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }
    return result === 0;
  } catch (err) {
    console.error("[line-signature] Verification error:", err);
    return false;
  }
}

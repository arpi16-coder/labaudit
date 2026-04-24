import crypto from "crypto";

// AES-256-GCM encryption for document content at rest
// Key is derived from ENCRYPTION_KEY env var (must be 32 bytes / 64 hex chars)
// Falls back to a dev key if not set — ALWAYS set this in production

const DEV_KEY = "labaudit_dev_key_32bytes_padding!!"; // 32 chars for dev only

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY || DEV_KEY;
  // Derive a 32-byte key using SHA-256 so any length input works
  return crypto.createHash("sha256").update(raw).digest();
}

/**
 * Encrypt plaintext with AES-256-GCM.
 * Returns a base64-encoded string: iv(12) + authTag(16) + ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  // Pack: iv (12 bytes) + authTag (16 bytes) + ciphertext
  const packed = Buffer.concat([iv, authTag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt a base64-encoded AES-256-GCM ciphertext string.
 */
export function decrypt(ciphertext: string): string {
  try {
    const key = getKey();
    const packed = Buffer.from(ciphertext, "base64");
    const iv = packed.subarray(0, 12);
    const authTag = packed.subarray(12, 28);
    const encrypted = packed.subarray(28);
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    // If decryption fails (e.g. legacy unencrypted content), return as-is
    return ciphertext;
  }
}

/**
 * Returns true if the string looks like it's already encrypted (valid base64, long enough).
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 40) return false;
  try {
    const buf = Buffer.from(value, "base64");
    return buf.length >= 28; // iv + authTag minimum
  } catch {
    return false;
  }
}

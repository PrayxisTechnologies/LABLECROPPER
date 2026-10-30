/**
 * OTP Storage & Verification Store
 * In-memory high-speed global cache with disk-backed fallback and MongoDB persistent synchronization.
 * Guaranteed to share state across all Next.js API routes (send-otp, verify-otp, resend-otp).
 */

import crypto from "crypto";
import fs from "fs";
import path from "path";
import { getMongoDb } from "./mongodb";
import { OtpType } from "../email/mailer";

export interface OtpRecord {
  email: string;
  otp: string;
  type: OtpType;
  createdAt: Date;
  expiresAt: Date;
  attempts: number;
  resendCount: number;
}

declare global {
  // eslint-disable-next-line no-var
  var _labelflow_otpStore: Map<string, OtpRecord> | undefined;
}

// Global in-memory cache attached to globalThis so all Next.js route chunks share the exact same store
const memoryStore: Map<string, OtpRecord> =
  globalThis._labelflow_otpStore ||
  (globalThis._labelflow_otpStore = new Map<string, OtpRecord>());

// Expiry configuration
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10);
const COOLDOWN_SECONDS = 30; // 30s minimum interval between OTP dispatches
const MAX_RESENDS_PER_WINDOW = 5; // Max 5 resends per 15 min window

function getStoreKey(email: string, type: OtpType): string {
  return `${email.trim().toLowerCase()}#${type}`;
}

function getDiskStorePath(): string {
  const dir = path.join(process.cwd(), "storage");
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch {}
  return path.join(dir, "local_otp_store.json");
}

function readDiskStore(): Record<string, OtpRecord> {
  try {
    const fPath = getDiskStorePath();
    if (fs.existsSync(fPath)) {
      const content = fs.readFileSync(fPath, "utf-8");
      const parsed = JSON.parse(content) || {};
      // Convert date strings back to Date objects
      for (const k of Object.keys(parsed)) {
        if (parsed[k]?.createdAt) parsed[k].createdAt = new Date(parsed[k].createdAt);
        if (parsed[k]?.expiresAt) parsed[k].expiresAt = new Date(parsed[k].expiresAt);
      }
      return parsed;
    }
  } catch {}
  return {};
}

function writeDiskStore(data: Record<string, OtpRecord>): void {
  try {
    const fPath = getDiskStorePath();
    fs.writeFileSync(fPath, JSON.stringify(data, null, 2), "utf-8");
  } catch {}
}

/**
 * Generate cryptographically secure random 6-digit numeric OTP (100000 to 999999)
 */
export function generateSecureOtp(): string {
  const min = 100000;
  const max = 999999;
  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Check rate limits before sending a new OTP or resending.
 */
export function checkRateLimit(
  email: string,
  type: OtpType
): { allowed: boolean; waitSeconds?: number; error?: string } {
  const normalizedEmail = email.trim().toLowerCase();
  const key = getStoreKey(normalizedEmail, type);
  let existing = memoryStore.get(key);

  if (!existing) {
    const disk = readDiskStore();
    existing = disk[key];
    if (existing) {
      memoryStore.set(key, existing);
    }
  }

  if (existing) {
    const elapsedSeconds = Math.floor(
      (Date.now() - new Date(existing.createdAt).getTime()) / 1000
    );

    // 1. Cooldown check: Must wait between dispatches
    if (elapsedSeconds < COOLDOWN_SECONDS) {
      const wait = COOLDOWN_SECONDS - elapsedSeconds;
      return {
        allowed: false,
        waitSeconds: wait,
        error: `Please wait ${wait} second${wait > 1 ? "s" : ""} before requesting a new OTP.`,
      };
    }

    // 2. Max resends check within active expiry window
    if (existing.resendCount >= MAX_RESENDS_PER_WINDOW) {
      const remainingExpiry = Math.max(
        0,
        Math.floor((new Date(existing.expiresAt).getTime() - Date.now()) / 1000)
      );
      if (remainingExpiry > 0) {
        return {
          allowed: false,
          waitSeconds: remainingExpiry,
          error: "Maximum OTP resend limit reached. Please try again after 15 minutes.",
        };
      }
    }
  }

  return { allowed: true };
}

/**
 * Store generated OTP in memory instantly, write to disk cache, and sync to MongoDB without blocking.
 */
export async function saveOtp(
  email: string,
  otp: string,
  type: OtpType
): Promise<OtpRecord> {
  const normalizedEmail = email.trim().toLowerCase();
  const key = getStoreKey(normalizedEmail, type);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000);

  const existing = memoryStore.get(key) || readDiskStore()[key];
  const resendCount = existing ? (existing.resendCount || 0) + 1 : 0;

  const record: OtpRecord = {
    email: normalizedEmail,
    otp: String(otp).trim(),
    type,
    createdAt: now,
    expiresAt,
    attempts: 0,
    resendCount,
  };

  // 1. Save to global in-memory store immediately (<0.1ms)
  memoryStore.set(key, record);
  // Also store with generic email fallback key
  memoryStore.set(`${normalizedEmail}#ANY`, record);

  // 2. Persist to local disk storage
  try {
    const diskData = readDiskStore();
    diskData[key] = record;
    diskData[`${normalizedEmail}#ANY`] = record;
    writeDiskStore(diskData);
  } catch {}

  // 3. Persistent sync to MongoDB (fast-race with fallback)
  getMongoDb()
    .then(async (db) => {
      if (db) {
        await db.collection("email_otps").updateOne(
          { email: normalizedEmail, type },
          {
            $set: {
              email: normalizedEmail,
              otp: String(otp).trim(),
              type,
              createdAt: now,
              expiresAt,
              attempts: 0,
              resendCount,
            },
          },
          { upsert: true }
        );
      }
    })
    .catch((err) => {
      console.warn("MongoDB OTP sync background warning:", err?.message || err);
    });

  return record;
}

/**
 * Verify OTP: validates existence, expiry, match, and removes on success (anti-replay).
 */
export async function verifyOtp(
  email: string,
  otp: string,
  type: OtpType
): Promise<{ success: boolean; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const cleanOtp = String(otp || "").trim().replace(/\s+/g, "");
  const key = getStoreKey(normalizedEmail, type);

  // 1. Check global in-memory store first (exact key or ANY key for this email)
  let record = memoryStore.get(key) || memoryStore.get(`${normalizedEmail}#ANY`);

  // 2. Check local disk fallback if memory didn't have it
  if (!record) {
    const disk = readDiskStore();
    record = disk[key] || disk[`${normalizedEmail}#ANY`];
    if (record) {
      memoryStore.set(key, record);
    }
  }

  // 3. Fallback to MongoDB check if not found locally
  if (!record) {
    try {
      const db = await getMongoDb();
      if (db) {
        let doc = await db.collection("email_otps").findOne({
          email: normalizedEmail,
          type,
        });
        if (!doc) {
          doc = await db.collection("email_otps").findOne({
            email: normalizedEmail,
          });
        }
        if (doc) {
          record = {
            email: doc.email,
            otp: String(doc.otp),
            type: doc.type,
            createdAt: new Date(doc.createdAt),
            expiresAt: new Date(doc.expiresAt),
            attempts: doc.attempts || 0,
            resendCount: doc.resendCount || 0,
          };
          memoryStore.set(key, record);
        }
      }
    } catch {
      // ignore
    }
  }

  if (!record) {
    return {
      success: false,
      error: "No active verification code found for this email. Please request a new OTP.",
    };
  }

  // 4. Expiration Check
  if (Date.now() > new Date(record.expiresAt).getTime()) {
    deleteOtp(normalizedEmail, type);
    return {
      success: false,
      error: "Verification code has expired (10 minutes limit). Please request a new OTP.",
    };
  }

  // 5. Max verification attempts check (Prevent brute forcing)
  if (record.attempts >= 5) {
    deleteOtp(normalizedEmail, type);
    return {
      success: false,
      error: "Too many incorrect attempts. This OTP has been invalidated for your security.",
    };
  }

  // 6. Match Verification
  if (String(record.otp).trim() !== cleanOtp) {
    record.attempts += 1;
    // Update attempts on disk
    try {
      const diskData = readDiskStore();
      if (diskData[key]) {
        diskData[key].attempts = record.attempts;
        writeDiskStore(diskData);
      }
    } catch {}

    return {
      success: false,
      error: "Incorrect verification code. Please check and try again.",
    };
  }

  // 7. Single-Use Consumption: Delete OTP to prevent replay attacks
  deleteOtp(normalizedEmail, type);

  return { success: true };
}

/**
 * Delete consumed or expired OTP from memory, disk, and MongoDB.
 */
export function deleteOtp(email: string, type: OtpType): void {
  const normalizedEmail = email.trim().toLowerCase();
  const key = getStoreKey(normalizedEmail, type);
  memoryStore.delete(key);
  memoryStore.delete(`${normalizedEmail}#ANY`);

  // Delete from disk
  try {
    const diskData = readDiskStore();
    delete diskData[key];
    delete diskData[`${normalizedEmail}#ANY`];
    writeDiskStore(diskData);
  } catch {}

  // Delete in background from MongoDB
  getMongoDb()
    .then((db) => {
      if (db) {
        db.collection("email_otps")
          .deleteMany({ email: normalizedEmail })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

/**
 * OTP Storage & Verification Store
 * In-memory high-speed cache with non-blocking MongoDB persistent synchronization.
 */

import crypto from "crypto";
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

// In-memory cache for ultra-fast lookup and rate-limiting
const memoryStore = new Map<string, OtpRecord>();

// Expiry configuration
const OTP_EXPIRY_MINUTES = parseInt(process.env.OTP_EXPIRY_MINUTES || "10", 10);
const COOLDOWN_SECONDS = 30; // 30s minimum interval between OTP dispatches
const MAX_RESENDS_PER_WINDOW = 5; // Max 5 resends per 15 min window

function getStoreKey(email: string, type: OtpType): string {
  return `${email.trim().toLowerCase()}#${type}`;
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
  const key = getStoreKey(email, type);
  const existing = memoryStore.get(key);

  if (existing) {
    const elapsedSeconds = Math.floor(
      (Date.now() - existing.createdAt.getTime()) / 1000
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
        Math.floor((existing.expiresAt.getTime() - Date.now()) / 1000)
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
 * Store generated OTP in memory instantly and sync to MongoDB in background without blocking.
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

  const existing = memoryStore.get(key);
  const resendCount = existing ? existing.resendCount + 1 : 0;

  const record: OtpRecord = {
    email: normalizedEmail,
    otp,
    type,
    createdAt: now,
    expiresAt,
    attempts: 0,
    resendCount,
  };

  // 1. Save to in-memory map immediately (<1ms)
  memoryStore.set(key, record);

  // 2. Non-blocking background sync to MongoDB (if cluster reachable)
  getMongoDb()
    .then(async (db) => {
      if (db) {
        await db.collection("email_otps").updateOne(
          { email: normalizedEmail, type },
          {
            $set: {
              email: normalizedEmail,
              otp,
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
  const cleanOtp = otp.trim();
  const key = getStoreKey(normalizedEmail, type);

  // 1. Check in-memory store first
  let record = memoryStore.get(key);

  // 2. Fallback to MongoDB check if not found in memory (e.g. server restart)
  if (!record) {
    try {
      const db = await getMongoDb();
      if (db) {
        const doc = await db.collection("email_otps").findOne({
          email: normalizedEmail,
          type,
        });
        if (doc) {
          record = {
            email: doc.email,
            otp: doc.otp,
            type: doc.type,
            createdAt: doc.createdAt,
            expiresAt: doc.expiresAt,
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

  // 3. Expiration Check
  if (Date.now() > record.expiresAt.getTime()) {
    deleteOtp(normalizedEmail, type);
    return {
      success: false,
      error: "Verification code has expired (10 minutes limit). Please request a new OTP.",
    };
  }

  // 4. Max verification attempts check (Prevent brute forcing)
  if (record.attempts >= 5) {
    deleteOtp(normalizedEmail, type);
    return {
      success: false,
      error: "Too many incorrect attempts. This OTP has been invalidated for your security.",
    };
  }

  // 5. Match Verification
  if (record.otp !== cleanOtp) {
    record.attempts += 1;
    return {
      success: false,
      error: "Incorrect verification code. Please check and try again.",
    };
  }

  // 6. Single-Use Consumption: Delete OTP to prevent replay attacks
  deleteOtp(normalizedEmail, type);

  return { success: true };
}

/**
 * Delete consumed or expired OTP from memory and MongoDB.
 */
export function deleteOtp(email: string, type: OtpType): void {
  const normalizedEmail = email.trim().toLowerCase();
  const key = getStoreKey(normalizedEmail, type);
  memoryStore.delete(key);

  // Non-blocking delete in background
  getMongoDb()
    .then((db) => {
      if (db) {
        db.collection("email_otps")
          .deleteOne({ email: normalizedEmail, type })
          .catch(() => {});
      }
    })
    .catch(() => {});
}

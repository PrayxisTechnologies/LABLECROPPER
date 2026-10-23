import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/db/otpStore";
import { getApiBaseUrl } from "@/lib/api";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp, newPassword } = body;

    if (!email || !otp || !newPassword) {
      return NextResponse.json(
        { error: "Email, OTP, and new password are required." },
        { status: 400 }
      );
    }

    if (typeof newPassword !== "string" || newPassword.length < 6) {
      return NextResponse.json(
        { error: "New password must be at least 6 characters long." },
        { status: 400 }
      );
    }

    // 1. Verify OTP
    const verifyResult = await verifyOtp(email, String(otp), "RESET_PASSWORD");
    if (!verifyResult.success) {
      return NextResponse.json(
        { error: verifyResult.error || "Invalid or expired verification code." },
        { status: 400 }
      );
    }

    // 2. Delegate to backend /auth/reset-password
    const baseUrl = getApiBaseUrl();
    const res = await fetch(`${baseUrl}/auth/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: email.trim().toLowerCase(),
        new_password: newPassword,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return NextResponse.json(
        { error: err.detail || "Failed to update password." },
        { status: res.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now log in.",
    });
  } catch (err: unknown) {
    console.error("reset-password error:", err);
    return NextResponse.json(
      { error: "Internal server error while resetting password." },
      { status: 500 }
    );
  }
}

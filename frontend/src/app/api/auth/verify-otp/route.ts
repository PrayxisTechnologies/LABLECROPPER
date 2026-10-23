import { NextRequest, NextResponse } from "next/server";
import { verifyOtp } from "@/lib/db/otpStore";
import { OtpType } from "@/lib/email/mailer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, otp, type = "SIGNUP" } = body;

    if (!email || !otp) {
      return NextResponse.json(
        { error: "Email and 6-digit OTP are required." },
        { status: 400 }
      );
    }

    const validTypes: OtpType[] = ["SIGNUP", "LOGIN", "RESET_PASSWORD"];
    const otpType: OtpType = validTypes.includes(type) ? type : "SIGNUP";

    const result = await verifyOtp(email, String(otp), otpType);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Invalid or expired verification code." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Email verified successfully.",
    });
  } catch (err: unknown) {
    console.error("verify-otp error:", err);
    return NextResponse.json(
      { error: "Internal server error during verification." },
      { status: 500 }
    );
  }
}

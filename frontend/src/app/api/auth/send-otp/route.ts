import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, generateSecureOtp, saveOtp } from "@/lib/db/otpStore";
import { OtpType, sendOtpEmail } from "@/lib/email/mailer";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, type = "SIGNUP", name } = body;

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return NextResponse.json(
        { error: "A valid email address is required." },
        { status: 400 }
      );
    }

    const validTypes: OtpType[] = ["SIGNUP", "LOGIN", "RESET_PASSWORD"];
    const otpType: OtpType = validTypes.includes(type) ? type : "SIGNUP";

    // Rate limit check
    const rateCheck = checkRateLimit(email, otpType);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        {
          error: rateCheck.error,
          waitSeconds: rateCheck.waitSeconds,
        },
        { status: 429 }
      );
    }

    // 1. Generate and persist secure 6-digit OTP instantly in memory (<1ms)
    const otp = generateSecureOtp();
    await saveOtp(email, otp, otpType);

    // 2. Dispatch email with fast-pass race (responds in <= 1s for instant modal opening)
    const emailPromise = sendOtpEmail({
      email,
      otp,
      type: otpType,
      name,
    });

    const timeoutPromise = new Promise<{ isFastPass: true }>((resolve) =>
      setTimeout(() => resolve({ isFastPass: true }), 1000)
    );

    const winner = await Promise.race([emailPromise, timeoutPromise]);

    if ("isFastPass" in winner) {
      // Keep email dispatch active in background
      emailPromise.catch((err) => {
        console.error("[Mailer Background Error]:", err);
      });

      return NextResponse.json({
        success: true,
        message: `Verification code sent to ${email}.`,
        expiryMinutes: 10,
      });
    }

    if (!winner.success) {
      return NextResponse.json(
        {
          error:
            winner.error || "Failed to deliver verification code. Please check SMTP credentials.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${email}.`,
      expiryMinutes: 10,
    });
  } catch (err: unknown) {
    console.error("send-otp error:", err);
    return NextResponse.json(
      { error: "Internal server error while dispatching OTP." },
      { status: 500 }
    );
  }
}

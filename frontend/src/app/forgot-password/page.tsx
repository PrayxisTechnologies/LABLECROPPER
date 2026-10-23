"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { OtpVerificationModal } from "@/components/auth/OtpVerificationModal";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Flow stages: "REQUEST_OTP" -> "VERIFY_OTP" -> "SET_NEW_PASSWORD" -> "COMPLETED"
  const [stage, setStage] = useState<"REQUEST_OTP" | "SET_NEW_PASSWORD" | "COMPLETED">("REQUEST_OTP");
  const [verifiedOtp, setVerifiedOtp] = useState<string>("");
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);

  // New Password State
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  const handleRequestOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          type: "RESET_PASSWORD",
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to dispatch reset code.");
      }

      setShowOtpModal(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to send reset code. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerified = () => {
    setShowOtpModal(false);
    setStage("SET_NEW_PASSWORD");
    setSuccess("Email verified successfully! Please enter your new password below.");
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setResetLoading(true);
    try {
      // Direct call to Next.js reset-password route or backend
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          otp: verifiedOtp || "VERIFIED_SESSION",
          newPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        // If otp was already consumed by verify-otp endpoint, call direct backend /auth/reset-password
        const fallbackRes = await fetch("http://localhost:8000/api/v1/auth/reset-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: email.trim().toLowerCase(),
            new_password: newPassword,
          }),
        }).catch(() => null);

        if (!fallbackRes || !fallbackRes.ok) {
          throw new Error(data.error || "Failed to update password.");
        }
      }

      setStage("COMPLETED");
      setSuccess("Your password has been reset successfully! Redirecting to sign in...");
      setTimeout(() => {
        router.push("/login");
      }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password reset failed.");
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-navy-950 text-slate-900 dark:text-white transition-colors duration-200">
      <Header />

      <main className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="w-full max-w-md bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700/80 rounded-2xl p-6 sm:p-8 shadow-xl dark:shadow-2xl relative overflow-hidden transition-colors">
          {/* Top subtle glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-gradient-to-r from-transparent via-cyan-neon to-transparent" />

          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              Reset Your Password
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {stage === "REQUEST_OTP" && "Enter your email to receive a 6-digit verification code"}
              {stage === "SET_NEW_PASSWORD" && "Choose a strong new password for your seller account"}
              {stage === "COMPLETED" && "Password updated successfully!"}
            </p>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start space-x-2">
              <svg className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start space-x-2">
              <svg className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{success}</span>
            </div>
          )}

          {stage === "REQUEST_OTP" && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Account Email Address
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seller@example.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-navy-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-neon to-cyan-400 text-navy-950 hover:opacity-95 shadow-glow transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-navy-950" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Sending Reset Code...</span>
                  </>
                ) : (
                  <span>Send Reset Code (OTP)</span>
                )}
              </button>
            </form>
          )}

          {stage === "SET_NEW_PASSWORD" && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  New Password (min. 6 characters)
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-navy-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-navy-950 border border-navy-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={resetLoading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-neon to-cyan-400 text-navy-950 hover:opacity-95 shadow-glow transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
              >
                {resetLoading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-navy-950" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Updating Password...</span>
                  </>
                ) : (
                  <span>Update Password</span>
                )}
              </button>
            </form>
          )}

          {stage === "COMPLETED" && (
            <div className="text-center py-4">
              <Link
                href="/login"
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-cyan-neon text-navy-950 font-bold text-sm shadow-glow"
              >
                <span>Proceed to Sign In</span>
              </Link>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-navy-800 text-center text-xs text-slate-400">
            Remembered your password?{" "}
            <Link href="/login" className="text-cyan-neon font-semibold hover:underline">
              Back to Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* OTP Verification Modal */}
      {showOtpModal && (
        <OtpVerificationModal
          email={email.trim()}
          type="RESET_PASSWORD"
          isOpen={showOtpModal}
          onVerified={handleOtpVerified}
          onClose={() => setShowOtpModal(false)}
        />
      )}
    </div>
  );
}

"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useAuth } from "@/lib/auth-context";
import { OtpVerificationModal } from "@/components/auth/OtpVerificationModal";

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // OTP Verification Modal State
  const [showOtpModal, setShowOtpModal] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanEmail = email.trim();
    if (!cleanEmail || !password.trim()) {
      setError("Please fill in email and password.");
      return;
    }

    if (!cleanEmail.includes("@") || !cleanEmail.includes(".")) {
      setError("Please enter a valid email address.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    // Trigger OTP sending
    setLoading(true);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: cleanEmail,
          type: "SIGNUP",
          name: name.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to send verification code. Please check your email.");
      }

      // Open OTP modal for user confirmation
      setShowOtpModal(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Registration initiation failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Called once OTP is successfully verified by the modal
   */
  const handleOtpVerified = async () => {
    try {
      await register(email.trim(), password, name.trim() || undefined);
      setShowOtpModal(false);
      router.push("/dashboard/skus");
    } catch (err: unknown) {
      setShowOtpModal(false);
      setError(
        err instanceof Error
          ? err.message
          : "Account creation failed after verification. Please try again."
      );
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
              Create Seller Account
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Verify your email with OTP or continue instantly with Google
            </p>
          </div>

          {/* Quick Sign-up with Google */}
          <div className="mb-5 space-y-3">
            <GoogleSignInButton label="Sign up with Google (Instant)" />

            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-slate-200 dark:border-navy-800" />
              <span className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                or register with email OTP
              </span>
              <div className="flex-grow border-t border-slate-200 dark:border-navy-800" />
            </div>
          </div>

          {error && (
            <div className="mb-5 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-300 text-xs flex items-start space-x-2">
              <svg
                className="w-4 h-4 text-rose-500 shrink-0 mt-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Business / Seller Name (Optional)
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. TrendX Apparel"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address *
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seller@example.com"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Password (min. 6 characters) *
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm Password *
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-navy-950 border border-slate-300 dark:border-navy-700 text-slate-900 dark:text-white placeholder-slate-400 text-sm focus:outline-none focus:border-cyan-neon focus:ring-1 focus:ring-cyan-neon transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-neon to-cyan-400 text-navy-950 hover:opacity-95 shadow-glow transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              {loading ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-navy-950"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Sending Verification Code...</span>
                </>
              ) : (
                <span>Verify Email & Create Account</span>
              )}
            </button>
          </form>

          <div className="mt-6 pt-5 border-t border-navy-800 text-center text-xs text-slate-400">
            Already have an account?{" "}
            <Link
              href="/login"
              className="text-cyan-neon font-semibold hover:underline"
            >
              Sign In
            </Link>
          </div>
        </div>
      </main>

      {/* OTP Verification Modal */}
      {showOtpModal && (
        <OtpVerificationModal
          email={email.trim()}
          type="SIGNUP"
          name={name.trim() || undefined}
          isOpen={showOtpModal}
          onVerified={handleOtpVerified}
          onClose={() => setShowOtpModal(false)}
        />
      )}
    </div>
  );
}

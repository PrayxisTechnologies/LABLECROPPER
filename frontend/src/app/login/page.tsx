"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/Header";
import { GoogleSignInButton } from "@/components/GoogleSignInButton";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password.trim()) {
      setError("Please fill in both email and password.");
      return;
    }

    setLoading(true);
    try {
      await login(email.trim(), password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Sign-in failed. Please check your credentials."
      );
    } finally {
      setLoading(false);
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
              Seller Sign In
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Access your Personal SKU Database & Google Drive Linked History
            </p>
          </div>

          {/* Google Sign-in & Drive Storage Quick Action */}
          <div className="mb-5 space-y-3">
            <GoogleSignInButton label="Sign in with Google" />

            <div className="flex items-center justify-center space-x-2 px-3 py-2 rounded-xl bg-cyan-neon/10 border border-cyan-neon/20 text-[11px] text-cyan-600 dark:text-cyan-neon font-medium">
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
              </svg>
              <span>Auto-links Google Drive for 100% free history backup!</span>
            </div>

            <div className="flex items-center my-4">
              <div className="flex-grow border-t border-slate-200 dark:border-navy-800" />
              <span className="px-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                or sign in with email
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
                Email Address
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
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-[11px] text-cyan-600 dark:text-cyan-neon hover:underline font-medium"
                >
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* Highlighted "Register First" Callout for Unregistered Sellers */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-navy-800 text-center space-y-2.5">
            <div className="p-3.5 rounded-xl bg-cyan-50 dark:bg-cyan-neon/10 border border-cyan-200 dark:border-cyan-neon/30 text-center space-y-2.5">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                Agar aapne abhi tak account nahi banaya hai, toh pehle Register karein:
              </p>
              <Link
                href="/register"
                className="inline-flex items-center justify-center w-full py-2.5 px-4 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-cyan-neon via-cyan-400 to-purple-brand text-navy-950 hover:brightness-110 shadow-glow transition-all active:scale-[0.98]"
              >
                <span>Naya Account Banayein (Register Now) ➔</span>
              </Link>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Personal SKU Database aur personalized shipping label features ke liye registration free hai.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

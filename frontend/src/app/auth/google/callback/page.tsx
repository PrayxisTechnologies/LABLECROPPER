"use client";

import React, { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/Header";
import { apiLinkGoogleDrive } from "@/lib/api-auth";
import { useAuth } from "@/lib/auth-context";

function GoogleCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loginWithGoogle, refreshUser } = useAuth();

  const [statusText, setStatusText] = useState("Connecting to Google Services...");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      setError(`Google authorization was cancelled: ${errorParam}`);
      return;
    }

    if (!code) {
      setError("No authorization code was received from Google.");
      return;
    }

    async function handleAuth() {
      const redirectUri = `${window.location.origin}/auth/google/callback`;

      try {
        setStatusText("Exchanging security tokens with Google...");

        // If user is already logged in, this is a "Link Google Drive" action
        if (user) {
          setStatusText("Linking Google Drive storage to your account...");
          await apiLinkGoogleDrive(code, redirectUri);
          await refreshUser();
          router.replace("/dashboard/history?drive=connected");
          return;
        }

        // If user is not logged in, this is a Google Sign In / Sign Up
        setStatusText("Signing in & linking your Google Drive...");
        await loginWithGoogle({
          code,
          redirect_uri: redirectUri,
          link_drive: true,
        });
        router.replace("/dashboard/history?drive=connected");
      } catch (err: unknown) {
        console.error("Google Callback error:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to authenticate with Google. Please try again."
        );
      }
    }

    handleAuth();
  }, [searchParams, user]);

  return (
    <div className="w-full max-w-md bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 rounded-2xl p-8 shadow-xl text-center">
      {error ? (
        <div className="space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 flex items-center justify-center mx-auto">
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            Google Connection Failed
          </h2>
          <p className="text-xs text-rose-500 dark:text-rose-400 bg-rose-500/5 p-3 rounded-xl border border-rose-500/20">
            {error}
          </p>
          <div className="pt-2 flex justify-center space-x-3">
            <button
              onClick={() => router.push("/login")}
              className="px-4 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:bg-cyan-400"
            >
              Back to Sign In
            </button>
            <button
              onClick={() => router.push("/dashboard/history")}
              className="px-4 py-2 rounded-xl bg-navy-800 text-slate-200 font-semibold text-xs border border-navy-700"
            >
              Go to History
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="relative w-14 h-14 mx-auto">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-neon via-purple-brand to-cyan-400 animate-spin" />
            <div className="absolute inset-1 rounded-xl bg-white dark:bg-navy-900 flex items-center justify-center">
              <svg className="w-6 h-6 text-cyan-neon" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
              </svg>
            </div>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white">
            Google Authentication
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 animate-pulse">
            {statusText}
          </p>
        </div>
      )}
    </div>
  );
}

export default function GoogleCallbackPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-navy-950 text-slate-900 dark:text-white">
      <Header />
      <main className="flex-1 flex items-center justify-center p-4">
        <Suspense
          fallback={
            <div className="w-full max-w-md bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 rounded-2xl p-8 shadow-xl text-center">
              <div className="w-10 h-10 border-2 border-cyan-neon border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-xs text-slate-400">Loading Google Services...</p>
            </div>
          }
        >
          <GoogleCallbackContent />
        </Suspense>
      </main>
    </div>
  );
}

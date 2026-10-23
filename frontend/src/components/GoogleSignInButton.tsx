"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { apiGetGoogleDriveConnectUrl } from "@/lib/api-auth";
import { useAuth } from "@/lib/auth-context";

interface GoogleSignInButtonProps {
  label?: string;
  mode?: "login" | "link_drive";
  onSuccess?: () => void;
  className?: string;
}

export const GoogleSignInButton: React.FC<GoogleSignInButtonProps> = ({
  label,
  mode = "login",
  onSuccess,
  className = "",
}) => {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [showConfigNotice, setShowConfigNotice] = useState(false);

  const defaultLabel =
    mode === "link_drive"
      ? "Connect Google Drive Storage"
      : "Continue with Google";

  const handleClick = async () => {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/auth/google/callback`;
      const res = await apiGetGoogleDriveConnectUrl(redirectUri).catch(() => null);

      if (res?.url && res.client_configured) {
        // Redirect to Google's official OAuth consent screen
        window.location.href = res.url;
        return;
      }

      // Check if frontend has NEXT_PUBLIC_GOOGLE_CLIENT_ID
      const publicClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      if (publicClientId) {
        const scopes = [
          "openid",
          "https://www.googleapis.com/auth/userinfo.email",
          "https://www.googleapis.com/auth/userinfo.profile",
          "https://www.googleapis.com/auth/drive.file",
        ].join(" ");

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${encodeURIComponent(
          publicClientId
        )}&redirect_uri=${encodeURIComponent(
          redirectUri
        )}&response_type=code&scope=${encodeURIComponent(
          scopes
        )}&access_type=offline&prompt=consent`;

        window.location.href = authUrl;
        return;
      }

      // If client ID is not configured yet, show helpful setup modal
      setShowConfigNotice(true);
    } catch (err) {
      console.error("Google Auth error:", err);
      setShowConfigNotice(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className={`w-full flex items-center justify-center space-x-3 py-2.5 px-4 rounded-xl border border-slate-300 dark:border-navy-700 bg-white dark:bg-navy-800/80 hover:bg-slate-50 dark:hover:bg-navy-700/80 text-slate-700 dark:text-slate-200 font-semibold text-xs transition-all shadow-sm active:scale-98 disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        {/* Official Google G Logo */}
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>{loading ? "Connecting to Google..." : label || defaultLabel}</span>
      </button>

      {/* Helpful Configuration Notice Modal if Google Client ID is pending in .env */}
      {showConfigNotice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-950/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white dark:bg-navy-900 border border-slate-200 dark:border-navy-700 rounded-2xl p-6 shadow-2xl relative text-left">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-cyan-neon/15 text-cyan-neon flex items-center justify-center shrink-0">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Google OAuth Configuration
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Google Cloud Console Client ID Required
                </p>
              </div>
            </div>

            <div className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300 leading-relaxed bg-slate-50 dark:bg-navy-950 p-3.5 rounded-xl border border-slate-200 dark:border-navy-800">
              <p>
                Google Login aur Drive linking backend me 100% active aur configured hai! Real Google account connect karne ke liye apne <code className="text-cyan-neon font-mono">backend/.env</code> me Google Client ID & Secret paste karein:
              </p>
              <div className="font-mono text-[11px] p-2 rounded bg-navy-900 text-cyan-neon border border-navy-700 space-y-1">
                <div>GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"</div>
                <div>GOOGLE_CLIENT_SECRET="GOCSPX-your-secret"</div>
              </div>
              <p className="text-[11px] text-slate-400">
                Yeh credentials <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-cyan-neon hover:underline">Google Cloud Console</a> se 1 minute me generate ho jate hain.
              </p>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowConfigNotice(false)}
                className="px-4 py-2 rounded-xl bg-cyan-neon text-navy-950 font-bold text-xs shadow-glow hover:bg-cyan-400"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

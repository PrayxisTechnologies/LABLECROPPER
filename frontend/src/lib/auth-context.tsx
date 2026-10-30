"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  apiClaimLocalHistory,
  apiGetJobHistory,
  apiGetMe,
  apiLogin,
  apiLoginWithGoogle,
  apiLoginWithVerifiedEmail,
  apiLogout,
  apiRegister,
  apiUpdateSettings,
  getStoredToken,
  getStoredUser,
  setStoredToken,
} from "./api-auth";
import { User, UserSettings } from "./types";
import { getLocalProcessingHistory, syncServerJobsToLocalHistory } from "./localHistory";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithVerifiedEmail: (email: string, name?: string) => Promise<void>;
  loginWithGoogle: (data: { credential?: string; code?: string; redirect_uri?: string; link_drive?: boolean }) => Promise<void>;
  register: (email: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateSettings: (settings: Partial<UserSettings>) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const claimAndSyncHistory = async () => {
    try {
      const localItems = getLocalProcessingHistory();
      const jobIds = localItems.map((i) => i.job_id).filter(Boolean);
      if (jobIds.length > 0) {
        await apiClaimLocalHistory(jobIds);
      }
      const historyRes = await apiGetJobHistory(1, 20);
      if (historyRes && Array.isArray(historyRes.items)) {
        syncServerJobsToLocalHistory(historyRes.items);
      }
    } catch {
      // Non-blocking background sync
    }
  };

  const refreshUser = async () => {
    try {
      const currentUser = await apiGetMe();
      if (currentUser) {
        setUser(currentUser);
        claimAndSyncHistory();
      } else if (!getStoredToken()) {
        setUser(null);
      }
    } catch {
      // Retain cached user on transient network disconnects
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const token = getStoredToken();
    const cached = getStoredUser();
    if (cached) {
      setUser(cached);
    }
    if (token) {
      refreshUser();
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await apiLogin(email, password);
      setUser(res.user);
      claimAndSyncHistory();
    } finally {
      setLoading(false);
    }
  };

  const loginWithVerifiedEmail = async (email: string, name?: string) => {
    setLoading(true);
    try {
      const res = await apiLoginWithVerifiedEmail(email, name);
      setUser(res.user);
      claimAndSyncHistory();
    } finally {
      setLoading(false);
    }
  };

  const loginWithGoogle = async (data: {
    credential?: string;
    code?: string;
    redirect_uri?: string;
    link_drive?: boolean;
  }) => {
    setLoading(true);
    try {
      const res = await apiLoginWithGoogle(data);
      setUser(res.user);
      claimAndSyncHistory();
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string, name?: string) => {
    setLoading(true);
    try {
      const res = await apiRegister(email, password, name);
      setUser(res.user);
      claimAndSyncHistory();
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await apiLogout();
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (settings: Partial<UserSettings>) => {
    const updated = await apiUpdateSettings(settings);
    setUser(updated);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isAuthenticated: !!user,
        login,
        loginWithVerifiedEmail,
        loginWithGoogle,
        register,
        logout,
        updateSettings,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

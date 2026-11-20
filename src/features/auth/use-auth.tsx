"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: string;
  avatarInitials: string;
}

export const DEMO_USERS: DemoUser[] = [
  {
    id: "user-you",
    name: "Demo user",
    email: "demo@dsai.internal",
    role: "Lead Analytics Engineer",
    avatarInitials: "DU",
  },
  {
    id: "user-anita",
    name: "Anita George",
    email: "anita@dsai.internal",
    role: "Senior Data Scientist",
    avatarInitials: "AG",
  },
  {
    id: "user-yusuf",
    name: "Yusuf K.",
    email: "yusuf@dsai.internal",
    role: "VP of Product",
    avatarInitials: "YK",
  },
];

const AUTH_STORAGE_KEY = "dsai:demo:current-user";

interface AuthContextValue {
  user: DemoUser;
  users: DemoUser[];
  switchUser: (id: string) => void;
  login: (email: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<DemoUser>(DEMO_USERS[0]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (stored) {
      const found = DEMO_USERS.find((u) => u.id === stored);
      if (found) setCurrentUser(found);
    }
  }, []);

  const switchUser = (id: string) => {
    const found = DEMO_USERS.find((u) => u.id === id);
    if (found) {
      setCurrentUser(found);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(AUTH_STORAGE_KEY, found.id);
      }
    }
  };

  const login = (email: string) => {
    const match = DEMO_USERS.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? {
      ...DEMO_USERS[0],
      email,
    };
    setCurrentUser(match);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(AUTH_STORAGE_KEY, match.id);
    }
  };

  const logout = () => {
    setCurrentUser(DEMO_USERS[0]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(AUTH_STORAGE_KEY);
    }
  };

  return (
    <AuthContext.Provider value={{ user: currentUser, users: DEMO_USERS, switchUser, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    return {
      user: DEMO_USERS[0],
      users: DEMO_USERS,
      switchUser: () => {},
      login: () => {},
      logout: () => {},
    };
  }
  return context;
}

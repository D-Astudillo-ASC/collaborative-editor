import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth, useClerk } from '@clerk/clerk-react';

interface AuthContextType {
  isLoaded: boolean;
  isAuthenticated: boolean;
  token: string | null;
  getAccessToken: () => Promise<string | null>;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  isLoaded: false,
  isAuthenticated: false,
  token: null,
  getAccessToken: async () => null,
  login: () => { },
  logout: () => { },
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // PREVIOUS IMPLEMENTATION (commented out):
  // - Stored a custom JWT in localStorage and treated it as "logged in".
  //
  // Reason for change:
  // - Clerk should own auth/session; we only need a short-lived Clerk session JWT to send to our backend.
  //
  // const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  // const [isAuthenticated, setIsAuthenticated] = useState(!!token);
  // useEffect(() => {
  //   if (token) {
  //     localStorage.setItem('token', token);
  //     setIsAuthenticated(true);
  //   } else {
  //     localStorage.removeItem('token');
  //     setIsAuthenticated(false);
  //   }
  // }, [token]);
  // const login = (newToken: string) => setToken(newToken);
  // const logout = () => setToken(null);

  const { isLoaded, isSignedIn, getToken } = useClerkAuth();
  const { signOut } = useClerk();

  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      if (!isLoaded || !isSignedIn) {
        if (!cancelled) setToken(null);
        return;
      }
      const t = await getToken();
      if (!cancelled) setToken(t || null);
    };

    refresh();
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Refreshed the cached token every 60 seconds.
    //
    // Reason for change:
    // - Some session tokens are short-lived; a 60s refresh can allow the cached token to expire.
    // - We still do periodic refresh, but most requests should fetch a fresh token on-demand via `getAccessToken()`.
    // const interval = window.setInterval(refresh, 60_000);
    const interval = window.setInterval(refresh, 20_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [isLoaded, isSignedIn, getToken]);

  // PREVIOUS IMPLEMENTATION (commented out):
  // - Considered the app authenticated only if we had a token string.
  //
  // Reason for change:
  // - With Clerk, "signed in" is the ground-truth for UI gating; the token may be fetched/rotated asynchronously.
  // const isAuthenticated = !!token;
  const isAuthenticated = !!isLoaded && !!isSignedIn;

  const getAccessToken = useMemo(() => {
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Components consumed a cached `token` value, which could be expired by the time a request was made.
    //
    // Reason for change:
    // - Fetch a token on-demand right before API calls / socket connects to avoid using an expired JWT.
    return async () => {
      if (!isLoaded || !isSignedIn) return null;
      const t = await getToken();
      setToken(t || null);
      return t || null;
    };
  }, [isLoaded, isSignedIn, getToken]);

  const login = useMemo(() => {
    // Clerk handles login UI; this is intentionally a no-op.
    return (_newToken: string) => { };
  }, []);

  const logout = useMemo(() => {
    return () => {
      void signOut();
    };
  }, [signOut]);

  return (
    <AuthContext.Provider value={{ isLoaded, isAuthenticated, token, getAccessToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;

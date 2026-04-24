import { useEffect, useMemo, useState } from 'react';
import { useAuth as useClerkAuth, useClerk, useUser } from '@clerk/clerk-react';
import type { User } from '@/types';

export interface UseAuthReturn {
    isLoaded: boolean;
    isAuthenticated: boolean;
    token: string | null;
    user: User | null;
    getAccessToken: () => Promise<string | null>;
    login: (token: string) => void;
    logout: () => void;
}

/**
 * Internal hook that wraps Clerk authentication logic.
 * Handles token management, refresh intervals, and auth state.
 * 
 * Note: Components should use `useAuth` from `AuthContext.tsx` instead,
 * which provides the same API but ensures usage within AuthProvider.
 */
export function useAuthState(): UseAuthReturn {
    const { isLoaded, isSignedIn, getToken } = useClerkAuth();
    const { signOut } = useClerk();
    const { user: clerkUser } = useUser();

    const [token, setToken] = useState<string | null>(null);

    // Convert Clerk user to our User type
    const user: User | null = useMemo(() => {
        if (!clerkUser) return null;

        // Generate a deterministic color based on user ID
        const userId = clerkUser.id;
        const colorIndex = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 8;
        const colors = [
            '#6366f1', // indigo
            '#10b981', // green
            '#f59e0b', // amber
            '#ef4444', // red
            '#8b5cf6', // purple
            '#06b6d4', // cyan
            '#ec4899', // pink
            '#14b8a6', // teal
        ];
        const color = colors[colorIndex];

        return {
            id: clerkUser.id,
            name: clerkUser.fullName || clerkUser.firstName || clerkUser.username || 'User',
            email: clerkUser.primaryEmailAddress?.emailAddress || '',
            imageUrl: clerkUser.imageUrl || undefined,
            color,
        };
    }, [clerkUser]);

    // Token refresh logic: periodically refresh token and on mount
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
        // Refresh token every 20 seconds to keep it fresh
        // Most requests use getAccessToken() for on-demand fresh tokens
        const interval = window.setInterval(refresh, 20_000);
        return () => {
            cancelled = true;
            window.clearInterval(interval);
        };
    }, [isLoaded, isSignedIn, getToken]);

    // Auth state: use Clerk's isSignedIn as ground truth, not token presence
    const isAuthenticated = !!isLoaded && !!isSignedIn;

    // On-demand token fetcher: always gets fresh token for API calls
    const getAccessToken = useMemo(() => {
        return async () => {
            if (!isLoaded || !isSignedIn) return null;
            const t = await getToken();
            setToken(t || null);
            return t || null;
        };
    }, [isLoaded, isSignedIn, getToken]);

    // Login: Clerk handles UI, this is intentionally a no-op
    const login = useMemo(() => {
        return (_newToken: string) => {
            // Clerk handles login UI; this is intentionally a no-op
        };
    }, []);

    // Logout: sign out via Clerk
    const logout = useMemo(() => {
        return () => {
            void signOut();
        };
    }, [signOut]);

    return {
        isLoaded,
        isAuthenticated,
        token,
        user,
        getAccessToken,
        login,
        logout,
    };
}

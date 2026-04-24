import { useState, useCallback } from 'react';
import type { User, AuthState } from '@/types';

// Placeholder hook for Clerk authentication
// Replace the implementation with your Clerk integration

const MOCK_USER: User = {
  id: 'user-1',
  name: 'Demo User',
  email: 'demo@example.com',
  imageUrl: 'https://api.dicebear.com/7.x/avataaars/svg?seed=demo',
  color: '#6366f1',
};

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: true, // Set to true for development
    isLoading: false,
    user: MOCK_USER,
  });

  const signIn = useCallback(async () => {
    console.log('[useAuth] signIn called - integrate with Clerk');
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    // TODO: Replace with Clerk signIn
    // await clerk.signIn()
    
    setTimeout(() => {
      setAuthState({
        isAuthenticated: true,
        isLoading: false,
        user: MOCK_USER,
      });
    }, 500);
  }, []);

  const signOut = useCallback(async () => {
    console.log('[useAuth] signOut called - integrate with Clerk');
    setAuthState(prev => ({ ...prev, isLoading: true }));
    
    // TODO: Replace with Clerk signOut
    // await clerk.signOut()
    
    setTimeout(() => {
      setAuthState({
        isAuthenticated: false,
        isLoading: false,
        user: null,
      });
    }, 500);
  }, []);

  return {
    ...authState,
    signIn,
    signOut,
  };
}

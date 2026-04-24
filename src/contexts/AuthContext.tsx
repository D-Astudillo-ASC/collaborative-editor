import React, { createContext, useContext } from 'react';
import { useAuthState, type UseAuthReturn } from '../hooks/use-auth';

// Re-export the hook type for convenience
export type AuthContextType = UseAuthReturn;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Hook to access auth context. Must be used within AuthProvider.
 * @throws Error if used outside AuthProvider
 */
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * AuthProvider wraps the app and provides authentication state via context.
 * Uses the useAuth hook internally to manage Clerk integration.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const auth = useAuthState();

  return (
    <AuthContext.Provider value={auth}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;

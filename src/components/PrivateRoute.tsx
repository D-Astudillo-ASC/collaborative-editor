import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Box, CircularProgress } from '@mui/material';

interface PrivateRouteProps {
  children: React.ReactNode;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { isLoaded, isAuthenticated } = useAuth();

  // PREVIOUS IMPLEMENTATION (commented out):
  // - Redirected immediately when `isAuthenticated` was false.
  //
  // Reason for change:
  // - Clerk auth state loads asynchronously; during the initial load `isAuthenticated` can be false even for a signed-in user.
  // return isAuthenticated ? <>{children}</> : <Navigate to="/login" />;

  // PREVIOUS IMPLEMENTATION (commented out):
  // - Returned null while loading.
  //
  // Reason for change:
  // - For Option B, we want a clear loader on protected routes while Clerk hydrates.
  // if (!isLoaded) return null;
  if (!isLoaded) {
    return (
      <>
        {/* PREVIOUS IMPLEMENTATION (commented out):
            <Box sx={{ p: 4, display: 'flex', justifyContent: 'center' }}>
              <CircularProgress />
            </Box>

            Reason for change:
            - Center the loader in the middle of the screen (both axes), not just horizontally. */}
        <Box
          sx={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <CircularProgress />
        </Box>
      </>
    );
  }
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

export default PrivateRoute;

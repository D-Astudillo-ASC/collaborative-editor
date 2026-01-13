// PREVIOUS IMPLEMENTATION (commented out):
// - Imported CodeEditor eagerly, which forces Monaco/Yjs into the initial bundle.
//
// Reason for change:
// - Production-grade performance: Monaco is huge; we lazy-load CodeEditor only when the editor route is visited.
//
// import React from 'react';
import React, { Suspense, lazy } from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import Login from './components/Login';
import Dashboard from './components/Dashboard';
import PrivateRoute from './components/PrivateRoute';
import { Box, CircularProgress } from '@mui/material';

// Lazy route component (splits Monaco-heavy editor into a separate chunk).
const CodeEditor = lazy(() => import('./components/CodeEditor'));

function App() {
  return (
    <AuthProvider>
      <Routes>
        {/* PREVIOUS IMPLEMENTATION (commented out):
            <Route path="/login" element={<Login />} />

            Reason for change:
            - Clerk's multi-step SignIn flow uses sub-routes like `/login/factor-one` when `routing="path"`.
            - React Router must match `/login/*` so those nested paths render the same Login page. */}
        <Route path="/login/*" element={<Login />} />
        <Route
          path="/"
          element={
            <PrivateRoute>
              <Dashboard />
            </PrivateRoute>
          }
        />
        <Route
          path="/document/:id"
          element={
            <PrivateRoute>
              {/* PREVIOUS IMPLEMENTATION (commented out):
                  <CodeEditor />

                  Reason for change:
                  - Option B: documents should be accessible only to authenticated users (even when using a share token). */}
              <Suspense
                fallback={
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
                }
              >
                <CodeEditor />
              </Suspense>
            </PrivateRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;

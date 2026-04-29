import React, { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, useNavigate } from "react-router-dom";
import { ClerkProvider } from "@clerk/clerk-react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Landing from "@/pages/Landing";
import Settings from "@/pages/Settings";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/NotFound";
import Dashboard from "@/pages/Dashboard";
import Notifications from "@/pages/Notifications";
import PrivateRoute from "@/components/PrivateRoute";
import { Box, CircularProgress } from "@mui/material";

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as
  | string
  | undefined;
if (!publishableKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY");
}

// ClerkProvider wrapper that integrates with React Router
function ClerkProviderWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <ClerkProvider
      publishableKey={publishableKey as string}
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      {children}
    </ClerkProvider>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000, // 1 minute
      refetchOnWindowFocus: false,
    },
  },
});

// Lazy route component (splits Monaco-heavy editor into a separate chunk).
// const CodeEditor = lazy(() => import('@/components/CodeEditor'));
const CodeEditor = lazy(() => import("@/pages/Editor"));

function AppContent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Tooltip.Provider delayDuration={300} skipDelayDuration={100}>
          <Toaster position="top-right" richColors />
          <AuthProvider>
            <Routes>
              {/* PREVIOUS IMPLEMENTATION (commented out):
            <Route path="/login" element={<Login />} />

            Reason for change:
            - Clerk's multi-step SignIn flow uses sub-routes like `/login/factor-one` when `routing="path"`.
            - React Router must match `/login/*` so those nested paths render the same Login page. */}
              {/* <Route path="/login/*" element={<Login />} /> */}
              <Route
                path="/dashboard"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route
                path="/notifications"
                element={
                  <PrivateRoute>
                    <Notifications />
                  </PrivateRoute>
                }
              />
              <Route path="/login/*" element={<Login />} />
              <Route path="/" element={<Landing />} />
              <Route path="/signup/*" element={<Signup />} />
              <Route
                path="/editor/:id"
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
                            minHeight: "100vh",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
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
              <Route path="/settings" element={<Settings />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </Tooltip.Provider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ClerkProviderWithRouter>
        <AppContent />
      </ClerkProviderWithRouter>
    </BrowserRouter>
  );
}

export default App;

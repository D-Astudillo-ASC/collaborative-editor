import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, useNavigate } from 'react-router-dom'
import { ThemeProvider, createTheme } from '@mui/material/styles'
import CssBaseline from '@mui/material/CssBaseline'
import { ClerkProvider } from '@clerk/clerk-react'
import App from './App'
import './styles/yjs-cursors.css'


const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
})

// PREVIOUS IMPLEMENTATION (commented out):
// - App was wrapped only with MUI ThemeProvider + BrowserRouter.
//
// Reason for change:
// - Clerk should own auth UI + session management; we wrap the app in ClerkProvider so we can fetch session JWTs for backend auth.
//
// ReactDOM.createRoot(document.getElementById('root')!).render(
//   <React.StrictMode>
//     <ThemeProvider theme={theme}>
//       <CssBaseline />
//       <BrowserRouter>
//         <App />
//       </BrowserRouter>
//     </ThemeProvider>
//   </React.StrictMode>,
// )

// PREVIOUS IMPLEMENTATION (commented out):
// - Tried to read `process.env` in the browser.
//
// Reason for change:
// - In Vite, client-side env vars must be read via `import.meta.env`.
// const publishableKey = process.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined

const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined
if (!publishableKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY')
}
const publishableKeyNonNull = publishableKey as string

function ClerkProviderWithRouter({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  return (
    <ClerkProvider
      publishableKey={publishableKeyNonNull}
      // PREVIOUS IMPLEMENTATION (commented out):
      // - ClerkProvider was mounted outside BrowserRouter without routerPush/routerReplace.
      //
      // Reason for change:
      // - Proper Clerk + React Router integration prevents redirect loops and ensures auth navigation uses client routing.
      //
      // <ClerkProvider publishableKey={publishableKey}>...</ClerkProvider>
      routerPush={(to) => navigate(to)}
      routerReplace={(to) => navigate(to, { replace: true })}
      afterSignInUrl="/"
      afterSignUpUrl="/"
    >
      {children}
    </ClerkProvider>
  )
}

// PREVIOUS IMPLEMENTATION (commented out):
// - ClerkProvider wrapped BrowserRouter.
//
// Reason for change:
// - With React Router integration we mount BrowserRouter first, then ClerkProvider can drive navigation via routerPush/routerReplace.
//
// ReactDOM.createRoot(document.getElementById('root')!).render(
//   <React.StrictMode>
//     <ClerkProvider publishableKey={publishableKey}>
//       <ThemeProvider theme={theme}>
//         <CssBaseline />
//         <BrowserRouter>
//           <App />
//         </BrowserRouter>
//       </ThemeProvider>
//     </ClerkProvider>
//   </React.StrictMode>,
// )

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ClerkProviderWithRouter>
        {/* PREVIOUS IMPLEMENTATION (commented out):
            - Gated the entire app behind ClerkLoaded/ClerkLoading.

            Reason for change:
            - Option B: `/login/*` should always render (not gated behind Clerk hydration).
            - We handle auth gating at the route level via `PrivateRoute` for protected pages. */}
        <ThemeProvider theme={theme}>
          <CssBaseline />
          <App />
        </ThemeProvider>
      </ClerkProviderWithRouter>
    </BrowserRouter>
  </React.StrictMode>,
)

import React from 'react';
import { Box, Container, Paper, Typography } from '@mui/material';
import { SignIn, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Navigate } from 'react-router-dom';

const Login: React.FC = () => {
  // PREVIOUS IMPLEMENTATION (commented out):
  // - A custom email/password form that called POST /api/login and stored a local JWT.
  //
  // Reason for change:
  // - Clerk handles login UI and issues a session JWT that the backend verifies via Clerk JWKS.
  //
  // const [email, setEmail] = useState('');
  // const [password, setPassword] = useState('');
  // const navigate = useNavigate();
  // const { login } = useAuth();
  // const handleSubmit = async (e: React.FormEvent) => { ... }

  const { isLoaded, isSignedIn } = useClerkAuth();
  if (isLoaded && isSignedIn) {
    return <Navigate to="/" replace />;
  }

  return (
    <Container component="main" maxWidth="xs">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Paper
          elevation={3}
          sx={{
            padding: 4,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
          }}
        >
          <Box sx={{ mt: 2, width: '100%', display: 'flex', justifyContent: 'center' }}>
            {/* PREVIOUS IMPLEMENTATION (commented out):
                - Rendered <SignIn/> immediately with no loading state.

                Reason for change:
                - If Clerk hasn't finished loading yet, the SignIn UI can appear blank; we show a loading fallback. */}
            {!isLoaded ? (
              <Typography variant="body2" color="text.secondary">
                Loading sign-in…
              </Typography>
            ) : null}
            {/* PREVIOUS IMPLEMENTATION (commented out):
                <SignIn routing="path" path="/login" />

                Reason for change:
                - Explicit post-auth redirect prevents / <-> /login bouncing in some router setups. */}
            {isLoaded ? (
              <SignIn routing="path" path="/login" afterSignInUrl="/" afterSignUpUrl="/" />
            ) : null}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default Login;

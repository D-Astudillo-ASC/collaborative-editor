import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Terminal, ArrowLeft, Check } from 'lucide-react';
import { SignUp, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';

const benefits = [
  'Unlimited public documents',
  'Real-time collaboration',
  'Code execution for 6+ languages',
  'AI-powered suggestions',
];

const Signup = () => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { resolvedTheme } = useTheme();

  // Redirect if already signed in
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  // Clerk appearance configuration matching your custom theme
  const clerkAppearance = {
    theme: 'clerk' as const,
    variables: {
      // Primary colors
      colorPrimary: 'hsl(239, 84%, 67%)',
      colorPrimaryForeground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(0, 0%, 100%)',

      // Background colors
      colorBackground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 12%)' : 'hsl(0, 0%, 100%)',
      colorInputBackground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 20%)' : 'hsl(240, 5.9%, 90%)',
      colorInputText: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',

      // Text colors
      colorText: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',
      colorTextSecondary: resolvedTheme === 'dark' ? 'hsl(0, 0%, 80%)' : 'hsl(240, 3.8%, 46.1%)',
      colorForeground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',
      colorMutedForeground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 80%)' : 'hsl(240, 3.8%, 46.1%)',

      // Social button colors
      colorNeutral: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',
      colorNeutralForeground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',

      colorDanger: 'hsl(0, 84.2%, 60.2%)',
      borderRadius: '0.5rem',
      fontSize: '0.875rem',
      colorBorder: resolvedTheme === 'dark' ? 'hsl(0, 0%, 20%)' : 'hsl(240, 5.9%, 90%)',
    },
    elements: {
      rootBox: 'w-full',
      card: 'shadow-none border-0 bg-transparent',
      headerTitle: 'text-2xl font-bold text-foreground',
      headerSubtitle: 'text-muted-foreground',
      socialButtonsBlockButton: {
        backgroundColor: resolvedTheme === 'dark' ? 'hsl(0, 0%, 14.5%)' : 'hsl(0, 0%, 100%)',
        borderColor: resolvedTheme === 'dark' ? 'hsl(0, 0%, 20%)' : 'hsl(240, 5.9%, 90%)',
        color: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%) !important' : 'hsl(240, 10%, 3.9%) !important',
      },
      socialButtonsBlockButtonText: {
        color: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%) !important' : 'hsl(240, 10%, 3.9%) !important',
      },
      formButtonPrimary: 'bg-primary hover:bg-primary/90 text-primary-foreground',
      formFieldInput: 'bg-input border-border text-foreground placeholder:text-muted-foreground',
      formFieldLabel: 'text-foreground',
      footerActionLink: 'text-primary hover:text-primary/80',
      dividerLine: 'bg-border',
      dividerText: 'text-muted-foreground',
      identityPreviewText: 'text-foreground',
      identityPreviewEditButton: 'text-primary hover:text-primary/80',
    },
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Left - Visual */}
      <div className="hidden lg:flex flex-1 bg-muted/30 flex-col justify-center p-12">
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="max-w-md"
        >
          <div className="flex items-center gap-2 mb-8">
            <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
              <Terminal className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="font-bold text-2xl">CodeSync</span>
          </div>

          <h2 className="text-3xl font-bold mb-4">
            Start building together
          </h2>
          <p className="text-muted-foreground text-lg mb-8">
            Join the community of developers who ship faster with real-time collaboration.
          </p>

          <ul className="space-y-4">
            {benefits.map((benefit, index) => (
              <motion.li
                key={benefit}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + index * 0.1 }}
                className="flex items-center gap-3"
              >
                <div className="h-5 w-5 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="h-3 w-3 text-primary" />
                </div>
                <span className="text-muted-foreground">{benefit}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </div>

      {/* Right - Form */}
      <div className="flex-1 flex flex-col justify-center px-8 md:px-16 lg:px-24">
        <div className="absolute top-4 left-4">
          <Button variant="ghost" size="sm" asChild className="gap-2 text-muted-foreground hover:text-foreground">
            <Link to="/">
              <ArrowLeft className="h-4 w-4" />
              Back to home
            </Link>
          </Button>
        </div>
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm mx-auto"
        >
          {/* Mobile Logo */}
          <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Terminal className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">CodeSync</span>
          </Link>


          {/* Clerk SignUp Component */}
          <div className="clerk-sign-in-wrapper">
            {!isLoaded ? (
              <p className="text-sm text-muted-foreground text-center">Loading sign-up…</p>
            ) : (
              <SignUp
                routing="path"
                path="/signup"
                fallbackRedirectUrl="/dashboard"
                forceRedirectUrl="/dashboard"
                // signUpFallbackRedirectUrl="/dashboard"
                appearance={clerkAppearance}
              />
            )}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-6">
            Already have an account?{' '}
            <Link to="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </p>

          <p className="text-center text-xs text-muted-foreground mt-4">
            By signing up, you agree to our{' '}
            <a href="#" className="underline hover:text-foreground">Terms</a>
            {' '}and{' '}
            <a href="#" className="underline hover:text-foreground">Privacy Policy</a>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default Signup;

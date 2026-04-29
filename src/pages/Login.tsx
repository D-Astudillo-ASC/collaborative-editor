import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';
import { SignIn, useAuth as useClerkAuth } from '@clerk/clerk-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useTheme } from '@/contexts/ThemeContext';

const Login = () => {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { resolvedTheme } = useTheme();

  // Redirect if already signed in
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  // Clerk appearance configuration matching your custom theme
  // Using 'clerk' as base theme and overriding with your custom CSS variable values
  // This is the correct approach when you have custom light/dark themes defined in CSS
  // The variables below map to your CSS custom properties (--primary, --background, etc.)
  const clerkAppearance = {
    theme: 'clerk' as const, // Base theme structure - variables override with your custom theme colors
    variables: {
      // Primary colors
      colorPrimary: 'hsl(239, 84%, 67%)', // Your primary color #6366f1
      colorPrimaryForeground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(0, 0%, 100%)',

      // Background colors
      colorBackground: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 12%)' // --background from dark theme
        : 'hsl(0, 0%, 100%)', // --background from light theme

      // Input colors (using non-deprecated names)
      colorInput: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 14.5%)' // --card from dark theme
        : 'hsl(0, 0%, 100%)', // --card from light theme
      colorInputForeground: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 100%)' // --foreground from dark theme
        : 'hsl(240, 10%, 3.9%)', // --foreground from light theme

      // Text colors (using non-deprecated names)
      colorText: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 100%)'
        : 'hsl(240, 10%, 3.9%)',
      colorTextSecondary: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 80%)' // --muted-foreground from dark theme
        : 'hsl(240, 3.8%, 46.1%)', // --muted-foreground from light theme
      colorForeground: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 100%)'
        : 'hsl(240, 10%, 3.9%)',
      colorMutedForeground: resolvedTheme === 'dark'
        ? 'hsl(0, 0%, 80%)' // --muted-foreground from dark theme
        : 'hsl(240, 3.8%, 46.1%)', // --muted-foreground from light theme

      // Social button colors
      colorNeutral: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',
      colorNeutralForeground: resolvedTheme === 'dark' ? 'hsl(0, 0%, 100%)' : 'hsl(240, 10%, 3.9%)',

      // Danger color
      colorDanger: 'hsl(0, 84.2%, 60.2%)', // --destructive

      // Border and styling
      borderRadius: '0.5rem', // --radius
      colorBorder: resolvedTheme === 'dark' ? 'hsl(0, 0%, 20%)' : 'hsl(240, 5.9%, 90%)',

      // Typography
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      fontSize: '0.875rem',
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
      {/* Left - Form */}
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

          {/* <h1 className="text-2xl font-bold mb-2">Welcome back</h1>
          <p className="text-muted-foreground mb-8">
            Sign in to your account to continue coding
          </p> */}

          {/* Clerk SignIn Component */}
          {isLoaded && (
            <div className="clerk-sign-in-wrapper">
              <SignIn
                routing="path"
                path="/login"
                appearance={clerkAppearance}
                fallbackRedirectUrl="/dashboard"
                forceRedirectUrl="/dashboard"
              />
            </div>
          )}

          {!isLoaded && (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          )}

          <p className="text-center text-sm text-muted-foreground mt-6">
            Don't have an account?{' '}
            <Link to="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </p>
        </motion.div>
      </div>

      {/* Right - Visual */}
      <div className="hidden lg:flex flex-1 bg-muted/30 items-center justify-center p-12">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          className="relative w-full max-w-lg"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 to-transparent rounded-3xl blur-3xl" />
          <div className="relative bg-card border border-border rounded-xl p-6 shadow-2xl">
            <div className="flex items-center gap-2 mb-4">
              <div className="flex gap-1.5">
                <div className="h-3 w-3 rounded-full bg-destructive/70" />
                <div className="h-3 w-3 rounded-full bg-warning/70" />
                <div className="h-3 w-3 rounded-full bg-success/70" />
              </div>
              <span className="text-xs text-muted-foreground font-mono ml-2">collaborative-session</span>
            </div>
            <div className="font-mono text-sm space-y-1 text-muted-foreground">
              <div><span className="text-primary">const</span> team = [<span className="text-warning">"you"</span>, <span className="text-warning">"everyone"</span>];</div>
              <div><span className="text-primary">const</span> project = <span className="text-warning">"amazing-app"</span>;</div>
              <div className="h-4" />
              <div>team.<span className="text-success">forEach</span>((dev) =&gt; {'{'}</div>
              <div className="pl-4">dev.<span className="text-success">code</span>(project);</div>
              <div className="pl-4">dev.<span className="text-success">collaborate</span>();</div>
              <div>{'}'});</div>
              <div className="h-4" />
              <div className="text-success">{'// Ship faster, together 🚀'}</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default Login;

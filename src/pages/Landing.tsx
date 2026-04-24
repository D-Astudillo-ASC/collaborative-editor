// import React from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Code2, Users, Terminal, GitBranch, Play, ArrowRight, Braces, Sparkles } from "lucide-react";
import { useAuth as useClerkAuth } from "@clerk/clerk-react";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";

const features = [
  {
    icon: Code2,
    title: "Monaco Editor",
    description: "VS Code-powered editing with IntelliSense, syntax highlighting, and multi-language support.",
  },
  {
    icon: Users,
    title: "Real-time Collaboration",
    description: "Code together with live cursors, presence indicators, and instant sync.",
  },
  {
    icon: Play,
    title: "Instant Execution",
    description: "Run JavaScript, TypeScript, Python, and more directly in the browser.",
  },
  // {
  //   icon: GitBranch,
  //   title: "Version Control",
  //   description: "Built-in diff viewer and change tracking for seamless collaboration.",
  // },
];

const codeSnippet = `// Real-time collaborative editing
function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

// Run instantly ▶
console.log(fibonacci(10)); // → 55`;

const Landing = () => {
  const navigate = useNavigate();
  const { isLoaded, isSignedIn } = useClerkAuth();

  // Once Clerk has resolved, send authenticated users straight to their dashboard.
  // This prevents the landing page from flashing for users who are already signed in.
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center">
              <Terminal className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">CodeSync</span>
          </div>

          <div className="flex items-center gap-3">
            <ThemeToggle />
            <Button variant="ghost" onClick={() => navigate("/login")}>
              Sign In
            </Button>
            <Button onClick={() => navigate("/signup")}>Get Started</Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-6">
        <div className="container mx-auto max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left - Content */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
                <Sparkles className="h-3.5 w-3.5" />
                Now with AI-powered suggestions
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold leading-tight mb-6">
                Code together, <span className="text-primary">ship faster</span>
              </h1>

              <p className="text-lg text-muted-foreground mb-8 max-w-lg">
                A collaborative code editor built for developers. Real-time editing, instant execution, and seamless
                teamwork — all in your browser.
              </p>

              <div className="flex flex-wrap gap-4">
                <Button size="lg" onClick={() => navigate("/signup")} className="gap-2">
                  Start coding free
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {/* <Button size="lg" variant="outline" onClick={() => navigate("/dashboard")}>
                  View demo
                </Button> */}
              </div>

              <div className="flex items-center gap-6 mt-8 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  No credit card required
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-success" />
                  Free for individuals
                </div>
              </div>
            </motion.div>

            {/* Right - Code Preview */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/5 rounded-2xl blur-3xl" />
              <div className="relative bg-card border border-border rounded-xl overflow-hidden shadow-2xl">
                {/* Editor Header */}
                <div className="flex items-center gap-2 px-4 py-3 bg-muted/50 border-b border-border">
                  <div className="flex gap-1.5">
                    <div className="h-3 w-3 rounded-full bg-destructive/70" />
                    <div className="h-3 w-3 rounded-full bg-warning/70" />
                    <div className="h-3 w-3 rounded-full bg-success/70" />
                  </div>
                  <span className="text-xs text-muted-foreground ml-2 font-mono">fibonacci.ts</span>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex -space-x-2">
                      <div className="h-5 w-5 rounded-full bg-primary border-2 border-card" />
                      <div className="h-5 w-5 rounded-full bg-success border-2 border-card" />
                    </div>
                    <span className="text-xs text-muted-foreground">2 online</span>
                  </div>
                </div>

                {/* Code Content */}
                <div className="p-4 font-mono text-sm relative">
                  <pre className="text-muted-foreground">
                    <code>
                      {codeSnippet.split("\n").map((line, i) => (
                        <div key={i} className="flex">
                          <span className="w-8 text-muted-foreground/50 select-none">{i + 1}</span>
                          <span className={line.includes("//") ? "text-muted-foreground" : "text-foreground"}>
                            {line.includes("function") ? (
                              <>
                                <span className="text-primary">function</span>
                                {line.replace("function", "")}
                              </>
                            ) : line.includes("return") ? (
                              <>
                                {"  "}
                                <span className="text-primary">return</span>
                                {line.replace("  return", "")}
                              </>
                            ) : line.includes("console.log") ? (
                              <>
                                <span className="text-warning">console</span>
                                {line.replace("console", "")}
                              </>
                            ) : (
                              line
                            )}
                          </span>
                        </div>
                      ))}
                    </code>
                  </pre>

                  <motion.div
                    className="absolute bottom-20 right-24 flex items-center gap-1"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 1, duration: 0.3 }}
                  >
                    <div className="h-4 w-0.5 bg-success animate-pulse" />
                    <span className="text-xs bg-success text-success-foreground px-1.5 py-0.5 rounded">Alice</span>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 px-6 bg-muted/30">
        <div className="container mx-auto max-w-6xl">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Everything you need to code</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Professional-grade tools designed for developers who ship fast.
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="p-6 rounded-xl bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 px-6">
        <div className="container mx-auto max-w-4xl text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
          >
            <div className="p-12 rounded-2xl bg-gradient-to-br from-primary/10 via-background to-primary/5 border border-border">
              <Braces className="h-12 w-12 text-primary mx-auto mb-6" />
              <h2 className="text-3xl md:text-4xl font-bold mb-4">Ready to collaborate?</h2>
              <p className="text-muted-foreground text-lg mb-8 max-w-lg mx-auto">
                Join thousands of developers already building together on CodeSync.
              </p>
              <Button size="lg" onClick={() => navigate("/signup")} className="gap-2">
                Get started for free
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 px-6">
        <div className="container mx-auto max-w-6xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded bg-primary flex items-center justify-center">
              <Terminal className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="text-sm text-muted-foreground">© 2026 CodeSync. Built for developers.</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground transition-colors">
              About
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              Docs
            </a>
            <a href="#" className="hover:text-foreground transition-colors">
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Landing;

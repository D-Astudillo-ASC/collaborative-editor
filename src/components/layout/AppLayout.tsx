import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: React.ReactNode;
  sidebar?: React.ReactNode;
  rightPanel?: React.ReactNode;
  topBar?: React.ReactNode;
  showSidebar?: boolean;
  showRightPanel?: boolean;
}

export function AppLayout({
  children,
  sidebar,
  rightPanel,
  topBar,
  showSidebar = true,
  showRightPanel = false,
}: AppLayoutProps) {

  return (
    <div className={cn(
      "flex h-screen w-screen overflow-hidden",
      "bg-background text-foreground"
    )}>
      {/* Left Sidebar */}
      <AnimatePresence mode="wait">
        {showSidebar && sidebar && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 240, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="flex-shrink-0 border-r border-border bg-sidebar overflow-hidden"
          >
            {sidebar}
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar */}
        {topBar && (
          <header className="flex-shrink-0 border-b border-border bg-card/50 backdrop-blur-sm">
            {topBar}
          </header>
        )}

        {/* Content + Right Panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Main Content */}
          <main className="flex-1 overflow-hidden">
            {children}
          </main>

          {/* Right Panel */}
          <AnimatePresence mode="wait">
            {showRightPanel && rightPanel && (
              <motion.aside
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 320, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeInOut' }}
                className="flex-shrink-0 border-l border-border bg-card overflow-hidden"
              >
                {rightPanel}
              </motion.aside>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

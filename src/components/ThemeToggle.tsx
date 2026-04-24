import { useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { toggleTheme, isDark } = useTheme();

  const handleToggle = useCallback(() => {
    const root = document.documentElement;
    
    // Add transitioning class to trigger shimmer and disable per-element transitions
    root.classList.add('theme-transitioning');
    
    // Small delay to let the class apply, then toggle theme
    requestAnimationFrame(() => {
      toggleTheme();
      
      // Re-enable transitions after the shimmer completes
      setTimeout(() => {
        root.classList.remove('theme-transitioning');
      }, 600);
    });
  }, [toggleTheme]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleToggle}
          className={cn("relative overflow-hidden", className)}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isDark ? 'moon' : 'sun'}
              initial={{ y: -20, opacity: 0, rotate: -90 }}
              animate={{ y: 0, opacity: 1, rotate: 0 }}
              exit={{ y: 20, opacity: 0, rotate: 90 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {isDark ? (
                <Moon className="h-4 w-4" />
              ) : (
                <Sun className="h-4 w-4" />
              )}
            </motion.div>
          </AnimatePresence>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      </TooltipContent>
    </Tooltip>
  );
}

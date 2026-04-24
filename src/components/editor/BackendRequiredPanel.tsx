import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server,
  Cloud,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Code2,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { TemplateCategory } from '@/types/execution';

interface BackendRequiredPanelProps {
  category?: TemplateCategory;
  languageName: string;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onEnableCloud?: () => void;
}

const categoryInfo: Record<string, { title: string; description: string; features: string[] }> = {
  'Node.js': {
    title: 'Node.js Execution',
    description: 'This code requires a Node.js runtime environment to execute.',
    features: [
      'Full Node.js API access',
      'npm package support',
      'File system operations',
      'Environment variables',
    ],
  },
  Testing: {
    title: 'Jest Test Runner',
    description: 'This test file requires a Jest test runner environment.',
    features: [
      'Unit & integration tests',
      'Mock functions & spies',
      'Coverage reports',
      'Async test support',
    ],
  },
  default: {
    title: 'Backend Execution',
    description: 'This code requires server-side execution.',
    features: [
      'Secure sandboxed environment',
      'Resource management',
      'Streaming output',
      'Error handling',
    ],
  },
};

export function BackendRequiredPanel({
  category,
  languageName,
  isCollapsed = false,
  onToggleCollapse,
  onEnableCloud,
}: BackendRequiredPanelProps) {
  const info = categoryInfo[category || ''] || categoryInfo.default;

  return (
    <div className="flex h-full flex-col border-t border-border bg-card/50">
      {/* Header */}
      <div className="flex h-9 items-center justify-between border-b border-border bg-muted/30 px-3">
        <div className="flex items-center gap-2">
          {/* Collapse Toggle */}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggleCollapse}
            >
              {isCollapsed ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {/* Status */}
          <div className="flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5 text-purple-500" />
            <span className="text-xs font-medium">Backend Required</span>
          </div>

          {/* Language Badge */}
          <span className="rounded bg-purple-500/10 px-1.5 py-0.5 text-[10px] text-purple-500">
            {languageName}
          </span>
        </div>
      </div>

      {/* Content Area */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <div className="flex h-full items-center justify-center p-6">
              <div className="max-w-md text-center">
                {/* Icon */}
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-purple-500/10">
                  <Server className="h-8 w-8 text-purple-500" />
                </div>

                {/* Title & Description */}
                <h3 className="text-lg font-semibold">{info.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">
                  {info.description}
                </p>

                {/* Features */}
                <div className="mt-4 grid grid-cols-2 gap-2 text-left">
                  {info.features.map((feature, index) => (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs"
                    >
                      <Zap className="h-3 w-3 text-purple-500" />
                      <span>{feature}</span>
                    </div>
                  ))}
                </div>

                {/* CTA */}
                <div className="mt-6 space-y-3">
                  <Button
                    className="w-full gap-2"
                    onClick={onEnableCloud}
                  >
                    <Cloud className="h-4 w-4" />
                    Enable Lovable Cloud
                  </Button>
                  
                  <p className="text-xs text-muted-foreground">
                    Cloud provides secure server-side execution for Node.js, Python, Java, and more.
                  </p>
                </div>

                {/* Alternative */}
                <div className="mt-4 rounded-lg border border-dashed border-border p-3">
                  <div className="flex items-start gap-2 text-left">
                    <Code2 className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-xs font-medium">
                        Use as Reference
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        This code template is ready to be integrated with your existing backend infrastructure.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

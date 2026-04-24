import React, { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Square,
  Trash2,
  Terminal,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  AlertCircle,
  Info,
  ArrowLeft,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { ConsoleOutput } from '@/types/execution';

interface ConsolePanelProps {
  outputs: ConsoleOutput[];
  isRunning: boolean;
  onRun: () => void;
  onStop: () => void;
  onClear: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ConsolePanel({
  outputs,
  isRunning,
  onRun,
  onStop,
  onClear,
  isCollapsed = false,
  onToggleCollapse,
}: ConsolePanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [outputs]);

  const getOutputIcon = (type: ConsoleOutput['type']) => {
    switch (type) {
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      case 'warn':
        return <AlertTriangle className="h-3 w-3 text-yellow-400" />;
      case 'info':
        return <Info className="h-3 w-3 text-blue-400" />;
      case 'result':
        return <ArrowLeft className="h-3 w-3 text-green-400" />;
      default:
        return null;
    }
  };

  const getOutputClass = (type: ConsoleOutput['type']) => {
    switch (type) {
      case 'error':
        return 'text-red-400 bg-red-500/5';
      case 'warn':
        return 'text-yellow-400 bg-yellow-500/5';
      case 'info':
        return 'text-blue-400';
      case 'result':
        return 'text-green-400 bg-green-500/5';
      default:
        return 'text-foreground';
    }
  };

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
            {isRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />
            ) : (
              <Terminal className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium">
              {isRunning ? 'Running...' : 'Console'}
            </span>
          </div>

          {/* Output Count */}
          {outputs.length > 0 && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {outputs.length} {outputs.length === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Run/Stop Button */}
          {isRunning ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-red-500 hover:text-red-600"
                  onClick={onStop}
                >
                  <Square className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Stop Execution</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 text-green-500 hover:text-green-600"
                  onClick={onRun}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Run Code (Ctrl+Enter)</TooltipContent>
            </Tooltip>
          )}

          {/* Clear Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClear}
                disabled={outputs.length === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear Console</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Output Area */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden"
          >
            <ScrollArea className="h-full">
              <div
                ref={scrollRef}
                className="min-h-[120px] p-2 font-mono text-sm"
              >
                {outputs.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Terminal className="mx-auto h-8 w-8 opacity-30" />
                      <p className="mt-2 text-xs">
                        Press Ctrl+Enter or click Run to execute JavaScript
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {outputs.map((output, index) => (
                      <div
                        key={index}
                        className={cn(
                          'flex items-start gap-2 rounded px-2 py-1',
                          getOutputClass(output.type)
                        )}
                      >
                        <span className="mt-0.5 flex-shrink-0">
                          {getOutputIcon(output.type)}
                        </span>
                        <pre className="flex-1 whitespace-pre-wrap break-all text-[13px] leading-relaxed">
                          {output.content}
                        </pre>
                        <span className="flex-shrink-0 text-[10px] text-muted-foreground opacity-50">
                          {formatTime(output.timestamp)}
                        </span>
                      </div>
                    ))}
                    {isRunning && (
                      <div className="flex items-center gap-2 px-2 py-1 text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span className="animate-pulse">_</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

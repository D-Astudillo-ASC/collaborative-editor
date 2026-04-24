import { useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play,
  Square,
  Trash2,
  Terminal,
  Clock,
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { ExecutionStatus, ExecutionResult } from '@/types';

interface ExecutionPanelProps {
  output: string[];
  status: ExecutionStatus;
  result: ExecutionResult | null;
  isRunning: boolean;
  canExecute: boolean;
  onRun: () => void;
  onStop: () => void;
  onClear: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ExecutionPanel({
  output,
  status,
  result,
  isRunning,
  canExecute,
  onRun,
  onStop,
  onClear,
  isCollapsed = false,
  onToggleCollapse,
}: ExecutionPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new output arrives
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [output]);

  const getStatusIcon = () => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-3.5 w-3.5 animate-spin text-yellow-500" />;
      case 'completed':
        return result?.exitCode === 0 ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <XCircle className="h-3.5 w-3.5 text-red-500" />
        );
      case 'error':
        return <XCircle className="h-3.5 w-3.5 text-red-500" />;
      default:
        return <Terminal className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'running':
        return 'Running...';
      case 'completed':
        return result?.exitCode === 0 ? 'Completed' : 'Failed';
      case 'error':
        return 'Error';
      default:
        return 'Ready';
    }
  };

  const formatOutput = (line: string, index: number) => {
    // Detect different output types for styling
    const isError = line.toLowerCase().includes('error') || line.startsWith('!');
    const isWarning = line.toLowerCase().includes('warning');
    const isSuccess = line.includes('completed') || line.includes('success');
    const isSystem = line.startsWith('>') || line.startsWith('[');

    return (
      <div
        key={index}
        className={cn(
          'font-mono text-sm leading-relaxed',
          isError && 'text-red-400',
          isWarning && 'text-yellow-400',
          isSuccess && 'text-green-400',
          isSystem && 'text-muted-foreground',
          !isError && !isWarning && !isSuccess && !isSystem && 'text-foreground'
        )}
      >
        {line || '\u00A0'}
      </div>
    );
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
            {getStatusIcon()}
            <span className="text-xs font-medium">{getStatusText()}</span>
          </div>

          {/* Execution Time */}
          {result && (
            <Badge variant="outline" className="h-5 gap-1 px-1.5 text-[10px]">
              <Clock className="h-2.5 w-2.5" />
              {result.executionTime}ms
            </Badge>
          )}

          {/* Exit Code */}
          {result && status === 'completed' && (
            <Badge
              variant={result.exitCode === 0 ? 'default' : 'destructive'}
              className="h-5 px-1.5 text-[10px]"
            >
              Exit: {result.exitCode}
            </Badge>
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
                  disabled={!canExecute}
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {canExecute ? 'Run Code (Ctrl+Enter)' : 'Language not executable'}
              </TooltipContent>
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
                disabled={output.length === 0}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear Output</TooltipContent>
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
                className="min-h-[120px] p-3 font-mono text-sm"
              >
                {output.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <Terminal className="mx-auto h-8 w-8 opacity-30" />
                      <p className="mt-2 text-xs">
                        {canExecute
                          ? 'Press Ctrl+Enter or click Run to execute code'
                          : 'Select Java or Python to run code'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {output.map((line, index) => formatOutput(line, index))}
                    {isRunning && (
                      <div className="flex items-center gap-2 text-muted-foreground">
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

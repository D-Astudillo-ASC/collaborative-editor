import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileCheck,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  AlertTriangle,
  Info,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { DiagnosticItem, AnalysisResult } from '@/types/execution';

interface AnalysisPanelProps {
  result: AnalysisResult | null;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function AnalysisPanel({
  result,
  isAnalyzing,
  onAnalyze,
  isCollapsed = false,
  onToggleCollapse,
}: AnalysisPanelProps) {
  const getSeverityIcon = (severity: DiagnosticItem['severity']) => {
    switch (severity) {
      case 'error':
        return <AlertCircle className="h-3.5 w-3.5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="h-3.5 w-3.5 text-yellow-500" />;
      case 'info':
        return <Info className="h-3.5 w-3.5 text-blue-500" />;
      case 'hint':
        return <Lightbulb className="h-3.5 w-3.5 text-purple-500" />;
    }
  };

  const getSeverityClass = (severity: DiagnosticItem['severity']) => {
    switch (severity) {
      case 'error':
        return 'border-l-red-500 bg-red-500/5';
      case 'warning':
        return 'border-l-yellow-500 bg-yellow-500/5';
      case 'info':
        return 'border-l-blue-500 bg-blue-500/5';
      case 'hint':
        return 'border-l-purple-500 bg-purple-500/5';
    }
  };

  const errorCount = result?.diagnostics.filter(d => d.severity === 'error').length || 0;
  const warningCount = result?.diagnostics.filter(d => d.severity === 'warning').length || 0;

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
            {result?.isValid ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
            ) : (
              <FileCheck className="h-3.5 w-3.5 text-muted-foreground" />
            )}
            <span className="text-xs font-medium">
              {isAnalyzing ? 'Analyzing...' : 'Type Analysis'}
            </span>
          </div>

          {/* Counts */}
          {result && (
            <div className="flex items-center gap-1">
              {errorCount > 0 && (
                <Badge variant="destructive" className="h-5 px-1.5 text-[10px]">
                  {errorCount} {errorCount === 1 ? 'error' : 'errors'}
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-yellow-500 border-yellow-500/30">
                  {warningCount} {warningCount === 1 ? 'warning' : 'warnings'}
                </Badge>
              )}
              {errorCount === 0 && warningCount === 0 && (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-green-500 border-green-500/30">
                  No issues
                </Badge>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={onAnalyze}
            disabled={isAnalyzing}
          >
            {isAnalyzing ? 'Analyzing...' : 'Re-analyze'}
          </Button>
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
            <ScrollArea className="h-full">
              <div className="min-h-[120px] p-3">
                {!result ? (
                  <div className="flex h-full items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <FileCheck className="mx-auto h-8 w-8 opacity-30" />
                      <p className="mt-2 text-xs">
                        TypeScript type checking and validation
                      </p>
                      <p className="mt-1 text-xs opacity-70">
                        Interfaces and type definitions are analyzed for correctness
                      </p>
                    </div>
                  </div>
                ) : result.diagnostics.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <CheckCircle2 className="mx-auto h-12 w-12 text-green-500 opacity-50" />
                      <p className="mt-3 font-medium text-green-600">
                        All types are valid
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {result.summary}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {/* Summary */}
                    <p className="mb-3 text-sm text-muted-foreground">
                      {result.summary}
                    </p>

                    {/* Diagnostics */}
                    {result.diagnostics.map((diagnostic, index) => (
                      <div
                        key={index}
                        className={cn(
                          'rounded-lg border-l-2 p-3',
                          getSeverityClass(diagnostic.severity)
                        )}
                      >
                        <div className="flex items-start gap-2">
                          {getSeverityIcon(diagnostic.severity)}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium">
                                {diagnostic.message}
                              </span>
                              {diagnostic.code && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px]">
                                  {diagnostic.code}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                              <span>Line {diagnostic.line}:{diagnostic.column}</span>
                              {diagnostic.source && (
                                <>
                                  <span>•</span>
                                  <span>{diagnostic.source}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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

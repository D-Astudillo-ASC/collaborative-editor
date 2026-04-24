import React from 'react';
import { Eye, Terminal, Server, FileCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { LivePreviewPanel } from './LivePreviewPanel';
import { ConsolePanel } from './ConsolePanel';
import { BackendRequiredPanel } from './BackendRequiredPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { ExecutionPanel } from './ExecutionPanel';

import type { ExecutionMode, PreviewState, ConsoleOutput, AnalysisResult, TemplateCategory } from '@/types/execution';
import type { ExecutionStatus, ExecutionResult } from '@/types';

interface UnifiedOutputPanelProps {
  mode: ExecutionMode;
  languageName: string;
  category?: TemplateCategory;

  // Preview mode props
  preview?: PreviewState;
  onRefreshPreview?: () => void;

  // Console mode props
  consoleOutputs?: ConsoleOutput[];
  isConsoleRunning?: boolean;
  onConsoleRun?: () => void;
  onConsoleStop?: () => void;
  onConsoleClear?: () => void;

  // Backend mode (existing terminal) props
  terminalOutput?: string[];
  executionStatus?: ExecutionStatus;
  executionResult?: ExecutionResult | null;
  isRunning?: boolean;
  canExecute?: boolean;
  onRun?: () => void;
  onStop?: () => void;
  onClear?: () => void;

  // Analysis mode props
  analysisResult?: AnalysisResult | null;
  isAnalyzing?: boolean;
  onAnalyze?: () => void;

  // Common props
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onEnableCloud?: () => void;
}

const modeIcons: Record<ExecutionMode, React.ElementType> = {
  preview: Eye,
  console: Terminal,
  backend: Server,
  analysis: FileCheck,
};

const modeLabels: Record<ExecutionMode, string> = {
  preview: 'Preview',
  console: 'Console',
  backend: 'Terminal',
  analysis: 'Diagnostics',
};

export function UnifiedOutputPanel({
  mode,
  languageName,
  category,
  // Preview
  preview,
  onRefreshPreview,
  // Console
  consoleOutputs = [],
  isConsoleRunning = false,
  onConsoleRun,
  onConsoleStop,
  onConsoleClear,
  // Backend/Terminal
  terminalOutput = [],
  executionStatus = 'idle',
  executionResult = null,
  isRunning = false,
  canExecute = false,
  onRun,
  onStop,
  onClear,
  // Analysis
  analysisResult = null,
  isAnalyzing = false,
  onAnalyze,
  // Common
  isCollapsed = false,
  onToggleCollapse,
  onEnableCloud,
}: UnifiedOutputPanelProps) {
  // Render the appropriate panel based on mode
  const renderPanel = () => {
    switch (mode) {
      case 'preview':
        return (
          <LivePreviewPanel
            preview={preview || { html: '', css: '', js: '', error: null, isLoading: false, lastUpdate: new Date() }}
            onRefresh={onRefreshPreview || (() => { })}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );

      case 'console':
        return (
          <ConsolePanel
            outputs={consoleOutputs}
            isRunning={isConsoleRunning}
            onRun={onConsoleRun || (() => { })}
            onStop={onConsoleStop || (() => { })}
            onClear={onConsoleClear || (() => { })}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );

      case 'backend':
        // Check if Cloud is enabled (canExecute for Java/Python)
        if (!canExecute) {
          return (
            <BackendRequiredPanel
              category={category}
              languageName={languageName}
              isCollapsed={isCollapsed}
              onToggleCollapse={onToggleCollapse}
              onEnableCloud={onEnableCloud}
            />
          );
        }
        // Fall back to existing ExecutionPanel for Java/Python
        return (
          <ExecutionPanel
            output={terminalOutput}
            status={executionStatus}
            result={executionResult}
            isRunning={isRunning}
            canExecute={canExecute}
            onRun={onRun || (() => { })}
            onStop={onStop || (() => { })}
            onClear={onClear || (() => { })}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );

      case 'analysis':
        return (
          <AnalysisPanel
            result={analysisResult}
            isAnalyzing={isAnalyzing}
            onAnalyze={onAnalyze || (() => { })}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
          />
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex h-full flex-col">
      {renderPanel()}
    </div>
  );
}

// Mode indicator badge component for use in the toolbar
interface ModeIndicatorProps {
  mode: ExecutionMode;
  className?: string;
}

export function ModeIndicator({ mode, className }: ModeIndicatorProps) {
  const Icon = modeIcons[mode];
  const label = modeLabels[mode];

  const colorClasses: Record<ExecutionMode, string> = {
    preview: 'text-blue-500 bg-blue-500/10',
    console: 'text-yellow-500 bg-yellow-500/10',
    backend: 'text-purple-500 bg-purple-500/10',
    analysis: 'text-green-500 bg-green-500/10',
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className={cn(
          'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
          colorClasses[mode],
          className
        )}>
          <Icon className="h-3 w-3" />
          <span>{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipContent>
        <p className="font-medium">{label} Mode</p>
        <p className="text-xs text-muted-foreground">
          {mode === 'preview' && 'Live rendering of React/HTML components'}
          {mode === 'console' && 'Browser-based JavaScript execution'}
          {mode === 'backend' && 'Server-side code execution'}
          {mode === 'analysis' && 'TypeScript type checking'}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}

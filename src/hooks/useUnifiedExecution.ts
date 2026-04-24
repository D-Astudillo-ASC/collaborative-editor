import { useState, useCallback, useRef, useEffect } from 'react';
import type { ExecutionResult, ExecutionStatus, Language } from '@/types';
import type { ExecutionMode, ConsoleOutput, PreviewState, AnalysisResult, TemplateCategory } from '@/types/execution';
import { resolveExecutionStrategy } from '@/utils/executionStrategy';
import { useLivePreview } from '@/hooks/useLivePreview';
import { useBrowserConsole } from '@/hooks/useBrowserConsole';

interface UseUnifiedExecutionOptions {
  language: Language;
  category?: TemplateCategory;
  code: string;
}

interface UseUnifiedExecutionReturn {
  // Mode
  mode: ExecutionMode;

  // Preview state
  preview: PreviewState;
  updatePreview: (code: string) => void;

  // Console state
  consoleOutputs: ConsoleOutput[];
  isConsoleRunning: boolean;
  executeConsole: () => Promise<void>;
  stopConsole: () => void;
  clearConsole: () => void;

  // Backend/Terminal state (existing)
  terminalOutput: string[];
  executionStatus: ExecutionStatus;
  executionResult: ExecutionResult | null;
  isRunning: boolean;
  canExecute: boolean;
  execute: () => Promise<ExecutionResult>;
  stop: () => void;
  clear: () => void;

  // Analysis state
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  analyze: () => void;

  // Strategy info
  requiresBackend: boolean;
  canExecuteInBrowser: boolean;
}

/**
 * Unified execution hook that intelligently routes to the appropriate execution strategy
 * based on language and template category
 */
export function useUnifiedExecution({
  language,
  category,
  code,
}: UseUnifiedExecutionOptions): UseUnifiedExecutionReturn {
  // Resolve execution strategy
  const strategy = resolveExecutionStrategy(language, category);

  // Live Preview hook
  const { preview, updatePreview, iframeRef } = useLivePreview({ language });

  // Browser Console hook
  const {
    outputs: consoleOutputs,
    isRunning: isConsoleRunning,
    execute: executeConsoleFn,
    clear: clearConsole,
    stop: stopConsole,
  } = useBrowserConsole();

  // Backend/Terminal execution state (existing implementation)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const [executionStatus, setExecutionStatus] = useState<ExecutionStatus>('idle');
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Analysis state
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Code ref for current code
  const codeRef = useRef(code);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);

  // Auto-update preview for preview mode
  useEffect(() => {
    if (strategy.mode === 'preview' && code) {
      updatePreview(code);
    }
  }, [code, strategy.mode, updatePreview]);

  // Console execution
  const executeConsole = useCallback(async () => {
    await executeConsoleFn(codeRef.current);
  }, [executeConsoleFn]);

  // Backend execution (existing implementation)
  const execute = useCallback(async (): Promise<ExecutionResult> => {
    console.log(`[useUnifiedExecution] Execute ${language} code (backend mode)`);

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setExecutionStatus('running');
    setTerminalOutput([]);
    setExecutionResult(null);

    const startTime = Date.now();

    // TODO: Replace with actual backend API call
    const mockOutputLines = [
      '> Compiling...',
      '> Running...',
      'Hello, World!',
      'Execution completed.',
    ];

    for (const line of mockOutputLines) {
      await new Promise(resolve => setTimeout(resolve, 300));
      setTerminalOutput(prev => [...prev, line]);
    }

    const executionTime = Date.now() - startTime;

    const result: ExecutionResult = {
      id: `exec-${Date.now()}`,
      output: mockOutputLines.join('\n'),
      exitCode: 0,
      executionTime,
      timestamp: new Date(),
    };

    setExecutionResult(result);
    setExecutionStatus('completed');

    return result;
  }, [language]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setExecutionStatus('idle');
    setTerminalOutput(prev => [...prev, '\n[Execution stopped by user]']);
  }, []);

  const clear = useCallback(() => {
    setTerminalOutput([]);
    setExecutionResult(null);
    setExecutionStatus('idle');
  }, []);

  // Analysis execution
  const analyze = useCallback(() => {
    setIsAnalyzing(true);

    // Simulate type analysis (in production, this would use TypeScript compiler API)
    setTimeout(() => {
      const hasErrors = codeRef.current.includes('// @error');
      const hasWarnings = codeRef.current.includes('// @warning');

      const diagnostics = [];

      if (hasErrors) {
        diagnostics.push({
          severity: 'error' as const,
          message: 'Type error detected',
          line: 1,
          column: 1,
          code: 'TS2322',
          source: 'typescript',
        });
      }

      if (hasWarnings) {
        diagnostics.push({
          severity: 'warning' as const,
          message: 'Unused variable detected',
          line: 5,
          column: 7,
          code: 'TS6133',
          source: 'typescript',
        });
      }

      setAnalysisResult({
        isValid: diagnostics.filter(d => d.severity === 'error').length === 0,
        diagnostics,
        summary: diagnostics.length === 0
          ? 'No type errors found. All interfaces and types are valid.'
          : `Found ${diagnostics.length} issue(s) in the code.`,
      });
      setIsAnalyzing(false);
    }, 800);
  }, []);

  // Determine if backend execution is possible (Java/Python have mock implementation)
  const canExecute = ['java', 'python'].includes(language);
  const isRunning = executionStatus === 'running';

  return {
    mode: strategy.mode,

    // Preview
    preview,
    updatePreview,

    // Console
    consoleOutputs,
    isConsoleRunning,
    executeConsole,
    stopConsole,
    clearConsole,

    // Backend/Terminal
    terminalOutput,
    executionStatus,
    executionResult,
    isRunning,
    canExecute,
    execute,
    stop,
    clear,

    // Analysis
    analysisResult,
    isAnalyzing,
    analyze,

    // Strategy info
    requiresBackend: strategy.requiresBackend,
    canExecuteInBrowser: strategy.canExecuteInBrowser,
  };
}

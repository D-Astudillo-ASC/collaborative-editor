import { useState, useCallback, useRef } from 'react';
import type { ConsoleOutput } from '@/types/execution';

interface UseBrowserConsoleReturn {
  outputs: ConsoleOutput[];
  isRunning: boolean;
  error: string | null;
  execute: (code: string) => Promise<void>;
  clear: () => void;
  stop: () => void;
}

/**
 * Hook for executing JavaScript in the browser using a sandboxed approach
 * Captures console.log, console.warn, console.error outputs
 */
export function useBrowserConsole(): UseBrowserConsoleReturn {
  const [outputs, setOutputs] = useState<ConsoleOutput[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef(false);

  const addOutput = useCallback((type: ConsoleOutput['type'], content: string) => {
    setOutputs(prev => [...prev, {
      type,
      content,
      timestamp: new Date(),
    }]);
  }, []);

  const execute = useCallback(async (code: string) => {
    setIsRunning(true);
    setError(null);
    abortRef.current = false;

    // Add execution start message
    addOutput('info', '▶ Executing JavaScript...');

    try {
      // Create a sandboxed execution environment
      // Using an iframe sandbox for isolation
      const iframe = document.createElement('iframe');
      iframe.style.display = 'none';
      iframe.sandbox.add('allow-scripts');
      document.body.appendChild(iframe);

      const iframeWindow = iframe.contentWindow as Window & typeof globalThis;
      
      // Capture console methods
      const capturedLogs: ConsoleOutput[] = [];
      
      const createLogger = (type: ConsoleOutput['type']) => (...args: unknown[]) => {
        const content = args.map(arg => {
          if (typeof arg === 'object') {
            try {
              return JSON.stringify(arg, null, 2);
            } catch {
              return String(arg);
            }
          }
          return String(arg);
        }).join(' ');
        
        capturedLogs.push({
          type,
          content,
          timestamp: new Date(),
        });
      };

      // Inject custom console
      iframeWindow.console = {
        log: createLogger('log'),
        warn: createLogger('warn'),
        error: createLogger('error'),
        info: createLogger('info'),
        debug: createLogger('log'),
        clear: () => {},
        dir: createLogger('log'),
        table: createLogger('log'),
      } as Console;

      // Add timing function
      (iframeWindow as unknown as Record<string, unknown>).sleep = (ms: number) => 
        new Promise(resolve => setTimeout(resolve, ms));

      // Execute the code
      const startTime = performance.now();
      
      try {
        // Wrap in async IIFE to support top-level await
        const wrappedCode = `
          (async () => {
            ${code}
          })()
        `;
        
        const result = iframeWindow.eval(wrappedCode);
        
        // Handle promises
        if (result instanceof Promise) {
          const resolved = await result;
          if (resolved !== undefined) {
            capturedLogs.push({
              type: 'result',
              content: `← ${formatValue(resolved)}`,
              timestamp: new Date(),
            });
          }
        } else if (result !== undefined) {
          capturedLogs.push({
            type: 'result',
            content: `← ${formatValue(result)}`,
            timestamp: new Date(),
          });
        }
      } catch (execError) {
        capturedLogs.push({
          type: 'error',
          content: `Error: ${execError instanceof Error ? execError.message : String(execError)}`,
          timestamp: new Date(),
        });
      }

      const endTime = performance.now();
      const duration = Math.round(endTime - startTime);

      // Update outputs with captured logs
      if (!abortRef.current) {
        setOutputs(prev => [
          ...prev,
          ...capturedLogs,
          {
            type: 'info',
            content: `✓ Completed in ${duration}ms`,
            timestamp: new Date(),
          },
        ]);
      }

      // Cleanup
      document.body.removeChild(iframe);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown execution error';
      setError(errorMessage);
      addOutput('error', `✗ ${errorMessage}`);
    } finally {
      setIsRunning(false);
    }
  }, [addOutput]);

  const clear = useCallback(() => {
    setOutputs([]);
    setError(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current = true;
    if (workerRef.current) {
      workerRef.current.terminate();
      workerRef.current = null;
    }
    setIsRunning(false);
    addOutput('warn', '[Execution stopped by user]');
  }, [addOutput]);

  return {
    outputs,
    isRunning,
    error,
    execute,
    clear,
    stop,
  };
}

/**
 * Format a JavaScript value for display
 */
function formatValue(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') return `"${value}"`;
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (Array.isArray(value)) {
    if (value.length > 10) {
      return `Array(${value.length}) [${value.slice(0, 5).map(formatValue).join(', ')}, ...]`;
    }
    return `[${value.map(formatValue).join(', ')}]`;
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

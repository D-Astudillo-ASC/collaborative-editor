import { useState, useCallback, useRef, useEffect } from 'react';
import type { ExecutionResult, ExecutionStatus, Language } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/config/backend';
import type { Socket } from 'socket.io-client';
import { getSocket } from '@/services/socket';

interface UseCodeExecutionOptions {
  language: Language;
  documentId?: string;
}

export function useCodeExecution({ language, documentId }: UseCodeExecutionOptions) {
  const { token, getAccessToken } = useAuth();
  const [status, setStatus] = useState<ExecutionStatus>('idle');
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [output, setOutput] = useState<string[]>([]);
  // Terminal output for streaming display (enhanced from useUnifiedExecution)
  const [terminalOutput, setTerminalOutput] = useState<string[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Set up socket listener for execution results
  useEffect(() => {
    if (!documentId || !token) return;

    const socket = getSocket(token);
    socketRef.current = socket;

    const handleExecutionResult = (data: any) => {
      if (data.documentId !== documentId) return;

      const executionResult: ExecutionResult = {
        id: data.executionId || `exec-${Date.now()}`,
        output: data.output || '',
        error: data.error || undefined,
        exitCode: data.exitCode || (data.error ? 1 : 0),
        executionTime: data.executionTimeMs || 0,
        timestamp: new Date(),
      };

      setResult(executionResult);

      // Enhanced: Parse output into lines for terminal display (from useUnifiedExecution)
      if (data.output) {
        setOutput((prev) => [...prev, data.output]);
        // Split output into lines for terminal display
        const outputLines = data.output.split('\n');
        setTerminalOutput(outputLines);
      } else if (data.error) {
        // Also handle error output
        const errorLines = data.error.split('\n');
        setTerminalOutput((prev) => [...prev, ...errorLines]);
      }

      if (data.status === 'completed' || data.status === 'failed') {
        setStatus(data.status === 'failed' ? 'error' : 'completed');
      }
    };

    socket.on('code-execution-result', handleExecutionResult);

    return () => {
      socket.off('code-execution-result', handleExecutionResult);
    };
  }, [documentId, token]);

  const execute = useCallback(async (code: string): Promise<ExecutionResult> => {
    if (!code.trim()) {
      const errorResult: ExecutionResult = {
        id: `exec-${Date.now()}`,
        output: '',
        error: 'Code cannot be empty',
        exitCode: 1,
        executionTime: 0,
        timestamp: new Date(),
      };
      setResult(errorResult);
      setStatus('error');
      return errorResult;
    }
    
    // Abort any existing execution
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();
    
    setStatus('running');
    setOutput([]);
    setTerminalOutput([]); // Clear terminal output (enhanced from useUnifiedExecution)
    setResult(null);

    const startTime = Date.now();

    try {
      // Get fresh token for API call
      const authToken = await getAccessToken();
      if (!authToken) {
        throw new Error('Authentication required');
      }

      const response = await fetch(apiUrl('/api/execute'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          documentId: documentId || undefined,
          language,
          code,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Execution failed' }));
        throw new Error(errorData.error || 'Execution failed');
      }

      const data = await response.json();

      // Result will come via WebSocket, but we can show immediate feedback
      const immediateResult: ExecutionResult = {
        id: data.executionId || `exec-${Date.now()}`,
        output: data.output || '',
        error: data.error || undefined,
        exitCode: data.exitCode || (data.error ? 1 : 0),
        executionTime: data.executionTimeMs || 0,
        timestamp: new Date(),
      };

      setResult(immediateResult);

      // Enhanced: Parse immediate output into terminal lines (from useUnifiedExecution)
      if (data.output) {
        const outputLines = data.output.split('\n');
        setTerminalOutput(outputLines);
      } else if (data.error) {
        const errorLines = data.error.split('\n');
        setTerminalOutput(errorLines);
    }

      // If execution completed immediately (unlikely for long-running code), stop loading
      if (data.status === 'completed' || data.status === 'failed') {
        setStatus(data.status === 'failed' ? 'error' : 'completed');
      } else {
        // Otherwise, wait for WebSocket result
        // Status will be updated by socket listener
      }

      return immediateResult;
    } catch (err: any) {
      const errorResult: ExecutionResult = {
      id: `exec-${Date.now()}`,
        output: '',
        error: err.message || 'Failed to execute code',
        exitCode: 1,
        executionTime: Date.now() - startTime,
      timestamp: new Date(),
    };

      setResult(errorResult);
      setStatus('error');
      const errorMessage = `[Error] ${err.message || 'Execution failed'}`;
      setOutput((prev) => [...prev, errorMessage]);
      setTerminalOutput((prev) => [...prev, errorMessage]); // Enhanced: Also add to terminal output

      return errorResult;
    }
  }, [language, documentId, getAccessToken]);

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    setStatus('idle');
    const stopMessage = '\n[Execution stopped by user]';
    setOutput((prev) => [...prev, stopMessage]);
    setTerminalOutput((prev) => [...prev, stopMessage]); // Enhanced: Also add to terminal output
  }, []);

  const clear = useCallback(() => {
    setOutput([]);
    setTerminalOutput([]); // Enhanced: Also clear terminal output
    setResult(null);
    setStatus('idle');
  }, []);

  const canExecute = ['java', 'python', 'javascript', 'typescript'].includes(language);

  return {
    // Original API (backward compatible)
    status,
    result,
    output,
    isRunning: status === 'running',
    canExecute,
    execute,
    stop,
    clear,
    // Enhanced API (from useUnifiedExecution)
    terminalOutput, // Streaming terminal output for better UX
    executionStatus: status, // Alias for consistency with useUnifiedExecution
    executionResult: result, // Alias for consistency with useUnifiedExecution
  };
}

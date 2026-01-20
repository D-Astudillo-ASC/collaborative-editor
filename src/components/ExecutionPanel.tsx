import React, { useState, useEffect } from 'react';
import { Box, Paper, Typography, IconButton, Button, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import type { Socket } from 'socket.io-client';
import { apiUrl } from '../config/backend';
import { useAuth } from '../contexts/AuthContext';

interface ExecutionPanelProps {
  code: string;
  language: 'java' | 'python';
  documentId: string;
  socket: Socket | null;
  isOpen: boolean;
  onClose: () => void;
}

interface ExecutionResult {
  executionId: string;
  status: 'completed' | 'failed' | 'running';
  output: string;
  error: string | null;
  executionTimeMs: number;
}

/**
 * Production-grade execution panel for backend code (Java/Python).
 * 
 * Features:
 * - Server-side code execution
 * - Real-time result streaming via WebSocket
 * - Error handling and display
 * - Execution time tracking
 * - Collaborative: All users see execution results
 */
const ExecutionPanel: React.FC<ExecutionPanelProps> = ({
  code,
  language,
  documentId,
  socket,
  isOpen,
  onClose,
}) => {
  const { getAccessToken } = useAuth();
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for execution results via WebSocket
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleExecutionResult = (data: any) => {
      if (data.documentId === documentId) {
        setResult({
          executionId: data.executionId,
          status: data.status,
          output: data.output || '',
          error: data.error || null,
          executionTimeMs: data.executionTimeMs || 0,
        });
        setIsExecuting(false);
        setError(null);
      }
    };

    socket.on('code-execution-result', handleExecutionResult);

    return () => {
      socket.off('code-execution-result', handleExecutionResult);
    };
  }, [socket, documentId, isOpen]);

  const handleExecute = async () => {
    if (!code.trim()) {
      setError('Code cannot be empty');
      return;
    }

    setIsExecuting(true);
    setError(null);
    setResult(null);

    try {
      // Get auth token
      const token = await getAccessToken();
      if (!token) {
        throw new Error('Authentication required');
      }

      const response = await fetch(apiUrl('/api/execute'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          documentId,
          language,
          code,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Execution failed');
      }

      const data = await response.json();
      
      // Result will come via WebSocket, but we can show immediate feedback
      setResult({
        executionId: data.executionId,
        status: data.status || 'running',
        output: data.output || '',
        error: data.error || null,
        executionTimeMs: data.executionTimeMs || 0,
      });

      // If execution completed immediately (unlikely), stop loading
      if (data.status === 'completed' || data.status === 'failed') {
        setIsExecuting(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to execute code');
      setIsExecuting(false);
      setResult(null);
    }
  };

  if (!isOpen) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        width: '600px',
        maxHeight: '500px',
        zIndex: 1500,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          p: 1,
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <PlayArrowIcon color="primary" fontSize="small" />
          <Typography variant="h6">Code Execution</Typography>
          <Typography variant="caption" color="text.secondary">
            ({language})
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2, flex: 1, overflow: 'auto' }}>
        <Button
          variant="contained"
          color="primary"
          startIcon={isExecuting ? <CircularProgress size={16} /> : <PlayArrowIcon />}
          onClick={handleExecute}
          disabled={isExecuting || !code.trim()}
          fullWidth
        >
          {isExecuting ? 'Executing...' : 'Run Code'}
        </Button>

        {error && (
          <Box
            sx={{
              p: 2,
              bgcolor: 'error.light',
              color: 'error.contrastText',
              borderRadius: 1,
            }}
          >
            <Typography variant="subtitle2" gutterBottom>Error:</Typography>
            <Typography variant="body2" sx={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
              {error}
            </Typography>
          </Box>
        )}

        {result && (
          <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle2">
                Status: <strong>{result.status === 'completed' ? '✅ Completed' : result.status === 'failed' ? '❌ Failed' : '⏳ Running'}</strong>
              </Typography>
              {result.executionTimeMs > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {result.executionTimeMs}ms
                </Typography>
              )}
            </Box>

            {result.output && (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'grey.100',
                  borderRadius: 1,
                  mb: 1,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                <Typography variant="caption" color="text.secondary" gutterBottom>
                  Output:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.875rem',
                  }}
                >
                  {result.output}
                </Typography>
              </Box>
            )}

            {result.error && (
              <Box
                sx={{
                  p: 2,
                  bgcolor: 'error.light',
                  color: 'error.contrastText',
                  borderRadius: 1,
                  maxHeight: 200,
                  overflow: 'auto',
                }}
              >
                <Typography variant="caption" gutterBottom>
                  Error:
                </Typography>
                <Typography
                  variant="body2"
                  sx={{
                    fontFamily: 'monospace',
                    whiteSpace: 'pre-wrap',
                    fontSize: '0.875rem',
                  }}
                >
                  {result.error}
                </Typography>
              </Box>
            )}
          </Box>
        )}
      </Box>
    </Paper>
  );
};

export default ExecutionPanel;

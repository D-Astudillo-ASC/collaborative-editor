/**
 * Phase 8: AI Chat Hook
 *
 * Manages the AI assistant conversation: message history, streaming state,
 * error handling, and abort control.
 *
 * Streaming strategy:
 * - We POST to /api/ai/chat with the message + code context in the body.
 *   The native EventSource API only supports GET, so we use fetch() +
 *   response.body.getReader() and parse the SSE wire format ourselves.
 * - Each SSE event is `data: {...}\n\n`. We buffer incomplete lines across
 *   ReadableStream chunks and parse each complete line.
 * - The streaming assistant message is updated in-place (by id) so React
 *   renders incremental tokens without re-mounting the message component.
 */

import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/config/backend';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
}

export interface CodeContext {
  /** Full document content (used when no selection) */
  code: string;
  /** Language/filename extension for syntax hints */
  language: string;
  /** When set, sends only the selected text as context */
  selection?: string;
}

export function useAIChat() {
  const { getAccessToken } = useAuth();
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, context?: CodeContext) => {
      if (!content.trim() || isStreaming) return;

      const userMessage: AIMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: content.trim(),
        timestamp: new Date(),
      };

      // Snapshot history before adding the new messages so we can send
      // only the prior exchanges to the backend (not including the current turn).
      const historySnapshot = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const assistantId = `a-${Date.now() + 1}`;
      const assistantPlaceholder: AIMessage = {
        id: assistantId,
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMessage, assistantPlaceholder]);
      setIsStreaming(true);
      setError(null);

      abortRef.current = new AbortController();

      try {
        const token = await getAccessToken();
        const response = await fetch(apiUrl('/api/ai/chat'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            message: content.trim(),
            context,
            history: historySnapshot,
          }),
          signal: abortRef.current.signal,
        });

        if (!response.ok) {
          const body = await response.text().catch(() => '');
          throw new Error(`Server error ${response.status}: ${body}`);
        }

        // Read SSE stream -------------------------------------------------------
        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          // SSE events are separated by \n\n; process all complete lines
          const lines = buffer.split('\n');
          // Keep the last (potentially incomplete) line in the buffer
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const raw = line.slice(6).trim();
            if (!raw) continue;

            try {
              const event = JSON.parse(raw) as {
                type: 'content' | 'done' | 'error';
                delta?: string;
                message?: string;
              };

              if (event.type === 'content' && event.delta) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + event.delta }
                      : m
                  )
                );
              } else if (event.type === 'error' && event.message) {
                setError(event.message);
              }
            } catch {
              // Ignore malformed SSE chunks
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') {
          // User cancelled — leave the partial message as-is
        } else {
          const msg = err instanceof Error ? err.message : 'Request failed';
          setError(msg);
          // Remove the empty placeholder on hard failure
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        // Mark the streaming message as complete
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, isStreaming: false } : m
          )
        );
        setIsStreaming(false);
      }
    },
    [messages, isStreaming, getAccessToken]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  return {
    messages,
    isStreaming,
    error,
    sendMessage,
    stopStreaming,
    clearConversation,
  };
}

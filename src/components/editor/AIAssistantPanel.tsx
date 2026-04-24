/**
 * Phase 8: AI Assistant Panel
 *
 * A GitHub Copilot Chat-style side panel with:
 * - Streaming token display (incremental updates, no re-mount)
 * - Custom code block renderer with copy button (no react-markdown dep)
 * - Context indicator: shows whether AI sees the full file or a selection
 * - Clear conversation button
 * - Abort streaming button
 * - Auto-scroll to newest message
 */

import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle, KeyboardEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Bot,
  Send,
  Square,
  Copy,
  Check,
  FileCode,
  TextSelect,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAIChat } from '@/hooks/useAIChat';
import type { CodeContext } from '@/hooks/useAIChat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AIAssistantPanelProps {
  /** Full document content — sent as context with every message */
  code: string;
  /** Current language ID (e.g. "javascript", "python") */
  language: string;
  /** Currently selected text in the editor (undefined = no selection) */
  selection?: string;
}

/** Exposed via ref so the parent (Editor.tsx tab bar) can control the panel. */
export interface AIAssistantPanelHandle {
  clearConversation: () => void;
  hasMessages: boolean;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Code block renderer
//
// Parses content that may contain fenced code blocks (```lang\n...\n```) and
// renders them as styled blocks with a copy button.  Everything outside code
// blocks is processed for basic inline formatting (inline code, bold, lists).
// ---------------------------------------------------------------------------

interface CodeBlockProps {
  lang: string;
  code: string;
}

function CodeBlock({ lang, code }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2 overflow-hidden rounded-md border border-border/60 bg-[#1e1e1e] text-sm">
      {/* Code block header */}
      <div className="flex items-center justify-between border-b border-border/40 bg-muted/30 px-3 py-1.5">
        <span className="font-mono text-xs text-muted-foreground">{lang || 'code'}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <>
              <Check className="h-3 w-3 text-green-500" />
              <span className="text-green-500">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3" />
              Copy
            </>
          )}
        </button>
      </div>
      {/* Code content */}
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

// Inline text renderer: handles **bold**, `inline code`, and newlines.
function InlineText({ text }: { text: string }) {
  // Split on **bold** and `inline code` markers
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`')) {
          return (
            <code
              key={i}
              className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-foreground"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        // Render newlines as <br> with consistent spacing
        return part.split('\n').map((line, j) => (
          <span key={`${i}-${j}`}>
            {j > 0 && <br />}
            {line}
          </span>
        ));
      })}
    </>
  );
}

interface MessageContentProps {
  content: string;
  isStreaming?: boolean;
}

function MessageContent({ content, isStreaming }: MessageContentProps) {
  // Split on fenced code blocks (```lang\n...\n```)
  // The regex captures the entire block including backticks
  const segments = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="text-sm leading-relaxed">
      {segments.map((segment, i) => {
        if (segment.startsWith('```')) {
          // Parse language tag and code body
          const inner = segment.slice(3, segment.endsWith('```') ? -3 : undefined);
          const newlineIdx = inner.indexOf('\n');
          const lang = newlineIdx >= 0 ? inner.slice(0, newlineIdx).trim() : '';
          const code = newlineIdx >= 0 ? inner.slice(newlineIdx + 1) : inner;
          return <CodeBlock key={i} lang={lang} code={code} />;
        }

        // Plain text — check for list items (lines starting with - or *)
        const lines = segment.split('\n');
        return (
          <span key={i}>
            {lines.map((line, j) => {
              const listMatch = line.match(/^(\s*[-*]\s+)(.*)/);
              if (listMatch) {
                return (
                  <div key={j} className="ml-3 flex gap-1.5">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/60" />
                    <span>
                      <InlineText text={listMatch[2]} />
                    </span>
                  </div>
                );
              }
              return (
                <span key={j}>
                  {j > 0 && <br />}
                  <InlineText text={line} />
                </span>
              );
            })}
          </span>
        );
      })}
      {/* Streaming cursor blink */}
      {isStreaming && (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-primary align-middle" />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel component
// ---------------------------------------------------------------------------

export const AIAssistantPanel = forwardRef<AIAssistantPanelHandle, AIAssistantPanelProps>(
function AIAssistantPanel({ code, language, selection }, ref) {
  const { messages, isStreaming, error, sendMessage, stopStreaming, clearConversation } =
    useAIChat();

  const [input, setInput] = useState('');
  const [useSelection, setUseSelection] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Expose clear + message count so the parent tab bar can show a clear button
  useImperativeHandle(ref, () => ({
    clearConversation,
    hasMessages: messages.length > 0,
  }), [clearConversation, messages.length]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [input]);

  const buildContext = useCallback((): CodeContext => ({
    code,
    language,
    selection: useSelection && selection ? selection : undefined,
  }), [code, language, selection, useSelection]);

  const handleSend = useCallback(() => {
    if (!input.trim() || isStreaming) return;
    sendMessage(input, buildContext());
    setInput('');
  }, [input, isStreaming, sendMessage, buildContext]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasSelection = !!selection?.trim();

  return (
    <div className="flex h-full flex-col bg-card">
      {/* ------------------------------------------------------------------ */}
      {/* Context indicator                                                    */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex items-center gap-2 border-b border-border/50 bg-muted/20 px-4 py-2">
        <span className="text-xs text-muted-foreground">Context:</span>
        <button
          onClick={() => setUseSelection(false)}
          className={cn(
            'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors',
            !useSelection
              ? 'bg-primary/15 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          <FileCode className="h-3 w-3" />
          Full file
        </button>
        {hasSelection && (
          <button
            onClick={() => setUseSelection(true)}
            className={cn(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors',
              useSelection
                ? 'bg-primary/15 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <TextSelect className="h-3 w-3" />
            Selection
          </button>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Messages                                                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Bot className="h-6 w-6 text-primary/70" />
            </div>
            <div>
              <p className="text-sm font-medium">Ask anything about your code</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Explain, refactor, debug, or generate new code
              </p>
            </div>
            {/* Suggested prompts */}
            <div className="mt-2 flex flex-col gap-2 w-full max-w-[240px]">
              {[
                'Explain what this code does',
                'Find potential bugs',
                'Suggest improvements',
              ].map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    textareaRef.current?.focus();
                  }}
                  className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  className={cn(
                    'flex gap-2.5',
                    msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                  )}
                >
                  {/* Avatar */}
                  {msg.role === 'assistant' && (
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
                      <Sparkles className="h-3 w-3 text-primary" />
                    </div>
                  )}

                  {/* Bubble */}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-xl px-3 py-2',
                      msg.role === 'user'
                        ? 'bg-primary/15 text-foreground'
                        : 'bg-muted/50 text-foreground'
                    )}
                  >
                    <MessageContent
                      content={msg.content || (msg.isStreaming ? '' : '…')}
                      isStreaming={msg.isStreaming}
                    />
                    <p className="mt-1 text-[10px] text-muted-foreground/60">
                      {formatTime(msg.timestamp)}
                    </p>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Input area                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2 rounded-xl border border-border bg-muted/30 px-3 py-2 focus-within:border-primary/40 focus-within:bg-background/50 transition-colors">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your code… (Enter to send)"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm placeholder:text-muted-foreground/60 focus:outline-none"
            disabled={isStreaming}
          />
          {isStreaming ? (
            <Button
              size="icon"
              variant="ghost"
              onClick={stopStreaming}
              className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10"
              title="Stop generating"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
            </Button>
          ) : (
            <Button
              size="icon"
              onClick={handleSend}
              disabled={!input.trim()}
              className="h-7 w-7 shrink-0"
              title="Send (Enter)"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground/40">
          Powered by Gemini 2.0 Flash · {language}
        </p>
      </div>
    </div>
  );
});


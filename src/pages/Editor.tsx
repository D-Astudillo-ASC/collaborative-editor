import { useState, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { MessageSquare, Bot, PanelRightClose, Trash2 } from 'lucide-react';
import { AIAssistantPanel } from '@/components/editor/AIAssistantPanel';
import type { AIAssistantPanelHandle } from '@/components/editor/AIAssistantPanel';
import { toast } from 'sonner';

import { AppLayout } from '@/components/layout/AppLayout';
import { MonacoEditor } from '@/components/editor/MonacoEditor';
import { EditorToolbar } from '@/components/editor/EditorToolbar';
import { StatusBar } from '@/components/editor/StatusBar';
import { TemplatePicker } from '@/components/editor/TemplatePicker';
import { Button } from '@/components/ui/button';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { useAuth } from '@/contexts/AuthContext';
import { useCollaboration } from '@/hooks/useCollaboration';
import { useCodeExecution } from '@/hooks/useCodeExecution';
import { useUnifiedExecution } from '@/hooks/useUnifiedExecution';
import { templates } from '@/constants/templates';
import { apiUrl } from '@/config/backend';
import { UnifiedOutputPanel } from '@/components/editor/UnifiedOutputPanel';
import type { Language, Template } from '@/types';
import type { TemplateCategory } from '@/types/execution';

export default function Editor() {
  const { id: documentId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const linkToken = searchParams.get('token');
  const { user, getAccessToken } = useAuth();

  // Redirect if not authenticated
  useEffect(() => {
    if (!user) {
      navigate('/login');
      return;
    }
  }, [user, navigate]);

  // Redirect if no documentId - user should create a document first
  useEffect(() => {
    if (!documentId && user) {
      navigate('/dashboard');
    }
  }, [documentId, user, navigate]);

  // Document state - will be synced from Yjs
  const [title, setTitle] = useState('Untitled Document');
  const [language, setLanguage] = useState<Language>('typescript');
  const [content, setContent] = useState('');
  const [cursorPosition, setCursorPosition] = useState({ lineNumber: 1, column: 1 });
  const [currentCategory, setCurrentCategory] = useState<TemplateCategory | undefined>();

  // UI state
  const [isTemplatePickerOpen, setIsTemplatePickerOpen] = useState(false);
  const [isRightPanelOpen, setIsRightPanelOpen] = useState(false);
  const [rightPanelTab, setRightPanelTab] = useState<'chat' | 'ai'>('ai');
  // Selected text in Monaco — passed to AI panel as optional context
  const [editorSelection, setEditorSelection] = useState<string>('');
  // Ref to AI panel for clearing conversation from the tab bar's Clear button
  const aiPanelRef = useRef<AIAssistantPanelHandle | null>(null);

  // Imperative ref for right panel — always mounted, collapsed/expanded via API
  const rightPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isProgrammaticResize = useRef(false);

  // Output panel state
  const [isOutputPanelOpen, setIsOutputPanelOpen] = useState(false);
  const [isOutputPanelCollapsed, setIsOutputPanelCollapsed] = useState(false);

  // Imperative ref for output panel — always mounted, same pattern as right panel
  const outputPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isOutputProgrammatic = useRef(false);

  // Hooks - real backend integration (only when documentId exists)
  const {
    collaborators,
    updateCursor,
    connectionStatus,
    lastSynced,
    yText,
    awareness,
  } = useCollaboration({
    documentId: documentId || '', // Empty string will be handled by the hook
    user: user || null,
    linkToken, // Pass linkToken for share link access
  });

  // Unified Execution Hook (for preview/console/analysis modes)
  const {
    mode: executionMode,
    // Preview
    preview,
    updatePreview,
    // Console
    consoleOutputs,
    isConsoleRunning,
    executeConsole,
    stopConsole,
    clearConsole,
    // Analysis
    analysisResult,
    isAnalyzing,
    analyze,
    // Strategy info
    canExecuteInBrowser,
  } = useUnifiedExecution({ language, category: currentCategory, code: content });

  // Backend execution hook (for Java/Python - uses real backend API)
  const {
    status: backendExecutionStatus,
    result: backendExecutionResult,
    terminalOutput: backendTerminalOutput,
    isRunning: isBackendRunning,
    canExecute: canExecuteBackend,
    execute: executeBackend,
    stop: stopBackendExecution,
    clear: clearBackendOutput,
  } = useCodeExecution({
    language,
    documentId: documentId || undefined,
  });

  // Sync content from Yjs
  useEffect(() => {
    if (!yText) {
      // Reset content if yText is not available
      if (content !== '') {
        setContent('');
      }
      return;
    }

    // Set initial content immediately
    const currentText = yText.toString();
    setContent(currentText);

    // Observe Yjs changes
    const observer = () => {
      const newText = yText.toString();
      setContent(newText);
    };

    yText.observe(observer);

    return () => {
      yText.unobserve(observer);
    };
  }, [yText]); // Remove 'content' from dependencies to avoid infinite loop

  // Calculate document stats
  const lineCount = content.split('\n').length;
  const charCount = content.length;

  // Determine if we should show the output panel based on mode
  const shouldShowOutputPanel = executionMode === 'preview' || canExecuteInBrowser || canExecuteBackend;

  // Handlers
  const handleContentChange = useCallback((newContent: string) => {
    // Content changes are handled by Yjs binding automatically
    // This callback is mainly for local state updates if needed
    setContent(newContent);
    // Auto-open preview panel for preview mode
    if (executionMode === 'preview' && !isOutputPanelOpen) {
      setIsOutputPanelOpen(true);
    }
  }, [executionMode, isOutputPanelOpen]);

  const handleCursorChange = useCallback(
    (position: { lineNumber: number; column: number }, selection?: any) => {
      setCursorPosition(position);
      updateCursor(position, selection);
    },
    [updateCursor]
  );

  const handleLanguageChange = useCallback((newLanguage: Language) => {
    setLanguage(newLanguage);
    setCurrentCategory(undefined); // Reset category when language changes
    toast.success(`Language changed to ${newLanguage}`);
  }, []);

  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    toast.success('Title updated');
  }, []);

  const handleSelectTemplate = useCallback((template: Template) => {
    if (yText) {
      // Delete all existing content and insert template code
      const currentLength = yText.length;
      if (currentLength > 0) {
        yText.delete(0, currentLength);
      }
      yText.insert(0, template.code);
      // Language change will update the UI
      setLanguage(template.language);
      setCurrentCategory(template.category as TemplateCategory);

      // Auto-open output panel for preview mode
      if (executionMode === 'preview' || template.category === 'React' || template.category === 'HTML') {
        setIsOutputPanelOpen(true);
        // Manually trigger preview update for immediate feedback
        setTimeout(() => {
          updatePreview(template.code);
        }, 100);
      }

      toast.success(`Applied template: ${template.name}`);
    } else {
      // Fallback: update local state if Yjs is not ready yet
      setContent(template.code);
      setLanguage(template.language);
      setCurrentCategory(template.category as TemplateCategory);

      // Manually trigger preview update for immediate feedback
      if (template.category === 'React' || template.category === 'HTML') {
        setTimeout(() => {
          updatePreview(template.code);
        }, 100);
      }

      toast.success(`Applied template: ${template.name}`);
    }
  }, [yText, executionMode, updatePreview]);

  const handleShare = useCallback(async () => {
    if (!documentId) return;

    try {
      const token = await getAccessToken();
      if (!token) {
        // Without a signed-in user, just copy the current URL
        const url = `${window.location.origin}/editor/${documentId}${linkToken ? `?token=${linkToken}` : ''}`;
        await navigator.clipboard.writeText(url);
        toast.success('Link copied to clipboard!');
        return;
      }

      // Generate/rotate share link token on the server
      const res = await fetch(apiUrl(`/api/documents/${documentId}/share-link`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: 'edit' }),
      });

      if (!res.ok) {
        throw new Error(`share-link failed: ${res.status}`);
      }

      const data = await res.json();
      const shareUrl = `${window.location.origin}/editor/${documentId}?token=${data.token}`;

      if (navigator.share) {
        await navigator.share({ title: 'Collaborative Document', url: shareUrl });
        toast.success('Share link generated!');
      } else {
        await navigator.clipboard.writeText(shareUrl);
        toast.success('Share link copied to clipboard!');
      }
    } catch (error) {
      console.error('Failed to generate share link:', error);
      // Fallback: at least copy the current URL
      const url = `${window.location.origin}/editor/${documentId}${linkToken ? `?token=${linkToken}` : ''}`;
      await navigator.clipboard.writeText(url);
      toast.success('Link copied to clipboard!');
    }
  }, [documentId, linkToken, getAccessToken]);

  const handleRun = useCallback(async () => {
    // Open output panel when running
    setIsOutputPanelOpen(true);
    setIsOutputPanelCollapsed(false);

    // Route to appropriate execution based on mode
    switch (executionMode) {
      case 'preview':
        updatePreview(content);
        break;
      case 'console':
        await executeConsole();
        break;
      case 'backend':
        if (canExecuteBackend) {
          const result = await executeBackend(content);
          if (result.error) {
            toast.error('Execution failed', { description: result.error });
          } else {
            toast.success(`Completed in ${result.executionTime}ms`);
          }
        } else {
          toast.info('Backend execution requires Lovable Cloud');
        }
        break;
      case 'analysis':
        analyze();
        break;
    }
  }, [content, executionMode, executeBackend, executeConsole, updatePreview, analyze, canExecuteBackend]);

  const handleEnableCloud = useCallback(() => {
    toast.info('Cloud integration coming soon!');
    // In production: trigger Cloud enablement flow
  }, []);

  // Drive output panel open/close imperatively so the handle is always in the DOM.
  useEffect(() => {
    const panel = outputPanelRef.current;
    if (!panel) return;
    isOutputProgrammatic.current = true;
    if (isOutputPanelOpen) {
      panel.resize('40%');
    } else {
      panel.collapse();
    }
    requestAnimationFrame(() => { isOutputProgrammatic.current = false; });
  }, [isOutputPanelOpen]);

  // Drive right panel open/close imperatively so the panel is always mounted.
  // This ensures the ResizableHandle is always in the DOM (above Monaco's scrollbar)
  // and the panel never loses its size state between toggles.
  useEffect(() => {
    const panel = rightPanelRef.current;
    if (!panel) return;
    isProgrammaticResize.current = true;
    if (isRightPanelOpen) {
      panel.resize('28%');
    } else {
      panel.collapse();
    }
    requestAnimationFrame(() => { isProgrammaticResize.current = false; });
  }, [isRightPanelOpen]);

  // Top bar content
  const topBar = (
    <EditorToolbar
      title={title}
      language={language}
      onTitleChange={handleTitleChange}
      onLanguageChange={handleLanguageChange}
      onOpenTemplates={() => setIsTemplatePickerOpen(true)}
      onShare={handleShare}
      onRun={handleRun}
      canRun={shouldShowOutputPanel}
      collaborators={collaborators}
      connectionStatus={connectionStatus}
      templateCount={templates.length}
      onBack={() => navigate('/dashboard')}
      executionMode={executionMode}
    />
  );

  return (
    <AppLayout topBar={topBar} showSidebar={false}>

      <div className="flex h-full flex-col">
        <ResizablePanelGroup
          direction="horizontal"
          className="flex-1"
          defaultLayout={{ 'editor-main-panel': 100, 'editor-right-panel': 0 }}
        >
          {/* Main Editor Area (with vertical split for execution panel) */}
          <ResizablePanel
            id="editor-main-panel"
            minSize="40"
          >
            <ResizablePanelGroup
              direction="vertical"
              defaultLayout={{ 'editor-code-panel': 100, 'editor-output-panel': 0 }}
            >
              {/* Code Editor Section — always mounted */}
              <ResizablePanel
                id="editor-code-panel"
                minSize="25"
              >
                <div className="flex h-full flex-col">
                  {/* Monaco Editor */}
                  <div className="flex-1">
                    {!documentId ? (
                      <div className="flex h-full items-center justify-center">
                        <p className="text-muted-foreground">Redirecting to dashboard...</p>
                      </div>
                    ) : (
                      <MonacoEditor
                        value={content}
                        language={language}
                        onChange={handleContentChange}
                        onCursorChange={handleCursorChange}
                        onSelectionChange={setEditorSelection}
                        collaborators={collaborators}
                        yText={yText}
                        awareness={awareness}
                      />
                    )}
                  </div>

                  {/* Status Bar */}
                  <StatusBar
                    language={language}
                    lineCount={lineCount}
                    charCount={charCount}
                    cursorPosition={cursorPosition}
                    lastSynced={lastSynced}
                    connectionStatus={connectionStatus || 'disconnected'}
                  />
                </div>
              </ResizablePanel>

              {/* Output panel — always mounted, collapsed/expanded imperatively */}
              <ResizableHandle withHandle />
              <ResizablePanel
                id="editor-output-panel"
                panelRef={outputPanelRef}
                defaultSize="40"
                minSize="20"
                maxSize="70"
                collapsible
                collapsedSize="0"
                onResize={(size) => {
                  if (isOutputProgrammatic.current) return;
                  const pct = size.asPercentage;
                  if (pct > 1 && !isOutputPanelOpen) setIsOutputPanelOpen(true);
                  if (pct <= 1 && isOutputPanelOpen) setIsOutputPanelOpen(false);
                }}
              >
                <UnifiedOutputPanel
                  mode={executionMode}
                  languageName={language}
                  category={currentCategory}
                  // Preview
                  preview={preview}
                  onRefreshPreview={() => updatePreview(content)}
                  // Console
                  consoleOutputs={consoleOutputs}
                  isConsoleRunning={isConsoleRunning}
                  onConsoleRun={executeConsole}
                  onConsoleStop={stopConsole}
                  onConsoleClear={clearConsole}
                  // Backend/Terminal (using useCodeExecution)
                  terminalOutput={backendTerminalOutput}
                  executionStatus={backendExecutionStatus}
                  executionResult={backendExecutionResult}
                  isRunning={isBackendRunning}
                  canExecute={canExecuteBackend}
                  onRun={handleRun}
                  onStop={stopBackendExecution}
                  onClear={clearBackendOutput}
                  // Analysis
                  analysisResult={analysisResult}
                  isAnalyzing={isAnalyzing}
                  onAnalyze={analyze}
                  // Common
                  isCollapsed={isOutputPanelCollapsed}
                  onToggleCollapse={() => setIsOutputPanelCollapsed(!isOutputPanelCollapsed)}
                  onEnableCloud={handleEnableCloud}
                />
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          {/* Right Panel — always mounted so the handle is always in the DOM and
               above Monaco's scrollbar. Open/close is driven imperatively via
               rightPanelRef.collapse() / .resize(). */}
          <>
            <ResizableHandle withHandle />
            <ResizablePanel
              id="editor-right-panel"
              panelRef={rightPanelRef}
              defaultSize="28"
              minSize="20"
              maxSize="40"
              collapsible
              collapsedSize="0"
              onResize={(size) => {
                if (isProgrammaticResize.current) return;
                const pct = size.asPercentage;
                // Sync state when user drags the panel open or collapses it
                if (pct > 1 && !isRightPanelOpen) setIsRightPanelOpen(true);
                if (pct <= 1 && isRightPanelOpen) setIsRightPanelOpen(false);
              }}
            >
              <motion.div
                initial={false}
                animate={{ opacity: isRightPanelOpen ? 1 : 0, x: isRightPanelOpen ? 0 : 16 }}
                transition={{ duration: 0.18, ease: 'easeInOut' }}
                className="flex h-full flex-col overflow-hidden bg-card"
              >
                    {/* Panel Tabs */}
                    <div className="flex items-center justify-between border-b border-border px-3 py-2">
                      <div className="flex gap-1">
                        <Button
                          variant={rightPanelTab === 'ai' ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => setRightPanelTab('ai')}
                        >
                          <Bot className="h-3.5 w-3.5" />
                          AI
                        </Button>
                        <Button
                          variant={rightPanelTab === 'chat' ? 'secondary' : 'ghost'}
                          size="sm"
                          className="h-7 gap-1.5"
                          onClick={() => setRightPanelTab('chat')}
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                          Chat
                        </Button>
                      </div>
                      <div className="flex items-center gap-1">
                        {/* Clear conversation — only visible on AI tab when there are messages */}
                        {rightPanelTab === 'ai' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => aiPanelRef.current?.clearConversation()}
                            title="Clear conversation"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => setIsRightPanelOpen(false)}
                        >
                          <PanelRightClose className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Panel Content — flex-1 so it fills the remaining height */}
                    <div className="flex-1 overflow-hidden">
                      {rightPanelTab === 'ai' ? (
                        <AIAssistantPanel
                          ref={aiPanelRef}
                          code={content}
                          language={language}
                          selection={editorSelection || undefined}
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center">
                          <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
                          <div>
                            <p className="font-medium">Document Chat</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Collaborative chat coming in Phase 7
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
              </motion.div>
            </ResizablePanel>
          </>
        </ResizablePanelGroup>

      </div>

      {/* Template Picker */}
      <TemplatePicker
        isOpen={isTemplatePickerOpen}
        onClose={() => setIsTemplatePickerOpen(false)}
        onSelectTemplate={handleSelectTemplate}
        currentLanguage={language}
      />
    </AppLayout>
  );
}

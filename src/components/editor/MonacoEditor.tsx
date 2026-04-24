import { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, OnChange, Monaco, loader } from '@monaco-editor/react';
import { useTheme } from '@/contexts/ThemeContext';
import { languageConfigs } from '@/constants/languages';
import type { Language, UserPresence } from '@/types';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { MonacoBinding } from 'y-monaco';
import type * as Y from 'yjs';
import type { Awareness } from 'y-protocols/awareness';
import type { editor } from 'monaco-editor';
import * as monaco from 'monaco-editor';

interface MonacoEditorProps {
  value: string;
  language: Language;
  onChange?: (value: string) => void;
  onCursorChange?: (position: { lineNumber: number; column: number }, selection?: {
    startLineNumber: number;
    startColumn: number;
    endLineNumber: number;
    endColumn: number;
  }) => void;
  /** Called with the currently selected text whenever the selection changes. */
  onSelectionChange?: (selectedText: string) => void;
  collaborators?: UserPresence[];
  readOnly?: boolean;
  className?: string;
  // Yjs integration props
  yText?: Y.Text | null;
  awareness?: Awareness | null;
}

// Custom dark theme matching our design system
const defineCustomThemes = (monaco: Monaco) => {
  monaco.editor.defineTheme('lovable-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c586c0' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'type', foreground: '4ec9b0' },
      { token: 'function', foreground: 'dcdcaa' },
      { token: 'variable', foreground: '9cdcfe' },
      { token: 'constant', foreground: '4fc1ff' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#2d2d30',
      'editor.selectionBackground': '#6366f150',
      'editor.inactiveSelectionBackground': '#6366f130',
      'editorCursor.foreground': '#6366f1',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionHighlightBackground': '#6366f130',
      'editorIndentGuide.background': '#404040',
      'editorIndentGuide.activeBackground': '#707070',
      'editorBracketMatch.background': '#6366f130',
      'editorBracketMatch.border': '#6366f1',
      'scrollbarSlider.background': '#79797950',
      'scrollbarSlider.hoverBackground': '#79797980',
      'scrollbarSlider.activeBackground': '#bfbfbf66',
      'minimap.background': '#1e1e1e',
    },
  });

  monaco.editor.defineTheme('lovable-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'af00db' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type', foreground: '267f99' },
      { token: 'function', foreground: '795e26' },
      { token: 'variable', foreground: '001080' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f5f5f5',
      'editor.selectionBackground': '#6366f130',
      'editorCursor.foreground': '#6366f1',
      'editorLineNumber.foreground': '#999999',
      'editorLineNumber.activeForeground': '#333333',
    },
  });
};

export function MonacoEditor({
  value,
  language,
  onChange,
  onCursorChange,
  onSelectionChange,
  readOnly = false,
  className,
  yText,
  awareness,
}: MonacoEditorProps) {
  const { isDark } = useTheme();
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const remoteDecorationCollectionsRef = useRef<Map<number, editor.IEditorDecorationsCollection>>(new Map());
  const remoteDecorationsRafRef = useRef<number | null>(null);
  const localCursorRafRef = useRef<number | null>(null);
  const pendingLocalCursorRef = useRef<{ anchor: number; head: number } | null>(null);
  const editorDisposablesRef = useRef<monaco.IDisposable[]>([]);
  const modelCreatedRef = useRef<boolean>(false); // Track if we've already created the TSX model

  const monacoLanguage = languageConfigs[language]?.monacoLanguage || 'plaintext';

  // Get cursor color index (deterministic by clientId)
  const getCursorColorIndex = useCallback((clientId: number) => {
    const paletteSize = 8;
    return Math.abs(clientId) % paletteSize;
  }, []);

  // Schedule remote cursor rendering (RAF-coalesced to avoid re-entrancy)
  const scheduleRenderRemoteCursors = useCallback(() => {
    if (remoteDecorationsRafRef.current != null) return;
    remoteDecorationsRafRef.current = window.requestAnimationFrame(() => {
      remoteDecorationsRafRef.current = null;

      const editorInstance = editorRef.current;
      const awarenessInstance = awareness;
      if (!editorInstance || !awarenessInstance) return;
      const model = editorInstance.getModel();
      if (!model) return;

      const collections = remoteDecorationCollectionsRef.current;
      const seen = new Set<number>();

      const states = awarenessInstance.getStates();
      if (!states) return;

      states.forEach((state: any, clientId: number) => {
        if (clientId === awarenessInstance.clientID) return;
        const cursor = state?.cursor;
        if (!cursor || typeof cursor.position !== 'object') return;

        const displayName = (typeof state?.user?.name === 'string' && state.user.name.trim()) || `User ${clientId}`;
        const position = cursor.position;
        const selection = cursor.selection;

        seen.add(clientId);
        let collection = collections.get(clientId);
        if (!collection) {
          const created = editorInstance.createDecorationsCollection();
          collections.set(clientId, created);
          collection = created;
        }

        const colorIdx = getCursorColorIndex(clientId);

        // Selection decoration
        const decorations: any[] = [];
        if (selection) {
          decorations.push({
            range: new monacoRef.current!.Range(
              selection.startLineNumber,
              selection.startColumn,
              selection.endLineNumber,
              selection.endColumn
            ),
            options: {
              className: `yRemoteSelection yRemoteSelection--c${colorIdx}`,
              hoverMessage: [{ value: `**${displayName}**` }],
            },
          });
        }

        // Cursor decoration
        decorations.push({
          range: new monacoRef.current!.Range(
            position.lineNumber,
            position.column,
            position.lineNumber,
            position.column
          ),
          options: {
            beforeContentClassName: `yRemoteSelectionHead yRemoteSelectionHead--c${colorIdx}`,
            hoverMessage: [{ value: `**${displayName}**` }],
          },
        });

        collection.set(decorations);
      });

      // Dispose decorations for clients that disappeared
      const toDelete: number[] = [];
      collections.forEach((collection, clientId) => {
        if (seen.has(clientId)) return;
        try {
          collection.clear();
        } finally {
          toDelete.push(clientId);
        }
      });
      for (const clientId of toDelete) collections.delete(clientId);
    });
  }, [awareness, getCursorColorIndex]);

  // Schedule local cursor update (RAF-coalesced)
  const scheduleSetLocalCursor = useCallback((anchor: number, head: number) => {
    pendingLocalCursorRef.current = { anchor, head };
    if (localCursorRafRef.current != null) return;
    localCursorRafRef.current = window.requestAnimationFrame(() => {
      localCursorRafRef.current = null;
      const awarenessInstance = awareness;
      const pending = pendingLocalCursorRef.current;
      if (!awarenessInstance || !pending) return;
      awarenessInstance.setLocalStateField('cursor', pending);
      scheduleRenderRemoteCursors();
    });
  }, [awareness, scheduleRenderRemoteCursors]);

  // Bind Yjs to Monaco editor
  const bindYjsToEditor = useCallback(() => {
    if (!editorRef.current || !yText) {
      console.log('[MonacoEditor] bindYjsToEditor: skipping - editor or yText not available', {
        hasEditor: !!editorRef.current,
        hasYText: !!yText,
      });
      return;
    }
    const model = editorRef.current.getModel();
    if (!model) {
      console.log('[MonacoEditor] bindYjsToEditor: skipping - no model');
      return;
    }

    // Destroy existing binding
    if (bindingRef.current) {
      bindingRef.current.destroy();
      bindingRef.current = null;
    }

    // Set initial value from Yjs
    // IMPORTANT: Only sync if Yjs has content (length > 0) to avoid wiping loaded content
    const currentText = yText.toString();
    const modelValue = model.getValue();

    // CRITICAL: Set initial content BEFORE creating binding (like old CodeEditor)
    // BUT: Don't wipe model if Yjs is empty - Yjs might still be loading
    // Only sync if Yjs has content AND it's different from model
    if (currentText.length > 0 && modelValue !== currentText) {
      console.log('[MonacoEditor] bindYjsToEditor: Setting initial content from Yjs before binding', {
        yjsLength: currentText.length,
        modelLength: modelValue.length,
      });
      model.setValue(currentText);
    } else if (currentText.length === 0 && modelValue.length > 0) {
      // Yjs is empty but model has content - don't wipe it (Yjs might still be loading)
      console.log('[MonacoEditor] bindYjsToEditor: Yjs is empty, keeping model content (Yjs may still be loading)', {
        modelLength: modelValue.length,
      });
      // Don't call setValue - preserve existing model content
    }

    // Create new binding (without awareness to avoid re-entrancy issues)
    // MonacoBinding automatically syncs changes between Monaco and Yjs bidirectionally:
    // - Local Monaco edits -> Yjs -> doc.on('update') -> socket -> other users
    // - Remote Yjs updates -> Monaco (via binding)
    // IMPORTANT: The binding must be created AFTER the Yjs update handler is set up
    // (which happens in initYjsFromServer in useCollaboration.ts)
    bindingRef.current = new MonacoBinding(yText, model, new Set([editorRef.current]));

    // Verify the Y.Doc has update listeners (should be attached in initYjsFromServer)
    const yDoc = yText.doc;
    if (yDoc) {
      const listenerCount = (yDoc as any)._observers?.update?.length || 0;
      console.log('[MonacoEditor] bindYjsToEditor: ✅ MonacoBinding created', {
        yTextLength: yText.length,
        modelLength: model.getValueLength(),
        yDocUpdateListeners: listenerCount,
        yDocClientId: yDoc.clientID,
      });

      if (listenerCount === 0) {
        console.error('[MonacoEditor] ⚠️ WARNING: Y.Doc has NO update listeners! Updates will not be broadcast!');
        console.error('[MonacoEditor] This means yjsUpdateHandler was not attached in initYjsFromServer');
      }
    } else {
      console.warn('[MonacoEditor] bindYjsToEditor: yText.doc is null!');
    }
  }, [yText]);

  const handleEditorMount: OnMount = useCallback(async (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Configure TypeScript/TSX: full language service configuration (from CodeEditor.tsx)
    if (monacoLanguage === 'typescript' || language === 'typescript' || language === 'typescriptreact') {
      // In Monaco 0.55.1+, access TypeScript API via the typescript namespace
      const tsDefaults = (monaco as typeof monaco).typescript.typescriptDefaults;

      tsDefaults.setCompilerOptions({
        target: monaco.typescript.ScriptTarget.Latest,
        allowNonTsExtensions: true,
        moduleResolution: monaco.typescript.ModuleResolutionKind.NodeJs,
        module: monaco.typescript.ModuleKind.CommonJS,
        noEmit: true,
        esModuleInterop: true,
        jsx: monaco.typescript.JsxEmit.ReactJSX,
        reactNamespace: "React",
        allowJs: true,
        typeRoots: ["node_modules/@types", "src/@types"],
      });

      tsDefaults.setDiagnosticsOptions({
        noSemanticValidation: false,
        noSyntaxValidation: false,
      });

      // Load official React types with full documentation from CDN
      try {
        const reactResponse = await fetch('https://unpkg.com/@types/react@18.2.0/index.d.ts');
        const reactTypes = await reactResponse.text();
        tsDefaults.addExtraLib(reactTypes, "file:///node_modules/@types/react/index.d.ts");

        const reactDomResponse = await fetch('https://unpkg.com/@types/react-dom@18.2.0/index.d.ts');
        const reactDomTypes = await reactDomResponse.text();
        tsDefaults.addExtraLib(reactDomTypes, "file:///node_modules/@types/react-dom/index.d.ts");

        console.log('✅ Loaded official React types with documentation from CDN');
      } catch (error) {
        console.warn('⚠️ Could not load official React types, using fallback:', error);
        tsDefaults.addExtraLib(
          `declare module 'react' {
            export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
            export function useEffect(effect: () => void | (() => void), deps?: any[]): void;
            export = React;
            export as namespace React;
            declare namespace React {
              interface Component<P = {}, S = {}> {}
              interface FunctionComponent<P = {}> { (props: P): any; }
              type FC<P = {}> = FunctionComponent<P>;
            }
            declare global {
              namespace JSX {
                interface IntrinsicElements {
                  [elemName: string]: any;
                }
              }
            }
          }`,
          "file:///node_modules/@types/react/index.d.ts"
        );
      }

      tsDefaults.addExtraLib(
        `declare module 'react/jsx-runtime' {
          export function jsx(type: any, props: any, key?: any): any;
          export function jsxs(type: any, props: any, key?: any): any;
          export function Fragment(props: { children?: any }): any;
        }`,
        "file:///node_modules/@types/react/jsx-runtime.d.ts"
      );

      // Create model with proper URI for TSX support (only if model doesn't exist or needs updating)
      const currentModel = editor.getModel();
      const expectedUri = monaco.Uri.file('App.tsx').toString();

      // CRITICAL: Prevent creating a new model if one already exists with content (prevents wiping Yjs content)
      // This can happen in React StrictMode where handleEditorMount is called multiple times
      if (!currentModel && !modelCreatedRef.current) {
        // No model exists and we haven't created one yet - create one with Yjs content if available, otherwise value prop
        // CRITICAL: Prioritize Yjs content, but don't use empty Yjs if value prop has content
        const yjsContent = yText ? yText.toString() : '';
        const valueContent = value || '';
        const initialContent = (yjsContent.length > 0)
          ? yjsContent
          : (valueContent.length > 0 ? valueContent : '');
        const model = monaco.editor.createModel(initialContent, "typescript", monaco.Uri.file('App.tsx'));
        editor.setModel(model);
        modelCreatedRef.current = true;
        console.log('🔧 Created TypeScript model with .tsx URI for proper TSX support', {
          contentLength: initialContent.length,
          fromYjs: yjsContent.length > 0,
          fromValue: yjsContent.length === 0 && valueContent.length > 0,
        });
      } else if (currentModel && currentModel.uri.toString() !== expectedUri && !modelCreatedRef.current) {
        // Model exists but has wrong URI - need to replace it
        // CRITICAL: If model already has content, preserve it (Yjs might have synced already)
        const existingContent = currentModel.getValue();
        const yjsContent = yText ? yText.toString() : '';

        // CRITICAL: Preserve existing content if it exists (don't wipe it)
        // Only use Yjs content if model is empty AND Yjs has content
        // If both are empty, use empty string (new document)
        const initialContent = (existingContent.length > 0)
          ? existingContent
          : (yjsContent.length > 0 ? yjsContent : (value || ''));

        const model = monaco.editor.createModel(initialContent, "typescript", monaco.Uri.file('App.tsx'));
        editor.setModel(model);
        modelCreatedRef.current = true;
        console.log('🔧 Replaced model with TypeScript .tsx URI', {
          contentLength: initialContent.length,
          fromYjs: yjsContent.length > 0 && existingContent.length === 0,
          preservedExisting: existingContent.length > 0,
          fromValue: existingContent.length === 0 && yjsContent.length === 0 && (value || '').length > 0,
        });
      } else if (currentModel && currentModel.uri.toString() === expectedUri) {
        // Model already exists with correct URI
        // DO NOT replace it - just sync content if Yjs has content and model is empty
        // If model already has content, bindYjsToEditor will handle syncing
        modelCreatedRef.current = true; // Mark as created to prevent re-creation
        if (yText) {
          const yjsContent = yText.toString();
          const modelContent = currentModel.getValue();
          // CRITICAL: Only sync if Yjs has content AND model is empty (initial state)
          // If model has content, DON'T overwrite it - bindYjsToEditor will handle syncing
          // This prevents wiping content when Yjs is still loading
          if (yjsContent.length > 0 && modelContent.length === 0) {
            console.log('[MonacoEditor] Syncing empty model with Yjs content', {
              yjsLength: yjsContent.length,
            });
            currentModel.setValue(yjsContent);
          } else if (yjsContent.length === 0 && modelContent.length > 0) {
            // Yjs is empty but model has content - don't wipe it (Yjs might still be loading)
            console.log('[MonacoEditor] Yjs is empty, preserving model content (Yjs may still be loading)', {
              modelLength: modelContent.length,
            });
          }
        }
      }
    }

    // Define custom themes
    defineCustomThemes(monaco);
    monaco.editor.setTheme(isDark ? 'lovable-dark' : 'lovable-light');

    // Configure editor options
    editor.updateOptions({
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",
      fontSize: 14,
      lineHeight: 22,
      fontLigatures: true,
      minimap: {
        enabled: true,
        scale: 1,
        showSlider: 'mouseover',
      },
      scrollbar: {
        vertical: 'visible',
        horizontal: 'visible',
        verticalScrollbarSize: 10,
        horizontalScrollbarSize: 10,
      },
      padding: { top: 16, bottom: 16 },
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      folding: true,
      foldingHighlight: true,
      suggest: {
        showMethods: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showKeywords: true,
        showWords: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true,
        showSnippets: true,
      },
    });

    // Track cursor position changes
    const cursorChangeDisposable = editor.onDidChangeCursorPosition((e) => {
      const selection = editor.getSelection();
      if (onCursorChange) {
        if (selection && !selection.isEmpty()) {
          onCursorChange(e.position, {
            startLineNumber: selection.startLineNumber,
            startColumn: selection.startColumn,
            endLineNumber: selection.endLineNumber,
            endColumn: selection.endColumn,
          });
        } else {
          onCursorChange(e.position);
        }
      }
      // Report selected text so the AI panel can use it as context
      if (onSelectionChange) {
        const selectedText = selection && !selection.isEmpty()
          ? (editor.getModel()?.getValueInRange(selection) ?? '')
          : '';
        onSelectionChange(selectedText);
      }

      // Publish cursor to awareness (convert Monaco position to Yjs offset)
      if (awareness) {
        const currentModel = editor.getModel();
        const selection = editor.getSelection();
        if (currentModel && selection) {
          const anchor = currentModel.getOffsetAt({
            lineNumber: selection.startLineNumber,
            column: selection.startColumn,
          });
          const head = currentModel.getOffsetAt({
            lineNumber: selection.endLineNumber,
            column: selection.endColumn,
          });
          scheduleSetLocalCursor(anchor, head);
        }
      }
    });
    editorDisposablesRef.current.push(cursorChangeDisposable);

    // Track selection changes
    const selectionChangeDisposable = editor.onDidChangeCursorSelection((e) => {
      if (awareness) {
        const currentModel = editor.getModel();
        const selection = e.selection;
        if (currentModel) {
          const anchor = currentModel.getOffsetAt({
            lineNumber: selection.startLineNumber,
            column: selection.startColumn,
          });
          const head = currentModel.getOffsetAt({
            lineNumber: selection.endLineNumber,
            column: selection.endColumn,
          });
          scheduleSetLocalCursor(anchor, head);
        }
      }
    });
    editorDisposablesRef.current.push(selectionChangeDisposable);

    // Bind Yjs if available (after model is set)
    // Use setTimeout to ensure model is fully set before binding
    if (yText) {
      setTimeout(() => {
        bindYjsToEditor();
      }, 0);
    }

    // Focus the editor
    editor.focus();
  }, [isDark, onCursorChange, onSelectionChange, awareness, yText, bindYjsToEditor, scheduleSetLocalCursor]);

  const handleEditorChange: OnChange = useCallback((value) => {
    if (onChange && value !== undefined) {
      onChange(value);
    }
  }, [onChange]);

  // Update theme when dark mode changes - use loader.init() to get Monaco instance directly
  useEffect(() => {
    const themeName = isDark ? 'lovable-dark' : 'lovable-light';

    // Use the loader to get the Monaco instance - this is more reliable than refs
    loader.init().then((monaco) => {
      // Ensure custom themes are defined
      defineCustomThemes(monaco);
      // Set the theme globally for all editors
      monaco.editor.setTheme(themeName);
    });
  }, [isDark]);

  // Bind Yjs when yText becomes available
  useEffect(() => {
    if (yText && editorRef.current) {
      bindYjsToEditor();
    }
  }, [yText, bindYjsToEditor]);

  // Render remote cursors from awareness (RAF-coalesced)
  useEffect(() => {
    if (!awareness) return;

    const awarenessRenderHandler = () => {
      scheduleRenderRemoteCursors();
    };

    awareness.on('update', awarenessRenderHandler);
    scheduleRenderRemoteCursors();

    return () => {
      awareness.off('update', awarenessRenderHandler);
    };
  }, [awareness, scheduleRenderRemoteCursors]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup binding
      bindingRef.current?.destroy();
      bindingRef.current = null;

      // Cleanup editor disposables
      for (const d of editorDisposablesRef.current) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      editorDisposablesRef.current = [];

      // Cleanup remote decorations
      remoteDecorationCollectionsRef.current.forEach((collection) => {
        try {
          collection.clear();
        } catch {
          // ignore
        }
      });
      remoteDecorationCollectionsRef.current.clear();

      if (remoteDecorationsRafRef.current != null) {
        window.cancelAnimationFrame(remoteDecorationsRafRef.current);
        remoteDecorationsRafRef.current = null;
      }
      if (localCursorRafRef.current != null) {
        window.cancelAnimationFrame(localCursorRafRef.current);
        localCursorRafRef.current = null;
      }
      pendingLocalCursorRef.current = null;
    };
  }, []);

  return (
    <div className={cn("relative h-full w-full overflow-hidden", className)}>
      <Editor
        height="100%"
        language={monacoLanguage}
        value={yText ? undefined : value}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        theme={isDark ? 'lovable-dark' : 'lovable-light'}
        options={{
          readOnly,
          automaticLayout: true,
        }}
        loading={
          <div className="flex h-full w-full flex-col gap-2 bg-editor-bg p-4">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        }
      />

      {/* Inject styles for remote cursors */}
      <style>{`
        .remote-cursor {
          border-left: 2px solid var(--cursor-color, #10b981);
          animation: cursor-blink 1s ease-in-out infinite;
        }
        .remote-cursor-line {
          background-color: var(--cursor-color, #10b981);
          width: 2px !important;
          margin-left: -1px;
        }
        .remote-selection {
          background-color: var(--selection-color, rgba(16, 185, 129, 0.3));
        }
        @keyframes cursor-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

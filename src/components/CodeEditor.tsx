import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
// PREVIOUS IMPLEMENTATION (commented out):
// - Imported a singleton `socket` that auto-connected and emitted full-text updates.
//
// Reason for change:
// - Backend now requires Clerk JWT during socket handshake, and collaboration now uses binary Yjs updates instead of whole strings.
// import { socket } from '../services/socket';
import { disconnectSocket, getSocket } from '../services/socket';
import { Button, AppBar, Toolbar, Typography, Box, IconButton, Paper, Select, MenuItem, FormControl } from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CloseIcon from '@mui/icons-material/Close';
import Editor, { OnMount } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import * as monaco from 'monaco-editor';
import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { MonacoBinding } from 'y-monaco';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';
import Chat from './Chat';
import { apiUrl } from '../config/backend';

// Language definitions with syntax highlighting
const SUPPORTED_LANGUAGES = {
  javascript: {
    name: 'JavaScript',
    extension: '.js',
    monacoLanguage: 'javascript',
    icon: '⚡'
  },
  typescript: {
    name: 'TypeScript',
    extension: '.ts',
    monacoLanguage: 'typescript',
    icon: '🔷'
  },
  tsx: {
    name: 'TypeScript React',
    extension: '.tsx',
    monacoLanguage: 'typescript',
    icon: '⚛️'
  },
  java: {
    name: 'Java',
    extension: '.java',
    monacoLanguage: 'java',
    icon: '☕'
  },
  python: {
    name: 'Python',
    extension: '.py',
    monacoLanguage: 'python',
    icon: '🐍'
  }
};

// Code template definitions (VS Code style) - Language-specific
const CODE_TEMPLATES = {
  blank: {
    name: 'Blank File',
    description: 'Start with an empty file',
    languages: ['javascript', 'typescript', 'tsx', 'java', 'python'],
    content: ''
  },
  // JavaScript/TypeScript Templates
  reactComponent: {
    name: 'React Component',
    description: 'Basic React functional component',
    languages: ['javascript', 'typescript', 'tsx'],
    content: `import React from 'react';

interface ComponentNameProps {
  prop: string;
}

const ComponentName: React.FC<ComponentNameProps> = ({ prop }) => {
  return (
    <div>
      <h1>{prop}</h1>
    </div>
  );
};

export default ComponentName;
`
  },
  reactTSXComponent: {
    name: 'React TSX Component',
    description: 'TypeScript React component with JSX',
    languages: ['tsx'],
    content: `import React, { useState, useEffect } from 'react';

interface ComponentNameProps {
  title: string;
  initialCount?: number;
}

const ComponentName: React.FC<ComponentNameProps> = ({ 
  title, 
  initialCount = 0 
}) => {
  const [count, setCount] = useState<number>(initialCount);

  useEffect(() => {
    console.log('Component mounted');
    return () => {
      console.log('Component unmounted');
    };
  }, []);

  const handleIncrement = (): void => {
    setCount(prev => prev + 1);
  };

  return (
    <div className="component">
      <h1>{title}</h1>
      <p>Count: {count}</p>
      <button onClick={handleIncrement}>
        Increment
      </button>
    </div>
  );
};

export default ComponentName;
`
  },
  reactHook: {
    name: 'React Hook',
    description: 'Custom React hook template',
    languages: ['javascript', 'typescript', 'tsx'],
    content: `import { useState, useEffect } from 'react';

const useHookName = (initialValue: any) => {
  const [state, setState] = useState(initialValue);

  useEffect(() => {
    // Effect logic here
    return () => {
      // Cleanup logic here
    };
  }, [state]);

  return { state, setState };
};

export default useHookName;
`
  },
  expressRoute: {
    name: 'Express Route',
    description: 'Express.js API route handler',
    languages: ['javascript', 'typescript'],
    content: `import express from 'express';
const router = express.Router();

// GET /api/endpoint
router.get('/api/endpoint', async (req, res) => {
  try {
    const { param } = req.params;
    
    // Your logic here
    const result = await someFunction(param);
    
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
`
  },
  nodeClass: {
    name: 'Node.js Class',
    description: 'ES6 class with methods',
    languages: ['javascript', 'typescript'],
    content: `class ClassName {
  constructor(param) {
    this.param = param;
    this.property = null;
  }

  async methodName() {
    try {
      // Method logic here
      const result = await this.processData();
      return result;
    } catch (error) {
      throw new Error(\`ClassName methodName failed: \${error.message}\`);
    }
  }

  processData() {
    // Process data logic
    return Promise.resolve(this.param);
  }
}

export default ClassName;
`
  },
  typescriptInterface: {
    name: 'TypeScript Interface',
    description: 'TypeScript interface with generics',
    languages: ['typescript'],
    content: `interface InterfaceName<T = any> {
  id: string;
  name: string;
  data: T;
  createdAt: Date;
  updatedAt: Date;
}

interface CreateRequest {
  name: string;
  data: any;
}

interface UpdateRequest extends Partial<CreateRequest> {
  id: string;
}

export type { InterfaceName, CreateRequest, UpdateRequest };
`
  },
  asyncFunction: {
    name: 'Async Function',
    description: 'Async/await function with error handling',
    languages: ['javascript', 'typescript'],
    content: `const functionName = async (param: string): Promise<ReturnType> => {
  try {
    // Validate input
    if (!param) {
      throw new Error('param is required');
    }

    // Main logic here
    const result = await someAsyncOperation(param);
    
    // Process result
    const processed = await processResult(result);
    
    return processed;
  } catch (error) {
    console.error('Error in functionName:', error);
    throw new Error(\`functionName failed: \${error.message}\`);
  }
};

export default functionName;
`
  },
  testFile: {
    name: 'Test File',
    description: 'Jest test file template',
    languages: ['javascript', 'typescript'],
    content: `import { functionName } from '../modulePath';

describe('functionName', () => {
  beforeEach(() => {
    // Setup before each test
  });

  it('should expectedBehavior', () => {
    // Arrange
    const input = 'testInput';
    const expected = 'expectedOutput';

    // Act
    const result = functionName(input);

    // Assert
    expect(result).toBe(expected);
  });
});
`
  },

  // TypeScript React Best Practices
  typescriptReact: {
    name: 'TypeScript React Best Practices',
    description: 'TypeScript React component with proper typing',
    languages: ['typescript'],
    content: `import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Props interface
interface ComponentProps {
  title: string;
  count?: number;
  onUpdate?: (value: string) => void;
  children?: React.ReactNode;
}

// State interface
interface ComponentState {
  inputValue: string;
  isLoading: boolean;
  error: string | null;
}

// Event handler types
type InputChangeHandler = (event: React.ChangeEvent<HTMLInputElement>) => void;
type ButtonClickHandler = (event: React.MouseEvent<HTMLButtonElement>) => void;

const ComponentName: React.FC<ComponentProps> = ({ 
  title, 
  count = 0, 
  onUpdate, 
  children 
}) => {
  // State with proper typing
  const [state, setState] = useState<ComponentState>({
    inputValue: '',
    isLoading: false,
    error: null
  });

  // Memoized value
  const displayValue = useMemo(() => {
    return \`\${title}: \${count}\`;
  }, [title, count]);

  // Event handlers with proper typing
  const handleInputChange: InputChangeHandler = useCallback((event) => {
    const value = event.target.value;
    setState(prev => ({ ...prev, inputValue: value }));
  }, []);

  const handleButtonClick: ButtonClickHandler = useCallback((event) => {
    event.preventDefault();
    if (onUpdate && state.inputValue.trim()) {
      onUpdate(state.inputValue.trim());
      setState(prev => ({ ...prev, inputValue: '' }));
    }
  }, [onUpdate, state.inputValue]);

  // Effect with cleanup
  useEffect(() => {
    if (state.inputValue.length > 100) {
      setState(prev => ({ ...prev, error: 'Input too long' }));
    } else {
      setState(prev => ({ ...prev, error: null }));
    }
  }, [state.inputValue]);

  // Always return JSX, never boolean or other types
  return (
    <div className="component">
      <h1>{displayValue}</h1>
      
      <div className="input-section">
        <input
          type="text"
          value={state.inputValue}
          onChange={handleInputChange}
          placeholder="Enter value..."
          disabled={state.isLoading}
        />
        
        {state.error && (
          <p className="error">{state.error}</p>
        )}
        
        <button 
          onClick={handleButtonClick}
          disabled={!state.inputValue.trim() || state.isLoading}
        >
          {state.isLoading ? 'Updating...' : 'Update'}
        </button>
      </div>
      
      {children && (
        <div className="children">
          {children}
        </div>
      )}
    </div>
  );
};

export default ComponentName;
`
  },
  // Java Templates
  javaClass: {
    name: 'Java Class',
    description: 'Basic Java class with main method',
    languages: ['java'],
    content: `public class ClassName {
    private String name;
    private int value;
    
    public ClassName(String name, int value) {
        this.name = name;
        this.value = value;
    }
    
    public String getName() {
        return name;
    }
    
    public void setName(String name) {
        this.name = name;
    }
    
    public int getValue() {
        return value;
    }
    
    public void setValue(int value) {
        this.value = value;
    }
    
    @Override
    public String toString() {
        return "ClassName{" +
                "name='" + name + '\\'' +
                ", value=" + value +
                '}';
    }
    
    public static void main(String[] args) {
        ClassName obj = new ClassName("Example", 42);
        System.out.println(obj);
    }
}`
  },
  javaInterface: {
    name: 'Java Interface',
    description: 'Java interface with default methods',
    languages: ['java'],
    content: `public interface InterfaceName {
    // Constants
    String DEFAULT_NAME = "Default";
    
    // Abstract methods
    void doSomething();
    String getValue();
    
    // Default method (Java 8+)
    default void defaultMethod() {
        System.out.println("Default implementation");
    }
    
    // Static method (Java 8+)
    static void staticMethod() {
        System.out.println("Static method in interface");
    }
}`
  },
  javaMain: {
    name: 'Java Main Class',
    description: 'Java application entry point',
    languages: ['java'],
    content: `import java.util.Scanner;

public class Main {
    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        
        System.out.println("Welcome to the application!");
        System.out.print("Enter your name: ");
        String name = scanner.nextLine();
        
        System.out.println("Hello, " + name + "!");
        
        // Your application logic here
        
        scanner.close();
    }
}`
  },
  // Python Templates
  pythonClass: {
    name: 'Python Class',
    description: 'Python class with methods',
    languages: ['python'],
    content: `class ClassName:
    def __init__(self, name: str, value: int):
        self.name = name
        self.value = value
    
    def get_name(self) -> str:
        return self.name
    
    def set_name(self, name: str) -> None:
        self.name = name
    
    def get_value(self) -> int:
        return self.value
    
    def set_value(self, value: int) -> None:
        self.value = value
    
    def __str__(self) -> str:
        return f"ClassName(name='{self.name}', value={self.value})"
    
    def __repr__(self) -> str:
        return self.__str__()


if __name__ == "__main__":
    obj = ClassName("Example", 42)
    print(obj)`
  },
  pythonFunction: {
    name: 'Python Function',
    description: 'Python function with type hints',
    languages: ['python'],
    content: `from typing import List, Optional, Union
import logging

def function_name(param1: str, param2: int, param3: Optional[List[str]] = None) -> Union[str, None]:
    """
    Function description.
    
    Args:
        param1: Description of param1
        param2: Description of param2
        param3: Optional list of strings
        
    Returns:
        String or None
        
    Raises:
        ValueError: If parameters are invalid
    """
    try:
        # Validate input
        if not param1 or param2 < 0:
            raise ValueError("Invalid parameters")
        
        # Main logic here
        result = param1 * param2
        
        # Process optional parameter
        if param3:
            result += " with " + ", ".join(param3)
        
        return result
        
    except Exception as e:
        logging.error(f"Error in function_name: {e}")
        return None


if __name__ == "__main__":
    # Example usage
    result = function_name("test", 3, ["a", "b", "c"])
    print(result)`
  },
  pythonMain: {
    name: 'Python Main',
    description: 'Python application entry point',
    languages: ['python'],
    content: `#!/usr/bin/env python3
"""
Main application module.
"""

import sys
import argparse
from typing import List


def main(args: List[str]) -> int:
    """
    Main function.
    
    Args:
        args: Command line arguments
        
    Returns:
        Exit code
    """
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser(description="Application description")
        parser.add_argument("--input", "-i", help="Input file")
        parser.add_argument("--output", "-o", help="Output file")
        
        parsed_args = parser.parse_args(args)
        
        # Your application logic here
        print("Application started successfully!")
        
        if parsed_args.input:
            print(f"Processing input: {parsed_args.input}")
        
        if parsed_args.output:
            print(f"Output will be saved to: {parsed_args.output}")
        
        return 0
        
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))`
  },
  // HTML Template (Universal)
  htmlTemplate: {
    name: 'HTML Template',
    description: 'HTML5 boilerplate with meta tags',
    languages: ['javascript', 'typescript', 'tsx', 'java', 'python'],
    content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Page Title</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header>
    <h1>Page Title</h1>
  </header>

  <main>
    <section>
      <h2>Welcome</h2>
      <p>Your content here</p>
    </section>
  </main>

  <script src="script.js"></script>
</body>
</html>`
  }
};

interface CursorPosition {
  userId: string;
  userName: string;
  position: {
    lineNumber: number;
    column: number;
  };
  color: string;
  timestamp: number;
}

const CodeEditor: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  // PREVIOUS IMPLEMENTATION (commented out):
  // const { token } = useAuth();
  //
  // Reason for change:
  // - With Clerk, the UI can be "signed in" while the session token is still being fetched/rotated asynchronously.
  // PREVIOUS IMPLEMENTATION (commented out):
  // const { token, isAuthenticated } = useAuth();
  //
  // Reason for change:
  // - On hard refresh, Clerk takes a moment to hydrate; during that time `isAuthenticated` can be false.
  //   We must wait for `isLoaded` before redirecting to /login, otherwise you see intermittent redirects.
  const { token, isAuthenticated, isLoaded } = useAuth();
  const [searchParams] = useSearchParams();
  const linkToken = searchParams.get('token');

  // PREVIOUS IMPLEMENTATION (commented out):
  // - Seeded the editor with a hard-coded TSX template in local state.
  //
  // Reason for change:
  // - The document's initial content should come from the persisted Yjs state (Postgres update log + optional B2 snapshot).
  //   Seeding local content can race with Yjs binding and accidentally overwrite the persisted template on refresh.
  //
  // const defaultTSXContent = `import React, { useState } from 'react';
  // interface Props { title: string; }
  // const MyComponent: React.FC<Props> = ({ title }) => { ... };
  // export default MyComponent;`;
  // const [content, setContent] = useState(defaultTSXContent);

  // Core state (derived from Yjs once `doc-init` arrives)
  const [content, setContent] = useState('');
  const [otherCursors, setOtherCursors] = useState<CursorPosition[]>([]);
  const [activeUsers, setActiveUsers] = useState<string[]>([]);
  const [lastSyncTime, setLastSyncTime] = useState<number>(Date.now());
  const [userCount, setUserCount] = useState<number>(0);

  // Performance monitoring (minimal)
  const [updateCount, setUpdateCount] = useState<number>(0);

  // Chat functionality
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);

  // Template system
  const [selectedTemplate, setSelectedTemplate] = useState<string>('blank');
  const [showTemplateSelector, setShowTemplateSelector] = useState<boolean>(false);

  // Language support
  const [selectedLanguage, setSelectedLanguage] = useState<keyof typeof SUPPORTED_LANGUAGES>('tsx');

  // Refs
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const uniqueUserId = useRef<string>('');
  const lastSavedContent = useRef<string>('');
  const isUpdatingFromSocket = useRef<boolean>(false);
  const socketRef = useRef<Socket | null>(null);
  const yDocRef = useRef<Y.Doc | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  // Production-grade cursor rendering + event management:
  // - We DO NOT rely on y-monaco's awareness/decoration integration because Monaco 0.55+ throws
  //   "Invoking deltaDecorations recursively..." when decorations are updated re-entrantly during cursor events.
  // - Instead, we render remote cursors ourselves via `createDecorationsCollection()` and schedule updates
  //   onto the next animation frame to avoid re-entrancy and decoration leaks.
  const editorDisposablesRef = useRef<monaco.IDisposable[]>([]);
  const remoteDecorationCollectionsRef = useRef<
    Map<number, editor.IEditorDecorationsCollection>
  >(new Map());
  const remoteDecorationsRafRef = useRef<number | null>(null);
  const localCursorRafRef = useRef<number | null>(null);
  const pendingLocalCursorRef = useRef<{ anchor: number; head: number } | null>(null);
  const pendingInitRef = useRef<any>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const editorReadyRef = useRef<boolean>(false);
  const [docStatus, setDocStatus] = useState<'idle' | 'connecting' | 'waiting_init' | 'ready' | 'error'>('idle');
  const [docError, setDocError] = useState<string | null>(null);
  const authLoadTimeoutRef = useRef<number | null>(null);
  const localAwarenessSetRef = useRef<boolean>(false);
  const awarenessUpdateHandlerRef = useRef<((changes: any, origin: any) => void) | null>(null);
  const awarenessRenderHandlerRef = useRef<((changes: any, origin: any) => void) | null>(null);

  const getCursorColorIndex = useCallback((clientId: number) => {
    // Keep it deterministic and stable across sessions.
    // (We can evolve this later to use a user-chosen color stored in the DB.)
    const paletteSize = 8;
    return Math.abs(clientId) % paletteSize;
  }, []);

  const scheduleRenderRemoteCursors = useCallback(() => {
    if (remoteDecorationsRafRef.current != null) return;
    remoteDecorationsRafRef.current = window.requestAnimationFrame(() => {
      remoteDecorationsRafRef.current = null;

      const editorInstance = editorRef.current;
      const awareness = awarenessRef.current;
      if (!editorInstance || !awareness) return;
      const model = editorInstance.getModel?.();
      if (!model) return;

      const collections = remoteDecorationCollectionsRef.current;
      const seen = new Set<number>();

      const states = awareness.getStates?.();
      if (!states) return;

      states.forEach((state: any, clientId: number) => {
        if (clientId === awareness.clientID) return;
        const cursor = state?.cursor;
        if (!cursor || typeof cursor.anchor !== 'number' || typeof cursor.head !== 'number') return;

        const displayName =
          (typeof state?.user?.name === 'string' && state.user.name.trim()) || `User ${clientId}`;

        // Validate offsets defensively.
        const len = model.getValueLength();
        const anchor = Math.max(0, Math.min(len, cursor.anchor));
        const head = Math.max(0, Math.min(len, cursor.head));

        seen.add(clientId);
        let collection = collections.get(clientId);
        if (!collection) {
          const created = (editorInstance as editor.IStandaloneCodeEditor).createDecorationsCollection();
          collections.set(clientId, created);
          collection = created;
        }

        const startOffset = Math.min(anchor, head);
        const endOffset = Math.max(anchor, head);

        const startPos = model.getPositionAt(startOffset);
        const endPos = model.getPositionAt(endOffset);
        const headPos = model.getPositionAt(head);

        const colorIdx = getCursorColorIndex(clientId);

        const selectionRange = new monaco.Range(
          startPos.lineNumber,
          startPos.column,
          endPos.lineNumber,
          endPos.column
        );
        const caretRange = new monaco.Range(
          headPos.lineNumber,
          headPos.column,
          headPos.lineNumber,
          headPos.column
        );

        collection.set([
          {
            range: selectionRange,
            options: {
              className: `yRemoteSelection yRemoteSelection--c${colorIdx}`,
              // Hover tooltip: show who this cursor belongs to.
              hoverMessage: [{ value: `**${displayName}**` }],
            },
          },
          {
            range: caretRange,
            options: {
              // Use beforeContentClassName so a 0-length range still renders a caret.
              beforeContentClassName: `yRemoteSelectionHead yRemoteSelectionHead--c${colorIdx}`,
              hoverMessage: [{ value: `**${displayName}**` }],
            },
          },
        ]);
      });

      // Dispose decorations for clients that disappeared.
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
  }, [getCursorColorIndex]);

  const scheduleSetLocalCursor = useCallback((anchor: number, head: number) => {
    pendingLocalCursorRef.current = { anchor, head };
    if (localCursorRafRef.current != null) return;
    localCursorRafRef.current = window.requestAnimationFrame(() => {
      localCursorRafRef.current = null;
      const awareness = awarenessRef.current;
      const pending = pendingLocalCursorRef.current;
      if (!awareness || !pending) return;
      awareness.setLocalStateField('cursor', pending);
      // Remote cursors are rendered from awareness state changes.
      scheduleRenderRemoteCursors();
    });
  }, [scheduleRenderRemoteCursors]);

  const bindYjsToEditor = useCallback(() => {
    if (!editorRef.current) return;
    const model = editorRef.current.getModel?.();
    if (!model) return;
    if (!yDocRef.current) return;

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Binding was created once during `doc-init`, but Monaco later replaced the model (createModel/setModel).
    //
    // Reason for change:
    // - Re-binding against the *current* Monaco model ensures local edits emit Yjs updates and remote updates render.
    //
    // bindingRef.current = new MonacoBinding(yText, model, new Set([editorRef.current]), awarenessRef.current);

    bindingRef.current?.destroy();
    bindingRef.current = null;

    const yText = yDocRef.current.getText('content');
    model.setValue(yText.toString());
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Passed `awareness` into MonacoBinding so y-monaco would render remote selections/carets.
    //
    // Reason for change (production fix):
    // - With Monaco 0.55.1, y-monaco can trigger decoration updates (deltaDecorations) re-entrantly during cursor events,
    //   causing: "Invoking deltaDecorations recursively could lead to leaking decorations."
    // - We keep y-monaco ONLY for text binding, and we render awareness cursors ourselves via DecorationsCollection + RAF scheduling.
    //
    // bindingRef.current = new MonacoBinding(
    //   yText,
    //   model,
    //   new Set([editorRef.current]),
    //   awarenessRef.current
    // );
    bindingRef.current = new MonacoBinding(yText, model, new Set([editorRef.current]));
  }, []);

  // Template selection handler
  const handleTemplateSelect = useCallback((templateKey: string) => {
    const template = CODE_TEMPLATES[templateKey as keyof typeof CODE_TEMPLATES];
    if (template && editorRef.current) {
      setContent(template.content);
      editorRef.current.setValue(template.content);
      lastSavedContent.current = template.content;
      setSelectedTemplate(templateKey);
      setShowTemplateSelector(false);

      // PREVIOUS IMPLEMENTATION (commented out):
      // - Broadcast the entire file content via `update-document`.
      //
      // Reason for change:
      // - We now rely on Monaco <-> Yjs binding; setting the model value produces Yjs updates which are broadcast/persisted.
      //
      // if (socket.connected && id) {
      //   socket.emit('update-document', { documentId: id, content: template.content, userId: uniqueUserId.current });
      // }
    }
  }, [id]);

  // Editor change handler - Working Monaco pattern
  const handleEditorChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);

      // PREVIOUS IMPLEMENTATION (commented out):
      // - Sent full content strings on every keystroke.
      //
      // Reason for change:
      // - Yjs emits compact binary updates and preserves correct concurrency; we send those updates instead.
      //
      // if (socket.connected && !isUpdatingFromSocket.current) {
      //   socket.emit('update-document', { documentId: id, content: value, userId: uniqueUserId.current });
      //   lastSavedContent.current = value;
      // }
    }
  }, [id]);

  // Language change handler
  const handleLanguageChange = useCallback((newLanguage: keyof typeof SUPPORTED_LANGUAGES) => {
    const newMonacoLanguage = SUPPORTED_LANGUAGES[newLanguage]?.monacoLanguage || 'javascript';
    console.log(`🔄 Switching to: ${SUPPORTED_LANGUAGES[newLanguage]?.name} (${newMonacoLanguage})`);
    setSelectedLanguage(newLanguage);

    // Force Monaco to recognize the language change
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        monacoRef.current.editor.setModelLanguage(model, newMonacoLanguage);

        // For TSX files, ensure TypeScript language service is properly configured
        if (newLanguage === 'tsx') {
          setTimeout(() => {
            monacoRef.current.editor.setModelLanguage(model, 'typescript');
            console.log('🔧 Re-applied TypeScript language for TSX after language change');
          }, 50);
        }
      }
    }

    // Load language-specific template if available
    const template = CODE_TEMPLATES.blank;
    if (template && template.content !== content) {
      setContent(template.content);
    }
  }, [content]);

  // Initialize user ID
  useEffect(() => {
    if (!uniqueUserId.current) {
      uniqueUserId.current = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    // Reset the flag on mount to ensure it's not stuck
    isUpdatingFromSocket.current = false;
    console.log('🔄 Reset isUpdatingFromSocket flag to false');
  }, []);

  const initYjsFromServer = useCallback((init: any) => {
    if (!id) return;
    if (!init || init.documentId !== id) return;
    if (!socketRef.current) return;

    const toUint8 = (val: any): Uint8Array => {
      if (!val) return new Uint8Array();
      // socket.io may deliver ArrayBuffer, Uint8Array, or { type: 'Buffer', data: number[] }
      if (val instanceof ArrayBuffer) return new Uint8Array(val);
      if (val instanceof Uint8Array) return val;
      if (val?.type === 'Buffer' && Array.isArray(val.data)) return new Uint8Array(val.data);
      return new Uint8Array(val);
    };

    // Tear down previous bindings (if switching docs or reconnecting)
    bindingRef.current?.destroy();
    bindingRef.current = null;
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Set `awarenessRef.current = null` before destroying the Y.Doc.
    //
    // Reason for change:
    // - Awareness emits an update during destroy; our awareness handler referenced `awarenessRef.current` and crashed.
    // awarenessRef.current = null;
    // yDocRef.current?.destroy();
    // yDocRef.current = null;

    if (awarenessRef.current && awarenessUpdateHandlerRef.current) {
      awarenessRef.current.off('update', awarenessUpdateHandlerRef.current);
      awarenessUpdateHandlerRef.current = null;
    }
    awarenessRef.current = null;
    yDocRef.current?.destroy();
    yDocRef.current = null;

    const doc = new Y.Doc();
    const yText = doc.getText('content');

    // Apply snapshot (future) then replay updates
    if (init.snapshot) {
      Y.applyUpdate(doc, toUint8(init.snapshot), 'remote');
    }
    for (const u of init.updates || []) {
      Y.applyUpdate(doc, toUint8(u.update), 'remote');
    }

    yDocRef.current = doc;
    const awareness = new Awareness(doc);
    awarenessRef.current = awareness;
    localAwarenessSetRef.current = false;

    // Publish + render cursor immediately after init.
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Only published cursor on mouse/keyboard movement (cursor change events).
    //
    // Reason for change:
    // - If both users are "idle" after load, nobody sees any remote carets because no cursor update was ever broadcast.
    // - We publish once here using the current selection (best-effort) and render any already-known remote cursors.
    try {
      const editorInstance = editorRef.current;
      const model = editorInstance?.getModel?.();
      const sel = editorInstance?.getSelection?.();
      if (editorInstance && model && sel) {
        const anchorOffset = model.getOffsetAt(
          new monaco.Position(sel.selectionStartLineNumber, sel.selectionStartColumn)
        );
        const headOffset = model.getOffsetAt(
          new monaco.Position(sel.positionLineNumber, sel.positionColumn)
        );
        scheduleSetLocalCursor(anchorOffset, headOffset);
      }
    } catch {
      // best-effort only
    }
    scheduleRenderRemoteCursors();

    // Relay local awareness changes to other clients (cursor/selection presence).
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Awareness was created but never synced, so remote cursors never showed up.
    //
    // Reason for change:
    // - We send encoded awareness updates over socket.io and apply incoming updates from other clients.
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Tried to call `awareness.off('update')` without providing the handler.
    //
    // Reason for change:
    // - lib0 Observable `off` requires the same handler reference; since we create a new Awareness per init,
    //   we don't need to detach here.
    // awarenessRef.current.off?.('update');
    const awarenessUpdateHandler = (changes: any, origin: any) => {
      if (origin === 'remote') return;
      if (!socketRef.current) return;
      const changedClients = ([] as number[])
        .concat(changes.added || [])
        .concat(changes.updated || [])
        .concat(changes.removed || []);
      if (changedClients.length === 0) return;
      // IMPORTANT: Use the captured `awareness` instance, not `awarenessRef.current`.
      // Reason: during unmount/destroy the ref may be nulled, which previously caused a crash.
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      socketRef.current.emit('awareness-update', { documentId: id, update });
    };
    awarenessUpdateHandlerRef.current = awarenessUpdateHandler;
    awareness.on('update', awarenessUpdateHandler);

    // Render remote cursors whenever awareness changes (local or remote).
    // Production reason:
    // - We render via DecorationsCollection + RAF to avoid Monaco re-entrancy issues.
    const awarenessRenderHandler = () => {
      scheduleRenderRemoteCursors();
    };
    awarenessRenderHandlerRef.current = awarenessRenderHandler;
    awareness.on('update', awarenessRenderHandler);

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Bound immediately if `editorRef.current.getModel()` existed.
    //
    // Reason for change:
    // - `handleEditorDidMount` can replace the model via createModel/setModel after the ref is set.
    //   We bind only after the editor is marked ready; otherwise we defer.
    //
    // const model = editorRef.current?.getModel?.();
    // if (model && editorRef.current) { ... } else { pendingInitRef.current = init; }

    const text = yText.toString();
    setContent(text);
    lastSavedContent.current = text;

    if (editorReadyRef.current) {
      bindYjsToEditor();
    } else {
      pendingInitRef.current = init;
    }

    // Broadcast local Yjs updates
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Attempted to remove all listeners via `doc.off('update')`.
    //
    // Reason for change:
    // - Y.Doc.off requires the same handler reference; since we recreate the Y.Doc on init, we don't need to detach here.
    // doc.off('update');
    doc.on('update', (update: Uint8Array, origin: any) => {
      if (origin === 'remote') return;
      socketRef.current?.emit('yjs-update', { documentId: id, update });
      setUpdateCount((c) => c + 1);

      // Autosave UX: after 750ms idle, mark as "saved".
      // Reason: persistence is already happening server-side; this only drives the UI.
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = window.setTimeout(() => {
        const currentText = yDocRef.current?.getText('content').toString() || '';
        lastSavedContent.current = currentText;
        setLastSyncTime(Date.now());
      }, 750);
    });
  }, [id, bindYjsToEditor]);

  // Socket + Yjs sync (binary updates persisted by server)
  useEffect(() => {
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Used a singleton socket and `document-content`/`document-updated` with full strings.
    //
    // Reason for change:
    // - We now initialize a Y.Doc from server replay and exchange compact Yjs updates (`doc-init` + `yjs-update`).
    //
    // useEffect(() => { ... }, [id, token, navigate]);

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Redirected to /login whenever `token` was falsy.
    //
    // Reason for change:
    // - Clerk tokens may be temporarily null while being fetched; we only redirect if the user is not signed in.
    // if (!id || !token) { navigate('/login'); return; }

    if (!id) return;
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Redirected immediately when `isAuthenticated` was false.
    //
    // Reason for change:
    // - Clerk auth state loads asynchronously. We wait for `isLoaded` to avoid /document -> /login flicker on refresh.
    //
    // if (!isAuthenticated && !linkToken) { navigate('/login'); return; }

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Returned early when Clerk wasn't loaded yet.
    //
    // Reason for change:
    // - This left the editor in a permanent "idle" state on refresh while Clerk hydrates.
    // - Share-link access (`?token=`) should not depend on Clerk being loaded at all.
    //
    // if (!isLoaded) return;

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Allowed unauthenticated share-link access (connect without Clerk, authorize via `linkToken`).
    //
    // Reason for change:
    // - Option B: documents must be accessible only to authenticated users, even via share token.
    //
    // if (!linkToken) { ... require auth ... }

    if (!isLoaded) {
      setDocStatus('connecting');
      setDocError('auth_loading');
      if (authLoadTimeoutRef.current) window.clearTimeout(authLoadTimeoutRef.current);
      authLoadTimeoutRef.current = window.setTimeout(() => {
        setDocStatus('error');
        setDocError('clerk_not_loaded');
      }, 8000);
      return;
    }
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }
    if (!token) {
      setDocStatus('connecting');
      setDocError('waiting_token');
      return;
    }

    if (authLoadTimeoutRef.current) {
      window.clearTimeout(authLoadTimeoutRef.current);
      authLoadTimeoutRef.current = null;
    }

    // Option B: sockets must always be authenticated.
    const s = getSocket(token);
    socketRef.current = s;
    setDocStatus('connecting');
    setDocError(null);

    const join = () => {
      setDocStatus('waiting_init');
      // PREVIOUS IMPLEMENTATION (commented out):
      // - Emitted join-document immediately after calling `connect()`.
      //
      // Reason for change:
      // - On refresh/StrictMode, the socket may not yet be connected; joining on the 'connect' event is reliable.
      //
      // s.emit('join-document', { documentId: id, linkToken });
      s.emit('join-document', { documentId: id, linkToken });
    };

    const handleConnect = () => {
      join();
    };

    const handleConnectError = (err: any) => {
      setDocStatus('error');
      setDocError(err?.message || 'connect_error');
    };

    const handleDisconnect = (reason: any) => {
      // Keep the last loaded content visible; just reflect status.
      setDocStatus('error');
      setDocError(typeof reason === 'string' ? reason : 'disconnected');
    };

    s.on('connect', handleConnect);
    s.on('connect_error', handleConnectError);
    s.on('disconnect', handleDisconnect);

    if (!s.connected) s.connect();
    else join();

    const handleDocInit = (init: any) => {
      if (!init || init.documentId !== id) return;
      initYjsFromServer(init);
      setLastSyncTime(Date.now());
      setDocStatus('ready');

      // After we have awareness, publish our local state once so others can see our cursor.
      if (awarenessRef.current && !localAwarenessSetRef.current) {
        awarenessRef.current.setLocalStateField('user', {
          name: `User ${uniqueUserId.current.slice(-4)}`,
        });
        localAwarenessSetRef.current = true;
        const update = awarenessProtocol.encodeAwarenessUpdate(awarenessRef.current, [
          awarenessRef.current.clientID,
        ]);
        s.emit('awareness-update', { documentId: id, update });
      }
    };
    const handleAwarenessUpdate = (data: any) => {
      if (!data || data.documentId !== id) return;
      if (!awarenessRef.current) return;
      const updateBytes = toUint8(data.update);
      awarenessProtocol.applyAwarenessUpdate(awarenessRef.current, updateBytes, 'remote');
    };

    const handleAwarenessRequest = (data: any) => {
      if (!data || data.documentId !== id) return;
      if (!awarenessRef.current) return;
      const update = awarenessProtocol.encodeAwarenessUpdate(awarenessRef.current, [
        awarenessRef.current.clientID,
      ]);
      s.emit('awareness-update', { documentId: id, update });
    };


    const toUint8 = (val: any): Uint8Array => {
      if (!val) return new Uint8Array();
      if (val instanceof ArrayBuffer) return new Uint8Array(val);
      if (val instanceof Uint8Array) return val;
      if (val?.type === 'Buffer' && Array.isArray(val.data)) return new Uint8Array(val.data);
      return new Uint8Array(val);
    };

    const handleRemoteUpdate = (data: any) => {
      if (!data || data.documentId !== id) return;
      if (!yDocRef.current) return;
      Y.applyUpdate(yDocRef.current, toUint8(data.update), 'remote');
      setLastSyncTime(Date.now());
    };

    const handleUserJoined = (data: any) => {
      setActiveUsers((prev) => {
        const newUsers = prev.includes(data.userId) ? prev : [...prev, data.userId];
        setUserCount(newUsers.length);
        return newUsers;
      });
    };

    const handleActiveUsers = (users: any[]) => {
      const userIds = (users || []).map((u) => u.userId);
      setActiveUsers(userIds);
      setUserCount(userIds.length);
    };

    const handleUserLeft = (data: any) => {
      setActiveUsers((prev) => {
        const newUsers = prev.filter((userId) => userId !== data.userId);
        setUserCount(newUsers.length);
        return newUsers;
      });
    };

    // Join happens in `join()` above, after socket connection.
    s.on('doc-init', handleDocInit);
    s.on('yjs-update', handleRemoteUpdate);
    s.on('awareness-update', handleAwarenessUpdate);
    s.on('awareness-request', handleAwarenessRequest);
    s.on('user-joined', handleUserJoined);
    s.on('user-left', handleUserLeft);
    s.on('active-users', handleActiveUsers);

    return () => {
      s.off('doc-init', handleDocInit);
      s.off('yjs-update', handleRemoteUpdate);
      s.off('awareness-update', handleAwarenessUpdate);
      s.off('awareness-request', handleAwarenessRequest);
      s.off('user-joined', handleUserJoined);
      s.off('user-left', handleUserLeft);
      s.off('active-users', handleActiveUsers);
      s.off('connect', handleConnect);
      s.off('connect_error', handleConnectError);
      s.off('disconnect', handleDisconnect);

      s.emit('leave-document', id);
      bindingRef.current?.destroy();
      bindingRef.current = null;
      // PREVIOUS IMPLEMENTATION (commented out):
      // - Nulled awareness ref without removing the awareness handler.
      //
      // Reason for change:
      // - Awareness may emit during destroy; we must detach our handler first to prevent errors during unmount.
      //
      // awarenessRef.current = null;
      if (awarenessRef.current && awarenessUpdateHandlerRef.current) {
        awarenessRef.current.off('update', awarenessUpdateHandlerRef.current);
        awarenessUpdateHandlerRef.current = null;
      }
      if (awarenessRef.current && awarenessRenderHandlerRef.current) {
        awarenessRef.current.off('update', awarenessRenderHandlerRef.current);
        awarenessRenderHandlerRef.current = null;
      }
      awarenessRef.current = null;

      // Dispose editor event listeners + remote cursor decorations (prevents leaking decorations/disposables).
      for (const d of editorDisposablesRef.current) {
        try {
          d.dispose();
        } catch {
          // ignore
        }
      }
      editorDisposablesRef.current = [];
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

      yDocRef.current?.destroy();
      yDocRef.current = null;
      pendingInitRef.current = null;
      // PREVIOUS IMPLEMENTATION (commented out):
      // - Disconnected the singleton socket on every CodeEditor unmount.
      //
      // Reason for change:
      // - In dev, React StrictMode mounts/unmounts effects twice, which caused connect → immediate disconnect,
      //   so the document could stay empty on refresh (no time for `doc-init`).
      // - We keep the app-level socket alive and only leave the document room + remove listeners here.
      //
      // disconnectSocket();
      socketRef.current = null;
      isUpdatingFromSocket.current = false;
    };
  }, [id, token, linkToken, isAuthenticated, isLoaded, navigate, initYjsFromServer]);

  // Connection health monitoring and cleanup
  useEffect(() => {
    const healthCheckInterval = setInterval(() => {
      const now = Date.now();
      const cutoff = now - 30000;

      // Clean up stale cursors
      setOtherCursors(prev => prev.filter(cursor => cursor.timestamp > cutoff));

      // Request fresh user list from server every 30 seconds (Google Docs style)
      // PREVIOUS IMPLEMENTATION (commented out):
      // if (socket.connected && id) socket.emit('get-active-users', id);
      //
      // Reason for change:
      // - Socket is now created with auth and stored in a ref.
      if (socketRef.current?.connected && id) {
        socketRef.current.emit('get-active-users', id);
      }

      // Connection health check
      // PREVIOUS IMPLEMENTATION (commented out):
      // if (socket.connected) socket.emit('ping');
      //
      // Reason for change:
      // - Socket is now created with auth and stored in a ref.
      if (socketRef.current?.connected) {
        // Send heartbeat to verify connection is responsive
        socketRef.current.emit('ping');

        // Update last sync time
        setLastSyncTime(now);
      } else {
        console.warn('⚠️ Socket not connected during health check');
      }
    }, 30000); // Reduced from 10s to 30s for efficiency

    // Cleanup interval
    return () => clearInterval(healthCheckInterval);
  }, [id]);

  // Editor mount handler - exactly like demo project
  const handleEditorDidMount: OnMount = async (editorInstance, monacoInstance) => {
    console.log('🎯 handleEditorDidMount called');
    editorRef.current = editorInstance;
    editorInstance.focus();
    monacoRef.current = monacoInstance;

    console.log('✅ Editor mounted successfully');

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Applied pending init before Monaco finished setting up (and potentially replacing the model).
    //
    // Reason for change:
    // - We must mark the editor "ready" after any createModel/setModel work, then bind Yjs to the final model.
    //
    // if (pendingInitRef.current) {
    //   initYjsFromServer(pendingInitRef.current);
    //   pendingInitRef.current = null;
    // }

    // Demo project approach - file-specific JSX configuration
    if (monacoInstance && selectedLanguage === 'tsx') {
      // In Monaco 0.55.1+, access TypeScript API via the typescript namespace
      // Use type assertion to access the typescript API from monacoInstance
      const tsDefaults = (monacoInstance as typeof monaco).typescript.typescriptDefaults;

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
      // This gives you the same experience as Cursor with official React docs
      try {
        // Load React types from CDN (same as your project's version)
        const reactResponse = await fetch('https://unpkg.com/@types/react@18.2.0/index.d.ts');
        const reactTypes = await reactResponse.text();
        tsDefaults.addExtraLib(
          reactTypes,
          "file:///node_modules/@types/react/index.d.ts"
        );

        // Load React DOM types from CDN
        const reactDomResponse = await fetch('https://unpkg.com/@types/react-dom@18.2.0/index.d.ts');
        const reactDomTypes = await reactDomResponse.text();
        tsDefaults.addExtraLib(
          reactDomTypes,
          "file:///node_modules/@types/react-dom/index.d.ts"
        );

        console.log('✅ Loaded official React types with documentation from CDN');
      } catch (error) {
        console.warn('⚠️ Could not load official React types, using fallback:', error);

        // Fallback minimal types if loading fails
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

      // Add JSX runtime types - exactly like demo project
      tsDefaults.addExtraLib(
        `declare module 'react/jsx-runtime' {
          export function jsx(type: any, props: any, key?: any): any;
          export function jsxs(type: any, props: any, key?: any): any;
          export function Fragment(props: { children?: any }): any;
        }`,
        "file:///node_modules/@types/react/jsx-runtime.d.ts"
      );


      // PREVIOUS IMPLEMENTATION (commented out):
      // - Created a Monaco model pre-filled with local `content`.
      //
      // Reason for change:
      // - The authoritative content is Yjs state. Pre-filling the model can create a race where MonacoBinding syncs
      //   the wrong initial text and emits updates that overwrite the persisted template.
      //
      // const model = monacoInstance.editor.createModel(content, "typescript", monacoInstance.Uri.file('App.tsx'));

      // Create a model with an empty value; Yjs will populate it after `doc-init`.
      const model = monacoInstance.editor.createModel('', "typescript", monacoInstance.Uri.file('App.tsx'));
      editorInstance.setModel(model);
      console.log('🔧 Created TypeScript model with .tsx URI for proper TSX support');
    } else {
      // For other languages, just set the language
      const currentLanguage = SUPPORTED_LANGUAGES[selectedLanguage]?.monacoLanguage || 'javascript';
      const model = editorInstance.getModel();
      if (model) {
        monacoInstance.editor.setModelLanguage(model, currentLanguage);
        console.log(`🔧 Set model language to ${currentLanguage}`);
      }

      // PREVIOUS IMPLEMENTATION (commented out):
      // - Set the editor value from local `content` state on mount.
      //
      // Reason for change:
      // - Yjs is the source of truth; we avoid writing local state into Monaco to prevent overwriting persisted doc state.
      //
      // if (content) {
      //   console.log('📝 Setting initial content from state');
      //   editorInstance.setValue(content);
      //   lastSavedContent.current = content;
      // } else {
      //   console.log('📝 No initial content, editor is empty');
      // }
      console.log('📝 Waiting for Yjs doc-init to populate editor');
    }

    editorReadyRef.current = true;

    // If the server sent `doc-init` before Monaco was ready, initialize Yjs now.
    if (pendingInitRef.current) {
      initYjsFromServer(pendingInitRef.current);
      pendingInitRef.current = null;
    }

    // If we already have a Y.Doc, (re)bind it to the current Monaco model (handles model replacement).
    if (yDocRef.current) {
      bindYjsToEditor();
    }

    // Cursor/selection -> awareness (production-grade)
    // PREVIOUS IMPLEMENTATION (commented out):
    // - Relied on y-monaco's awareness integration.
    //
    // Reason for change:
    // - y-monaco awareness rendering can trigger re-entrant decoration updates in Monaco 0.55+.
    // - We publish local cursor state ourselves (RAF-coalesced), and render remote cursors via DecorationsCollection.
    for (const d of editorDisposablesRef.current) {
      try {
        d.dispose();
      } catch {
        // ignore
      }
    }
    editorDisposablesRef.current = [];

    const publishCursor = () => {
      const awareness = awarenessRef.current;
      const model = editorInstance.getModel?.();
      const sel = editorInstance.getSelection?.();
      if (!awareness || !model || !sel) return;

      // Monaco Selection stores both anchor (selectionStart*) and head (position*).
      const anchorOffset = model.getOffsetAt(
        new monaco.Position(sel.selectionStartLineNumber, sel.selectionStartColumn)
      );
      const headOffset = model.getOffsetAt(
        new monaco.Position(sel.positionLineNumber, sel.positionColumn)
      );
      scheduleSetLocalCursor(anchorOffset, headOffset);
    };

    editorDisposablesRef.current.push(
      editorInstance.onDidChangeCursorSelection(() => {
        publishCursor();
      })
    );
    editorDisposablesRef.current.push(
      editorInstance.onDidFocusEditorWidget(() => {
        publishCursor();
      })
    );
    editorDisposablesRef.current.push(
      editorInstance.onDidBlurEditorWidget(() => {
        // Clear cursor when unfocused so we don't leave "ghost" carets.
        if (awarenessRef.current) {
          awarenessRef.current.setLocalStateField('cursor', null);
        }
      })
    );

    // Publish initial cursor once mounted.
    publishCursor();
  };

  // Save handler
  const handleSave = useCallback(async () => {
    if (!id || !content) return;

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Attempted to persist full document content via PUT /api/documents/:id.
    //
    // Reason for change:
    // - Content persistence now happens continuously via persisted Yjs updates.
    //
    // try {
    //   const response = await fetch(`/api/documents/${id}`, {
    //     method: 'PUT',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({ content })
    //   });
    //   if (response.ok) lastSavedContent.current = content;
    // } catch (error) {}

    // Mark as saved in the UI (actual persistence is via Yjs updates).
    lastSavedContent.current = content;
  }, [id, content]);

  // Share handler
  const handleShare = useCallback(async () => {
    if (!id) return;

    // PREVIOUS IMPLEMENTATION (commented out):
    // - Shared the current URL directly, but there was no access token for non-members.
    //
    // Reason for change:
    // - Sharing requires generating/rotating a link token on the server, then sharing `/document/:id?token=...`.
    //
    // if (navigator.share) { navigator.share({ title: 'Collaborative Document', url: window.location.href }); }
    // else { navigator.clipboard.writeText(window.location.href); }

    if (!token) {
      // Without a signed-in user we can't rotate share links (owner-only).
      await navigator.clipboard.writeText(window.location.href);
      return;
    }

    try {
      const res = await fetch(apiUrl(`/api/documents/${id}/share-link`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ mode: 'edit' }),
      });
      if (!res.ok) throw new Error(`share-link failed: ${res.status}`);
      const data = await res.json();
      const shareUrl = `${window.location.origin}/document/${id}?token=${data.token}`;

      if (navigator.share) {
        await navigator.share({ title: 'Collaborative Document', url: shareUrl });
      } else {
        await navigator.clipboard.writeText(shareUrl);
      }
    } catch {
      // Fallback: at least copy the current URL
      await navigator.clipboard.writeText(window.location.href);
    }
  }, [id, token]);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <AppBar position="static">
        <Toolbar>
          <IconButton edge="start" color="inherit" onClick={() => navigate(-1)}>
            <ArrowBackIcon />
          </IconButton>

          <Typography variant="h6" sx={{ flexGrow: 1 }}>
            Document {id}
          </Typography>

          {/* Language Selector */}
          <FormControl size="small" sx={{ minWidth: 120, mr: 2 }}>
            <Select
              value={selectedLanguage}
              onChange={(e: any) => handleLanguageChange(e.target.value)}
              displayEmpty
              sx={{
                bgcolor: 'background.paper',
                '& .MuiSelect-select': { py: 0.5 }
              }}
            >
              {Object.entries(SUPPORTED_LANGUAGES).map(([key, lang]) => (
                <MenuItem key={key} value={key}>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{lang.icon}</span>
                    <span>{lang.name}</span>
                  </Box>
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Typography variant="body2" sx={{ mr: 2 }}>
            {/* PREVIOUS IMPLEMENTATION (commented out):
                {socket.connected ? '🟢 Connected' : '🔴 Disconnected'}

                Reason for change:
                - Socket is now created with auth and stored in a ref. */}
            {socketRef.current?.connected ? '🟢 Connected' : '🔴 Disconnected'} ({docStatus}
            {docError ? `: ${docError}` : ''})
          </Typography>

          <Typography variant="body2" sx={{ mr: 2 }}>
            {content !== lastSavedContent.current ? '🟠 Unsaved' : '🟢 Saved'}
          </Typography>

          <Typography variant="body2" sx={{ mr: 2 }}>
            You: {uniqueUserId.current.slice(-4)}
          </Typography>

          <Typography variant="body2" sx={{ mr: 2 }}>
            👥 {userCount} active
          </Typography>

          <Typography variant="body2" sx={{ mr: 2 }}>
            🔄 {Math.floor((Date.now() - lastSyncTime) / 1000)}s ago
          </Typography>

          <Typography variant="body2" sx={{ mr: 2, fontSize: '0.7rem', opacity: 0.7 }}>
            IDs: {activeUsers.slice(0, 3).join(', ')}{activeUsers.length > 3 ? '...' : ''}
          </Typography>

          <Typography variant="body2" sx={{ mr: 2, fontSize: '0.7rem', opacity: 0.7 }}>
            📊 {updateCount} updates | {SUPPORTED_LANGUAGES[selectedLanguage as keyof typeof SUPPORTED_LANGUAGES]?.icon} {SUPPORTED_LANGUAGES[selectedLanguage as keyof typeof SUPPORTED_LANGUAGES]?.name}
          </Typography>

          {/* PREVIOUS IMPLEMENTATION (commented out):
              <Button disabled={!socket.connected || content === lastSavedContent.current} ... />

              Reason for change:
              - Socket is now created with auth and stored in a ref. */}
          <Button
            color="inherit"
            onClick={handleSave}
            disabled={!socketRef.current?.connected || content === lastSavedContent.current}
          >
            SAVE
          </Button>

          <Button color="inherit" onClick={handleShare}>
            SHARE
          </Button>

          <Button
            color="inherit"
            onClick={() => setShowTemplateSelector(!showTemplateSelector)}
            variant={showTemplateSelector ? "contained" : "text"}
          >
            Templates
          </Button>

          <Button
            color="inherit"
            onClick={() => setIsChatOpen(!isChatOpen)}
          >
            Chat
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ flexGrow: 1, position: 'relative' }}>
        {/* PREVIOUS IMPLEMENTATION (commented out):
            <Editor value={content} onChange={handleEditorChange} ... />

            Reason for change:
            - Monaco should be driven by Yjs binding, not by React state, to avoid feedback loops/overwrites.
            - We keep `content` state only for UI indicators (saved/unsaved), not as the editor's source of truth. */}
        <Editor
          height="100%"
          language={SUPPORTED_LANGUAGES[selectedLanguage]?.monacoLanguage || 'javascript'}
          theme="vs-dark"
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: true, side: 'right' },
            automaticLayout: true,
            wordWrap: 'on',
            lineNumbers: 'on',
            fontSize: 14,
            tabSize: 2,
            insertSpaces: true,
            trimAutoWhitespace: true,
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            folding: true,
            bracketPairColorization: { enabled: true },
            // Enable TypeScript features
            suggestOnTriggerCharacters: true,
            quickSuggestions: true,
            parameterHints: { enabled: true },
            hover: { enabled: true },
            links: true
          }}
        />
      </Box>

      {/* Chat Component */}
      <Chat
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />

      {/* Template Selector */}
      {showTemplateSelector && (
        <>
          {/* Backdrop */}
          <Box
            sx={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              bgcolor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 1300
            }}
            onClick={() => setShowTemplateSelector(false)}
          />

          {/* Template Modal */}
          <Box
            sx={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: 600,
              maxHeight: '80vh',
              bgcolor: 'background.paper',
              borderRadius: 2,
              boxShadow: 24,
              p: 3,
              zIndex: 1400,
              overflow: 'auto'
            }}
          >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
              <Typography variant="h5">Choose a Template</Typography>
              <IconButton onClick={() => setShowTemplateSelector(false)}>
                <CloseIcon />
              </IconButton>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 2 }}>
              {Object.entries(CODE_TEMPLATES)
                .filter(([key, template]) =>
                  !template.languages || template.languages.includes(selectedLanguage)
                )
                .map(([key, template]) => (
                  <Paper
                    key={key}
                    elevation={2}
                    sx={{
                      p: 2,
                      cursor: 'pointer',
                      border: selectedTemplate === key ? 2 : 1,
                      borderColor: selectedTemplate === key ? 'primary.main' : 'divider',
                      '&:hover': {
                        bgcolor: 'action.hover',
                        transform: 'translateY(-2px)',
                        transition: 'all 0.2s ease-in-out'
                      }
                    }}
                    onClick={() => handleTemplateSelect(key)}
                  >
                    <Typography variant="h6" gutterBottom>
                      {template.name}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                      {template.description}
                    </Typography>
                    <Box
                      sx={{
                        bgcolor: 'grey.100',
                        p: 1,
                        borderRadius: 1,
                        fontFamily: 'monospace',
                        fontSize: '0.75rem',
                        maxHeight: 100,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {template.content.slice(0, 150)}...
                    </Box>
                  </Paper>
                ))}
            </Box>
          </Box>
        </>
      )}
    </Box>
  );
};

export default CodeEditor;

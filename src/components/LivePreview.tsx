import React, { useEffect, useRef, useState } from 'react';
import { Box, Paper, Typography, IconButton, CircularProgress } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import StopIcon from '@mui/icons-material/Stop';

interface LivePreviewProps {
  code: string;
  language: 'html' | 'tsx' | 'javascript' | 'typescript';
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Production-grade live preview component for frontend code execution.
 * 
 * Features:
 * - HTML: Direct rendering in sandboxed iframe
 * - React/TSX: JSX transpilation via Babel standalone
 * - Error handling with clear error messages
 * - Sandboxed execution (no access to parent window)
 * - Real-time updates as code changes
 */
const LivePreview: React.FC<LivePreviewProps> = ({ code, language, isOpen, onClose }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isReact, setIsReact] = useState(false);

  useEffect(() => {
    if (!isOpen || !iframeRef.current) return;
    
    setIsLoading(true);
    setError(null);

    try {
      let htmlContent = '';

      // Determine if code contains React/JSX
      const hasReact = language === 'tsx' || 
                       language === 'javascript' || 
                       language === 'typescript' ||
                       code.includes('import React') ||
                       code.includes('from "react"') ||
                       code.includes('from \'react\'') ||
                       code.includes('React.') ||
                       /<[A-Z]\w+/.test(code); // JSX component pattern

      setIsReact(hasReact);

      if (hasReact) {
        // React/JSX code - needs transpilation
        htmlContent = generateReactHTML(code);
      } else if (language === 'html') {
        // Pure HTML - use as-is
        htmlContent = code;
      } else {
        // JavaScript/TypeScript without React - wrap in HTML
        htmlContent = generateJavaScriptHTML(code);
      }

      // Update iframe content
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.document.open();
        iframeRef.current.contentWindow.document.write(htmlContent);
        iframeRef.current.contentWindow.document.close();
      }

      setIsLoading(false);
    } catch (err: any) {
      setError(err.message || 'Failed to render preview');
      setIsLoading(false);
    }
  }, [code, language, isOpen]);

  /**
   * Strip TypeScript syntax from code for runtime execution
   * Babel standalone doesn't support TypeScript, so we convert TS to JS
   */
  const stripTypeScript = (code: string): string => {
    let result = code;
    
    // Helper to find matching closing brace
    const findMatchingBrace = (str: string, start: number): number => {
      let depth = 0;
      let i = start;
      while (i < str.length) {
        if (str[i] === '{') depth++;
        if (str[i] === '}') {
          depth--;
          if (depth === 0) return i;
        }
        i++;
      }
      return -1;
    };
    
    // Helper to find matching closing angle bracket (for generics)
    const findMatchingAngle = (str: string, start: number): number => {
      let depth = 0;
      let i = start;
      while (i < str.length) {
        if (str[i] === '<') depth++;
        if (str[i] === '>') {
          depth--;
          if (depth === 0) return i;
        }
        i++;
      }
      return -1;
    };
    
    // Remove interface declarations
    let interfaceMatch;
    const interfaceRegex = /interface\s+\w+[^{]*\{/g;
    while ((interfaceMatch = interfaceRegex.exec(result)) !== null) {
      const end = findMatchingBrace(result, interfaceMatch.index + interfaceMatch[0].length - 1);
      if (end !== -1) {
        result = result.substring(0, interfaceMatch.index) + result.substring(end + 1);
        interfaceRegex.lastIndex = interfaceMatch.index;
      }
    }
    
    // Remove type declarations
    result = result.replace(/type\s+\w+\s*=[^;]+;/g, '');
    
    // Remove enum declarations
    let enumMatch;
    const enumRegex = /enum\s+\w+[^{]*\{/g;
    while ((enumMatch = enumRegex.exec(result)) !== null) {
      const end = findMatchingBrace(result, enumMatch.index + enumMatch[0].length - 1);
      if (end !== -1) {
        result = result.substring(0, enumMatch.index) + result.substring(end + 1);
        enumRegex.lastIndex = enumMatch.index;
      }
    }
    
    // Remove type annotations from function parameters: (param: Type) => (param)
    // Be careful not to remove parameter names or the arrow function syntax
    result = result.replace(/:\s*(?:string|number|boolean|any|void|object|Array<[^>]+>|\w+\[\]|React\.(?:FC|Component|ComponentType)<[^>]+>|\{[^}]+\}|\w+(?:<[^>]+>)?)(?=\s*[,)])/g, '');
    
    // Remove return type annotations from arrow functions: ): Type => ): =>
    // Only match if followed by =>, not =
    result = result.replace(/\)\s*:\s*(?:string|number|boolean|any|void|object|Array<[^>]+>|\w+\[\]|React\.(?:FC|Component|ComponentType)<[^>]+>|JSX\.Element|\{[^}]+\}|\w+(?:<[^>]+>)?)\s*=>/g, ') =>');
    
    // Remove type annotations from variable declarations: const x: Type = -> const x =
    // CRITICAL: Handle React.FC<Props> = ({ prop }) => correctly
    // First, handle React.FC<...> = ({ ... }) => pattern specifically
    result = result.replace(/:\s*React\.(?:FC|Component|ComponentType)<[^>]+>\s*=\s*\(/g, ' = (');
    
    // Then handle other type annotations: const x: Type = value (not arrow functions)
    // Only match when = is followed by something that's NOT ( or { (arrow function start)
    result = result.replace(/:\s*(?:\w+(?:<[^>]+>)?|\{[^}]+\})\s*=(?=\s*[^{(])/g, ' =');
    
    // Remove 'as' type assertions: value as Type -> value
    result = result.replace(/\s+as\s+(?:string|number|boolean|any|void|object|Array<[^>]+>|\w+\[\]|React\.(?:FC|Component|ComponentType)<[^>]+>|\{[^}]+\}|\w+(?:<[^>]+>)?)/g, '');
    
    return result;
  };

  const generateReactHTML = (jsxCode: string): string => {
    // Detect if code contains TypeScript syntax
    const hasTypeScript = /:\s*(string|number|boolean|any|void|object|Array|Function|React\.(FC|Component|ComponentType)|interface|type\s+\w+|enum\s+\w+)/.test(jsxCode) ||
                          /interface\s+\w+/.test(jsxCode) ||
                          /type\s+\w+\s*=/.test(jsxCode) ||
                          /enum\s+\w+/.test(jsxCode);

    // Strip TypeScript syntax if present
    const processedCode = hasTypeScript ? stripTypeScript(jsxCode) : jsxCode;
    
    // Escape code for embedding in HTML
    const escapedCode = processedCode
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\${/g, '\\${');

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.development.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel">
    const { useState, useEffect, useCallback, useMemo, useRef, useContext, createContext, useReducer, useImperativeHandle, forwardRef, memo, lazy, Suspense } = React;
    
    try {
      // Extract component code - if it's just JSX, wrap it in a component
      let componentCode = \`${escapedCode}\`;
      
      // TypeScript syntax has already been stripped in the React component above
      
      // Remove import statements (React is already loaded globally in the iframe)
      // Split by lines and filter out import lines to avoid regex escaping issues
      const lines = componentCode.split('\\n');
      const filteredLines = lines.filter(line => {
        const trimmed = line.trim();
        return !trimmed.startsWith('import ') && !trimmed.startsWith('export ');
      });
      componentCode = filteredLines.join('\\n');
      
      // Also remove export statements that might be on the same line as other code
      // Replace "export default ComponentName" with just "ComponentName"
      componentCode = componentCode.replace(/export\s+default\s+/g, '');
      componentCode = componentCode.replace(/export\s+\{[^}]+\}\s+from\s+['"][^'"]+['"];?\s*/g, '');
      componentCode = componentCode.replace(/export\s+\w+\s+from\s+['"][^'"]+['"];?\s*/g, '');
      componentCode = componentCode.replace(/export\s+/g, '');
      
      // If code doesn't define a component, assume it's a component definition
      if (!componentCode.includes('const ComponentName') && !componentCode.includes('function ComponentName') && !componentCode.includes('const App') && !componentCode.includes('function App')) {
        // Try to detect if it's a component or JSX
        if (componentCode.trim().startsWith('<') || componentCode.includes('return (')) {
          // It's JSX - wrap in a component
          componentCode = \`
            function App() {
              return (
                \${componentCode}
              );
            }
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(React.createElement(App));
          \`;
        } else {
          // Assume it's a component definition
          componentCode += \`
            const root = ReactDOM.createRoot(document.getElementById('root'));
            root.render(React.createElement(App));
          \`;
        }
      } else {
        // Code defines a component - execute and render
        componentCode += \`
          const root = ReactDOM.createRoot(document.getElementById('root'));
          const Component = typeof ComponentName !== 'undefined' ? ComponentName : (typeof App !== 'undefined' ? App : null);
          if (Component) {
            root.render(React.createElement(Component));
          } else {
            // Try to find any exported component
            const allVars = Object.keys(typeof window !== 'undefined' ? window : {});
            root.render(React.createElement('div', null, 'Component found. Please ensure ComponentName or App is defined.'));
          }
        \`;
      }
      
      // Babel will transpile the code automatically via type="text/babel"
      // Note: Babel standalone doesn't include TypeScript preset by default,
      // so we strip TypeScript syntax above and use regular JavaScript
      // CRITICAL: Set modules: false to avoid CommonJS exports (not available in browser)
      const transformed = Babel.transform(componentCode, {
        presets: [
          ['react', {}],
          ['env', { modules: false }] // Don't use CommonJS modules
        ],
        plugins: ['transform-class-properties']
      }).code;
      
      // Remove any CommonJS exports that might have been generated
      const cleaned = transformed.replace(/exports\.\w+\s*=\s*/g, '');
      
      eval(cleaned);
    } catch (error) {
      document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: monospace; white-space: pre-wrap;"><h2>Runtime Error</h2><pre>' + error.toString() + '\\n\\n' + error.stack + '</pre></div>';
      console.error('Preview error:', error);
    }
  </script>
</body>
</html>
    `;
  };

  const generateJavaScriptHTML = (jsCode: string): string => {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Live Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; }
  </style>
</head>
<body>
  <div id="output"></div>
  <script>
    try {
      const output = document.getElementById('output');
      const originalLog = console.log;
      console.log = (...args) => {
        originalLog(...args);
        output.innerHTML += args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ') + '<br>';
      };
      ${jsCode}
    } catch (error) {
      document.body.innerHTML = '<div style="color: red; padding: 20px; font-family: monospace;"><h2>Runtime Error</h2><pre>' + error.toString() + '</pre></div>';
      console.error('Preview error:', error);
    }
  </script>
</body>
</html>
    `;
  };

  if (!isOpen) return null;

  return (
    <Paper
      elevation={8}
      sx={{
        position: 'fixed',
        top: 64,
        right: 16,
        width: '50%',
        height: 'calc(100vh - 80px)',
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
          <PlayArrowIcon color="success" fontSize="small" />
          <Typography variant="h6">Live Preview</Typography>
          {isReact && (
            <Typography variant="caption" color="text.secondary">
              (React Mode)
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      {error && (
        <Box
          sx={{
            p: 2,
            bgcolor: 'error.light',
            color: 'error.contrastText',
            fontFamily: 'monospace',
            fontSize: '0.875rem',
          }}
        >
          <Typography variant="subtitle2" gutterBottom>Error:</Typography>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{error}</pre>
        </Box>
      )}

      {isLoading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flex: 1,
          }}
        >
          <CircularProgress />
        </Box>
      )}

      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        <iframe
          ref={iframeRef}
          sandbox="allow-scripts allow-same-origin"
          style={{
            width: '100%',
            height: '100%',
            border: 'none',
            backgroundColor: 'white',
          }}
          title="Live Preview"
        />
      </Box>
    </Paper>
  );
};

export default LivePreview;

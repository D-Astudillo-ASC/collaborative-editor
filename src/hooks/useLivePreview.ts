import { useState, useCallback, useRef, useEffect } from 'react';
import type { PreviewState } from '@/types/execution';
import type { Language } from '@/types';

interface UseLivePreviewOptions {
  language: Language;
  debounceMs?: number;
}

interface UseLivePreviewReturn {
  preview: PreviewState;
  updatePreview: (code: string) => void;
  resetPreview: () => void;
  iframeRef: React.RefObject<HTMLIFrameElement | null>;
}

const DEFAULT_PREVIEW: PreviewState = {
  html: '',
  css: '',
  js: '',
  error: null,
  isLoading: false,
  lastUpdate: new Date(),
};

/**
 * Hook for managing live preview of React, TSX, and HTML code
 * Uses a sandboxed iframe for secure rendering
 */
export function useLivePreview({
  language,
  debounceMs = 500
}: UseLivePreviewOptions): UseLivePreviewReturn {
  const [preview, setPreview] = useState<PreviewState>(DEFAULT_PREVIEW);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const generatePreviewHtml = useCallback((code: string, lang: Language): string => {
    // HTML code - render directly
    if (lang === 'html') {
      return code;
    }

    // For React/TSX, we create a wrapper that renders the component
    // Note: This is a simplified version. In production, you'd use a proper bundler
    const reactWrapper = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Preview</title>
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 16px;
      background: #ffffff;
      color: #1a1a1a;
    }
    @media (prefers-color-scheme: dark) {
      body { background: #1a1a1a; color: #ffffff; }
    }
    .error-boundary {
      padding: 16px;
      background: #fee2e2;
      border: 1px solid #ef4444;
      border-radius: 8px;
      color: #991b1b;
      font-family: monospace;
      white-space: pre-wrap;
    }
    .component, .counter, input, button {
      margin: 8px 0;
    }
    input {
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
    }
    button {
      padding: 8px 16px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
    }
    button:hover { background: #2563eb; }
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useCallback, useRef, useMemo, useContext, createContext } = React;
    
    // Error Boundary Component
    class ErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
      }
      
      static getDerivedStateFromError(error) {
        return { hasError: true, error };
      }
      
      render() {
        if (this.state.hasError) {
          return React.createElement('div', { className: 'error-boundary' },
            'Error rendering component:\\n' + (this.state.error?.message || 'Unknown error')
          );
        }
        return this.props.children;
      }
    }

    try {
      // User's code (transformed)
      ${transformCodeForPreview(code)}
      
      // Find the default export or Component
      // Check multiple possible component names
      let ComponentToRender = null;
      
      if (typeof Component !== 'undefined') {
        ComponentToRender = Component;
      } else if (typeof App !== 'undefined') {
        ComponentToRender = App;
      } else {
        // Try to find any exported component
        const possibleNames = ['Counter', 'Button', 'Card', 'Input', 'Form', 'Page', 'View'];
        for (const name of possibleNames) {
          if (typeof window[name] !== 'undefined') {
            ComponentToRender = window[name];
            break;
          }
        }
      }
      
      if (ComponentToRender && typeof ComponentToRender === 'function') {
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(
          React.createElement(ErrorBoundary, null,
            React.createElement(ComponentToRender, { 
              name: 'Preview User', 
              title: 'Preview', 
              initialValue: 'Hello',
              onValueChange: (value) => console.log('Value changed:', value)
            })
          )
        );
      } else {
        const errorMsg = ComponentToRender 
          ? 'Component is not a valid React component'
          : 'No Component, App, or other component found. Make sure you export a default component.';
        document.getElementById('root').innerHTML = '<div class="error-boundary">' + errorMsg + '</div>';
        console.error('Preview Error: Component not found', { Component, App, ComponentToRender });
      }
    } catch (error) {
      document.getElementById('root').innerHTML = '<div class="error-boundary">Compilation Error:\\n' + error.message + '\\n\\nStack: ' + (error.stack || 'No stack trace') + '</div>';
      console.error('Preview Error:', error);
    }
  </script>
</body>
</html>`;

    return reactWrapper;
  }, []);

  const updatePreview = useCallback((code: string) => {
    // Clear existing debounce
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    setPreview(prev => ({ ...prev, isLoading: true, error: null }));

    debounceTimer.current = setTimeout(() => {
      try {
        const html = generatePreviewHtml(code, language);

        setPreview({
          html,
          css: '',
          js: code,
          error: null,
          isLoading: false,
          lastUpdate: new Date(),
        });

        // Note: iframe update is handled by LivePreviewPanel component
        // via useEffect watching preview.html state
        // This prevents conflicts from multiple iframe update sources
      } catch (error) {
        setPreview(prev => ({
          ...prev,
          error: error instanceof Error ? error.message : 'Unknown error',
          isLoading: false,
        }));
      }
    }, debounceMs);
  }, [language, debounceMs, generatePreviewHtml]);

  const resetPreview = useCallback(() => {
    setPreview(DEFAULT_PREVIEW);
    if (iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        doc.open();
        doc.write('<!DOCTYPE html><html><body></body></html>');
        doc.close();
      }
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  return {
    preview,
    updatePreview,
    resetPreview,
    iframeRef,
  };
}

/**
 * Transform code for preview (remove imports, fix exports, handle TypeScript)
 */
function transformCodeForPreview(code: string): string {
  // Remove import statements (they're handled globally in the preview)
  let transformed = code.replace(/^import\s+.*?from\s+['"][^'"]+['"];?\s*$/gm, '');

  // Remove TypeScript type annotations for better Babel compatibility
  // This must be done comprehensively to avoid "string is not defined" errors

  // Remove : Type annotations from variable/parameter declarations
  transformed = transformed.replace(/:\s*React\.FC<[^>]+>/g, '');
  transformed = transformed.replace(/:\s*React\.ComponentType<[^>]*>/g, '');
  transformed = transformed.replace(/:\s*React\.FunctionComponent<[^>]*>/g, '');
  transformed = transformed.replace(/:\s*string\b/g, '');
  transformed = transformed.replace(/:\s*number\b/g, '');
  transformed = transformed.replace(/:\s*boolean\b/g, '');
  transformed = transformed.replace(/:\s*any\b/g, '');
  transformed = transformed.replace(/:\s*void\b/g, '');
  transformed = transformed.replace(/:\s*null\b/g, '');
  transformed = transformed.replace(/:\s*undefined\b/g, '');
  transformed = transformed.replace(/:\s*React\.ReactNode\b/g, '');
  transformed = transformed.replace(/:\s*React\.ReactElement\b/g, '');
  transformed = transformed.replace(/:\s*JSX\.Element\b/g, '');

  // Remove complex type annotations (e.g., : { prop: string })
  transformed = transformed.replace(/:\s*\{[^}]*\}/g, '');

  // Remove interface/type definitions (they're not needed in runtime)
  transformed = transformed.replace(/^interface\s+\w+[^{]*\{[^}]*\}\s*$/gm, '');
  transformed = transformed.replace(/^type\s+\w+\s*=[^;]+;\s*$/gm, '');

  // Remove generic type parameters from function calls and declarations
  // Pattern: <Type> or <Type1, Type2>
  // We need to be careful: JSX uses < > but generics also use < >
  // Strategy: Remove generics from known patterns, leave JSX alone
  // Babel will handle JSX correctly, so we can be more aggressive with generics

  // Remove generics from common React patterns (these are safe to remove)
  transformed = transformed.replace(/\buseState<[^>]+>/g, 'useState');
  transformed = transformed.replace(/\buseEffect<[^>]+>/g, 'useEffect');
  transformed = transformed.replace(/\buseCallback<[^>]+>/g, 'useCallback');
  transformed = transformed.replace(/\buseMemo<[^>]+>/g, 'useMemo');
  transformed = transformed.replace(/\buseRef<[^>]+>/g, 'useRef');
  transformed = transformed.replace(/\bReact\.FC<[^>]+>/g, 'React.FC');
  transformed = transformed.replace(/\bReact\.ComponentType<[^>]+>/g, 'React.ComponentType');

  // Remove generics from other function calls (but preserve JSX)
  // Only remove if it's a known pattern (uppercase identifier followed by <)
  transformed = transformed.replace(/\b([A-Z][a-zA-Z0-9_]*?)<([A-Z][a-zA-Z0-9_.,\s|&]+)>/g, (match, funcName, typeParams) => {
    // Skip if it looks like JSX (common HTML/React component patterns)
    // JSX typically has props like className, onClick, children, etc.
    if (typeParams.includes('className') || typeParams.includes('onClick') ||
      typeParams.includes('children') || typeParams.includes('style') ||
      typeParams.includes('id') || typeParams.includes('href')) {
      return match; // Keep JSX
    }
    // Remove generic for React components and types
    return funcName;
  });

  // Remove generic type parameters from useState, useEffect, etc.
  // This must happen before other transformations to avoid conflicts
  transformed = transformed.replace(/\buseState\s*<[^>]+>/g, 'useState');
  transformed = transformed.replace(/\buseEffect\s*<[^>]+>/g, 'useEffect');
  transformed = transformed.replace(/\buseCallback\s*<[^>]+>/g, 'useCallback');
  transformed = transformed.replace(/\buseMemo\s*<[^>]+>/g, 'useMemo');
  transformed = transformed.replace(/\buseRef\s*<[^>]+>/g, 'useRef');
  transformed = transformed.replace(/\bReact\.FC\s*<[^>]+>/g, '');
  transformed = transformed.replace(/\bReact\.ComponentType\s*<[^>]+>/g, '');
  transformed = transformed.replace(/\bReact\.FunctionComponent\s*<[^>]+>/g, '');

  // Remove any remaining generic type parameters that look like types
  // Pattern: identifier<Type> where Type is a type name (uppercase or primitive)
  // But preserve JSX which uses < for tags
  transformed = transformed.replace(/(\w+)\s*<([a-zA-Z][a-zA-Z0-9_.|&\s]*?)>/g, (match, identifier, typeContent) => {
    // Skip if it's clearly JSX (has props-like content or is a known HTML tag)
    const lowerId = identifier.toLowerCase();
    const htmlTags = ['div', 'span', 'button', 'input', 'form', 'section', 'article', 'header', 'footer', 'nav', 'main', 'aside', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'a', 'img', 'br', 'hr', 'select', 'option', 'textarea', 'label'];

    if (htmlTags.includes(lowerId)) {
      return match; // Keep JSX
    }

    // Check if typeContent looks like a type (uppercase, or primitive types)
    const looksLikeType = /^[A-Z]/.test(typeContent.trim()) ||
      ['string', 'number', 'boolean', 'any', 'void', 'null', 'undefined'].includes(typeContent.trim());

    if (looksLikeType) {
      return identifier; // Remove generic
    }

    return match; // Keep if unsure (might be JSX)
  });

  // Remove optional chaining type annotations (e.g., prop?: string)
  transformed = transformed.replace(/\?\s*:\s*\w+/g, '');

  // Remove array type annotations (e.g., string[])
  transformed = transformed.replace(/:\s*\w+\[\]/g, '');

  // Remove function return type annotations (e.g., : () => void)
  transformed = transformed.replace(/:\s*\([^)]*\)\s*=>\s*\w+/g, '');

  // Check if Component is already defined (with or without type annotation)
  const hasComponent = /(?:^|\n)\s*(?:const|function|class)\s+Component\b/.test(transformed);
  const hasApp = /(?:^|\n)\s*(?:const|function|class)\s+App\b/.test(transformed);

  // Handle export default Component; where Component is already defined
  // Just remove the export default, don't create a new const
  if (hasComponent) {
    transformed = transformed.replace(/export\s+default\s+Component;?\s*$/gm, '');
    transformed = transformed.replace(/export\s+default\s+Component;?\s*\n/gm, '\n');
  } else if (hasApp) {
    // If App exists, rename it to Component
    transformed = transformed.replace(/export\s+default\s+App;?\s*$/gm, 'const Component = App;');
    transformed = transformed.replace(/export\s+default\s+App;?\s*\n/gm, 'const Component = App;\n');
  } else {
    // Component doesn't exist, create it from export default
  transformed = transformed.replace(/export\s+default\s+(\w+);?/g, 'const Component = $1;');
  }

  // Handle export default function Component
  transformed = transformed.replace(/export\s+default\s+function\s+(\w+)/g, (_match, name) => {
    return name === 'Component' ? 'function Component' : `function Component`;
  });

  // Handle export default function() (anonymous)
  transformed = transformed.replace(/export\s+default\s+function\s*\(/g, 'function Component(');

  // Remove named exports (but keep the code)
  transformed = transformed.replace(/^export\s+(?!default)/gm, '');

  // Handle const/function component exports (remove export keyword)
  transformed = transformed.replace(/export\s+const\s+(\w+)\s*=/g, 'const $1 =');
  transformed = transformed.replace(/export\s+function\s+(\w+)/g, 'function $1');

  // Clean up extra whitespace and empty lines
  transformed = transformed.replace(/\n\s*\n\s*\n/g, '\n\n');
  transformed = transformed.trim();

  return transformed;
}

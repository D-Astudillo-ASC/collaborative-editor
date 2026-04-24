// Execution Strategy Resolver
// Determines how code should be executed based on language and template category

import type { Language } from '@/types';
import type { ExecutionMode, TemplateCategory, ExecutionCapability } from '@/types/execution';

interface StrategyResult {
  mode: ExecutionMode;
  capability: ExecutionCapability;
  canExecuteInBrowser: boolean;
  requiresBackend: boolean;
}

// Strategy mapping based on language and optional category
const strategyMap: Record<string, ExecutionMode> = {
  // Live Preview (React, HTML)
  'typescriptreact': 'preview',
  'typescriptreact:React': 'preview',
  'javascript:React': 'preview',
  'html': 'preview',
  'html:HTML': 'preview',

  // Console (Browser JavaScript)
  'javascript': 'console',
  'javascript:JavaScript': 'console',
  'javascript:Universal': 'console',

  // Backend Execution (Node.js, Express, Java, Python)
  'javascript:Node.js': 'backend',
  'javascript:Testing': 'backend', // Jest tests
  'typescript:Node.js': 'backend',
  'java': 'backend',
  'python': 'backend',

  // Static Analysis (TypeScript interfaces, types)
  'typescript': 'analysis',
  'typescript:TypeScript': 'analysis',
  'typescript:React': 'preview', // React hooks in TS are previewable
};

// Capability definitions for each mode
const capabilities: Record<ExecutionMode, ExecutionCapability> = {
  preview: {
    mode: 'preview',
    label: 'Live Preview',
    description: 'Renders React components, TSX, and HTML in a sandboxed iframe with hot-reload support.',
    icon: 'Eye',
    supported: true,
    requiresBackend: false,
  },
  console: {
    mode: 'console',
    label: 'Browser Console',
    description: 'Executes JavaScript directly in the browser using a Web Worker for isolation.',
    icon: 'Terminal',
    supported: true,
    requiresBackend: false,
  },
  backend: {
    mode: 'backend',
    label: 'Backend Execution',
    description: 'Requires server-side execution environment. Enable Cloud for full support.',
    icon: 'Server',
    supported: false, // Requires backend integration
    requiresBackend: true,
  },
  analysis: {
    mode: 'analysis',
    label: 'Type Analysis',
    description: 'Performs TypeScript type checking and validation without runtime execution.',
    icon: 'FileCheck',
    supported: true,
    requiresBackend: false,
  },
};

/**
 * Resolves the execution strategy for a given language and category
 */
export function resolveExecutionStrategy(
  language: Language,
  category?: TemplateCategory
): StrategyResult {
  // Try specific language:category first
  const specificKey = category ? `${language}:${category}` : null;
  const mode = (specificKey && strategyMap[specificKey]) || strategyMap[language] || 'analysis';

  const capability = capabilities[mode];

  return {
    mode,
    capability,
    canExecuteInBrowser: mode === 'preview' || mode === 'console',
    requiresBackend: mode === 'backend',
  };
}

/**
 * Checks if a language supports live preview
 */
export function supportsLivePreview(language: Language, category?: TemplateCategory): boolean {
  const strategy = resolveExecutionStrategy(language, category);
  return strategy.mode === 'preview';
}

/**
 * Checks if code can be executed in the browser
 */
export function canExecuteInBrowser(language: Language, category?: TemplateCategory): boolean {
  const strategy = resolveExecutionStrategy(language, category);
  return strategy.canExecuteInBrowser;
}

/**
 * Gets the appropriate panel label for the execution mode
 */
export function getExecutionPanelLabel(mode: ExecutionMode): string {
  const labels: Record<ExecutionMode, string> = {
    preview: 'Preview',
    console: 'Console',
    backend: 'Terminal',
    analysis: 'Diagnostics',
  };
  return labels[mode];
}

/**
 * Gets a user-friendly message for unsupported execution
 */
export function getUnsupportedMessage(mode: ExecutionMode): string {
  if (mode === 'backend') {
    return 'This code requires a backend execution environment. Enable Lovable Cloud for full server-side execution support.';
  }
  return 'Execution is not available for this code type.';
}

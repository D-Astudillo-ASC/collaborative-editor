// Execution Mode Types for Phase 3 Refined Architecture
import type { Language } from './index';

// Execution modes based on code type
export type ExecutionMode = 'preview' | 'console' | 'backend' | 'analysis';

// Template categories that determine execution behavior
export type TemplateCategory = 
  | 'React' 
  | 'Node.js' 
  | 'TypeScript' 
  | 'JavaScript' 
  | 'Testing' 
  | 'HTML'
  | 'Universal';

// Execution capability for each mode
export interface ExecutionCapability {
  mode: ExecutionMode;
  label: string;
  description: string;
  icon: string; // Lucide icon name
  supported: boolean;
  requiresBackend: boolean;
}

// Maps language + category to execution mode
export interface ExecutionStrategy {
  language: Language;
  category?: TemplateCategory;
  mode: ExecutionMode;
  capabilities: ExecutionCapability;
}

// Live Preview specific types
export interface PreviewState {
  html: string;
  css: string;
  js: string;
  error: string | null;
  isLoading: boolean;
  lastUpdate: Date;
}

// Console execution types (browser-based JS)
export interface ConsoleOutput {
  type: 'log' | 'warn' | 'error' | 'info' | 'result';
  content: string;
  timestamp: Date;
  lineNumber?: number;
}

// Backend execution types
export interface BackendExecutionRequest {
  code: string;
  language: Language;
  timeout?: number;
  environment?: Record<string, string>;
}

export interface BackendExecutionResponse {
  output: string;
  error?: string;
  exitCode: number;
  executionTime: number;
  memoryUsage?: number;
}

// Static analysis types (TypeScript, Tests)
export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  line: number;
  column: number;
  source?: string;
  code?: string | number;
}

export interface AnalysisResult {
  isValid: boolean;
  diagnostics: DiagnosticItem[];
  typeInfo?: string;
  summary: string;
}

// Unified output panel state
export interface OutputPanelState {
  mode: ExecutionMode;
  // Preview mode
  preview?: PreviewState;
  // Console mode
  consoleOutputs?: ConsoleOutput[];
  // Backend mode
  terminalOutput?: string[];
  executionResult?: BackendExecutionResponse;
  // Analysis mode
  analysisResult?: AnalysisResult;
  // Common
  status: 'idle' | 'running' | 'completed' | 'error';
  startTime?: Date;
  endTime?: Date;
}

// Execution mode configuration
export const EXECUTION_MODE_CONFIG: Record<ExecutionMode, {
  label: string;
  description: string;
  color: string;
  icon: string;
}> = {
  preview: {
    label: 'Live Preview',
    description: 'Real-time component rendering',
    color: 'text-blue-500',
    icon: 'Eye',
  },
  console: {
    label: 'Console',
    description: 'Browser JavaScript execution',
    color: 'text-yellow-500',
    icon: 'Terminal',
  },
  backend: {
    label: 'Backend',
    description: 'Server-side execution required',
    color: 'text-purple-500',
    icon: 'Server',
  },
  analysis: {
    label: 'Analysis',
    description: 'Type checking & validation',
    color: 'text-green-500',
    icon: 'FileCheck',
  },
};

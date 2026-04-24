// Document Types
export type Language = 'javascript' | 'typescript' | 'typescriptreact' | 'java' | 'python' | 'html';

// export interface Document {
//     id: string;
//     title: string;
//     language: Language;
//     content: string;
//     createdAt: Date;
//     updatedAt: Date;
//     ownerId: string;
//     collaborators: string[];
// }

export interface Document {
    id: string;
    title: string;
    lastModified: string | Date;
}
export interface DocumentCard {
    id: string;
    title: string;
    language: Language;
    updatedAt: Date;
    activeUsers: User[];
}

// User & Auth Types
export interface User {
    id: string;
    name: string;
    email: string;
    imageUrl?: string;
    color: string; // For cursor/selection color
}

export interface AuthState {
    isAuthenticated: boolean;
    isLoading: boolean;
    user: User | null;
}

// Collaboration Types
export interface CursorPosition {
    userId: string;
    position: { lineNumber: number; column: number };
    selection?: {
        startLineNumber: number;
        startColumn: number;
        endLineNumber: number;
        endColumn: number;
    };
}

export interface UserPresence {
    user: User;
    cursor: CursorPosition | null;
    isActive: boolean;
    lastSeen: Date;
}

export type ConnectionStatus = 'connected' | 'syncing' | 'disconnected' | 'reconnecting';

// Execution Types
export interface ExecutionResult {
    id: string;
    output: string;
    error?: string;
    exitCode: number;
    executionTime: number; // in ms
    timestamp: Date;
}

export type ExecutionStatus = 'idle' | 'running' | 'completed' | 'error';

// Chat Types
export interface ChatMessage {
    id: string;
    userId: string;
    user: User;
    content: string;
    timestamp: Date;
}

// AI Assistant Types
export interface AISuggestion {
    id: string;
    originalCode: string;
    suggestedCode: string;
    explanation: string;
    lineStart: number;
    lineEnd: number;
    status: 'pending' | 'applied' | 'dismissed';
}

export interface AIMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    suggestion?: AISuggestion;
    codeContext?: string;
}

// Template Types
export interface Template {
    id: string;
    name: string;
    language: Language;
    category: string;
    description: string;
    code: string;
}

// Layout Types
export type PanelLayout = 'horizontal' | 'vertical';
export type PreviewDevice = 'desktop' | 'tablet' | 'mobile';
export type PreviewZoom = 50 | 75 | 100 | 150;

// Theme Types
export type Theme = 'light' | 'dark' | 'system';

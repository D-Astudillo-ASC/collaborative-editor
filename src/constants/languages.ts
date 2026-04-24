import { Language } from '@/types';
import { 
  FileCode, 
  FileJson, 
  FileType2, 
  Coffee, 
  Code2, 
  FileText,
  LucideIcon
} from 'lucide-react';

// Language configuration
export interface LanguageConfig {
  id: Language;
  name: string;
  icon: LucideIcon;
  extension: string;
  monacoLanguage: string;
  color: string;
}

export const languageConfigs: Record<Language, LanguageConfig> = {
  javascript: {
    id: 'javascript',
    name: 'JavaScript',
    icon: FileCode,
    extension: '.js',
    monacoLanguage: 'javascript',
    color: '#f7df1e',
  },
  typescript: {
    id: 'typescript',
    name: 'TypeScript',
    icon: FileType2,
    extension: '.ts',
    monacoLanguage: 'typescript',
    color: '#3178c6',
  },
  typescriptreact: {
    id: 'typescriptreact',
    name: 'React TSX',
    icon: Code2,
    extension: '.tsx',
    monacoLanguage: 'typescript',
    color: '#61dafb',
  },
  java: {
    id: 'java',
    name: 'Java',
    icon: Coffee,
    extension: '.java',
    monacoLanguage: 'java',
    color: '#ed8b00',
  },
  python: {
    id: 'python',
    name: 'Python',
    icon: FileJson,
    extension: '.py',
    monacoLanguage: 'python',
    color: '#3776ab',
  },
  html: {
    id: 'html',
    name: 'HTML',
    icon: FileText,
    extension: '.html',
    monacoLanguage: 'html',
    color: '#e34c26',
  },
};

export const languages: Language[] = Object.keys(languageConfigs) as Language[];

export function getLanguageConfig(language: Language): LanguageConfig {
  return languageConfigs[language];
}

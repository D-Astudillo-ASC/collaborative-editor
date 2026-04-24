import { motion } from 'framer-motion';
import { FileCode, Clock, Hash, Type } from 'lucide-react';
import { languageConfigs } from '@/constants/languages';
import type { Language, ConnectionStatus } from '@/types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface StatusBarProps {
  language: Language;
  lineCount: number;
  charCount: number;
  cursorPosition?: { lineNumber: number; column: number };
  lastSynced?: Date;
  connectionStatus?: ConnectionStatus;
}

export function StatusBar({
  language,
  lineCount,
  charCount,
  cursorPosition,
  lastSynced,
  connectionStatus = 'connected',
}: StatusBarProps) {
  const languageConfig = languageConfigs[language];
  const LanguageIcon = languageConfig?.icon || FileCode;

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-500';
      case 'syncing': return 'text-yellow-500';
      case 'reconnecting': return 'text-yellow-500';
      case 'disconnected': return 'text-red-500';
      default: return 'text-muted-foreground';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-6 items-center justify-between border-t border-border bg-muted/50 px-3 text-[11px] text-muted-foreground"
    >
      {/* Left Section */}
      <div className="flex items-center gap-4">
        {/* Language */}
        <div className="flex items-center gap-1.5">
          <LanguageIcon className="h-3 w-3" style={{ color: languageConfig?.color }} />
          <span>{languageConfig?.name}</span>
        </div>

        {/* Cursor Position */}
        {cursorPosition && (
          <div className="flex items-center gap-1">
            <span>Ln {cursorPosition.lineNumber}</span>
            <span className="text-muted-foreground/50">,</span>
            <span>Col {cursorPosition.column}</span>
          </div>
        )}
      </div>

      {/* Center Section */}
      <div className="flex items-center gap-4">
        {/* Line Count */}
        <div className="flex items-center gap-1">
          <Hash className="h-3 w-3" />
          <span>{lineCount} lines</span>
        </div>

        {/* Character Count */}
        <div className="flex items-center gap-1">
          <Type className="h-3 w-3" />
          <span>{charCount.toLocaleString()} chars</span>
        </div>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-4">
        {/* Last Synced */}
        {lastSynced && (
          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span className={cn(getConnectionStatusColor())}>
              {connectionStatus === 'connected'
                ? `Saved ${formatDistanceToNow(lastSynced, { addSuffix: true })}`
                : connectionStatus === 'syncing'
                  ? 'Saving...'
                  : 'Offline'}
            </span>
          </div>
        )}

        {/* Encoding & Line Ending (standard editor info) */}
        <span>UTF-8</span>
        <span>LF</span>
      </div>
    </motion.div>
  );
}

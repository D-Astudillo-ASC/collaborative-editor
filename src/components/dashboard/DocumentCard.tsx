// import React from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
// import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
// import { languageConfigs } from '@/constants/languages';
// import type { Language } from '@/types';
import type { Document } from '@/types';

interface DocumentCardProps {
  // document: DocumentCardType;
  document: Document;
  isSelected?: boolean;
  onClick: () => void;
}

export function DocumentCard({ document, isSelected, onClick }: DocumentCardProps) {
  // TODO: Language info not available from backend yet - uncomment when backend adds language field
  // const langConfig = languageConfigs[document.language as Language];
  // const LangIcon = langConfig.icon;

  // Fallback/default language display (can be removed when backend provides language)
  // const defaultLangConfig = languageConfigs['typescript'];
  // const DefaultLangIcon = defaultLangConfig.icon;

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        "flex flex-col w-full p-4 rounded-lg border text-left transition-all",
        "bg-card hover:bg-accent/50",
        isSelected
          ? "border-primary ring-2 ring-primary/20"
          : "border-border hover:border-primary/50"
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          {/* Language icon - commented out until backend provides language field */}
          {/* <div
            className="flex items-center justify-center w-8 h-8 rounded-md"
            style={{ backgroundColor: `${langConfig.color}20` }}
          >
            <LangIcon className="h-4 w-4" style={{ color: langConfig.color }} />
          </div> */}

          {/* Fallback: Simple document icon when language is not available */}
          <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted">
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>

          <div className="min-w-0">
            <h3 className="font-medium text-sm truncate">{document.title}</h3>
            {/* Language name - commented out until backend provides language field */}
            {/* <p className="text-xs text-muted-foreground">{langConfig.name}</p> */}
            <p className="text-xs text-muted-foreground">Document</p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {formatDistanceToNow(
            typeof document.lastModified === 'string'
              ? new Date(document.lastModified)
              : document.lastModified,
            { addSuffix: true }
          )}
        </span>

        {/* Active Users */}
        {/* {document.activeUsers.length > 0 && (
          <div className="flex -space-x-1.5">
            {document.activeUsers.slice(0, 3).map((user) => (
              <Avatar key={user.id} className="h-5 w-5 border border-background">
                <AvatarImage src={user.imageUrl} alt={user.name} />
                <AvatarFallback
                  style={{ backgroundColor: user.color }}
                  className="text-[8px] text-white"
                >
                  {user.name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
            ))}
            {document.activeUsers.length > 3 && (
              <div className="flex items-center justify-center h-5 w-5 rounded-full bg-muted text-[8px] font-medium border border-background">
                +{document.activeUsers.length - 3}
              </div>
            )}
          </div>
        )} */}
      </div>
    </motion.button>
  );
}

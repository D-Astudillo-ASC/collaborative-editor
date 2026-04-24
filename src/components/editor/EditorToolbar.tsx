import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronLeft,
  Play,
  Share2,
  FileCode,
  Check,
  X,
  LayoutTemplate,
  Users,
  Wifi,
  WifiOff,
  Eye,
  Terminal,
  Server,
  FileCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ThemeToggle } from '@/components/ThemeToggle';
import { languageConfigs, languages } from '@/constants/languages';
import type { Language, UserPresence, ConnectionStatus } from '@/types';
import type { ExecutionMode } from '@/types/execution';
import { cn } from '@/lib/utils';

interface EditorToolbarProps {
  title: string;
  language: Language;
  onTitleChange: (title: string) => void;
  onLanguageChange: (language: Language) => void;
  onOpenTemplates: () => void;
  onShare: () => void;
  onRun?: () => void;
  canRun?: boolean;
  collaborators?: UserPresence[];
  connectionStatus?: ConnectionStatus;
  templateCount?: number;
  onBack?: () => void;
  executionMode?: ExecutionMode;
}

export function EditorToolbar({
  title,
  language,
  onTitleChange,
  onLanguageChange,
  onOpenTemplates,
  onShare,
  onRun,
  canRun = false,
  collaborators = [],
  connectionStatus = 'connected',
  templateCount = 17,
  onBack,
  executionMode = 'console',
}: EditorToolbarProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState(title);

  const languageConfig = languageConfigs[language];
  const LanguageIcon = languageConfig?.icon || FileCode;

  const activeCollaborators = collaborators.filter(c => c.isActive);

  // Execution mode display
  const getModeConfig = () => {
    switch (executionMode) {
      case 'preview':
        return { icon: Eye, label: 'Preview', color: 'text-blue-500 bg-blue-500/10' };
      case 'console':
        return { icon: Terminal, label: 'Console', color: 'text-yellow-500 bg-yellow-500/10' };
      case 'backend':
        return { icon: Server, label: 'Backend', color: 'text-purple-500 bg-purple-500/10' };
      case 'analysis':
        return { icon: FileCheck, label: 'Analysis', color: 'text-green-500 bg-green-500/10' };
      default:
        return { icon: Terminal, label: 'Console', color: 'text-muted-foreground bg-muted' };
    }
  };

  const modeConfig = getModeConfig();
  const ModeIcon = modeConfig.icon;

  const handleTitleSubmit = () => {
    if (editedTitle.trim()) {
      onTitleChange(editedTitle.trim());
    } else {
      setEditedTitle(title);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleTitleSubmit();
    } else if (e.key === 'Escape') {
      setEditedTitle(title);
      setIsEditingTitle(false);
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'bg-green-500';
      case 'syncing': return 'bg-yellow-500 animate-pulse';
      case 'reconnecting': return 'bg-yellow-500 animate-pulse';
      case 'disconnected': return 'bg-red-500';
      default: return 'bg-muted';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'syncing': return 'Syncing...';
      case 'reconnecting': return 'Reconnecting...';
      case 'disconnected': return 'Disconnected';
      default: return 'Unknown';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex h-12 items-center justify-between gap-4 border-b border-border bg-card/80 px-4 backdrop-blur-sm"
    >
      {/* Left Section: Back + Title + Language */}
      <div className="flex items-center gap-3">
        {/* Back Button */}
        {onBack && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onBack}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to Dashboard</TooltipContent>
          </Tooltip>
        )}

        {/* Editable Title */}
        {isEditingTitle ? (
          <div className="flex items-center gap-2">
            <Input
              value={editedTitle}
              onChange={(e) => setEditedTitle(e.target.value)}
              onBlur={handleTitleSubmit}
              onKeyDown={handleTitleKeyDown}
              className="h-7 w-48 text-sm font-medium"
              autoFocus
            />
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleTitleSubmit}>
              <Check className="h-3.5 w-3.5 text-green-500" />
            </Button>
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => {
              setEditedTitle(title);
              setIsEditingTitle(false);
            }}>
              <X className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="rounded px-2 py-1 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            {title}
          </button>
        )}

        {/* Language Selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs">
              <LanguageIcon className="h-3.5 w-3.5" style={{ color: languageConfig?.color }} />
              <span>{languageConfig?.name}</span>
              <ChevronDown className="h-3 w-3 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {languages.map((lang) => {
              const config = languageConfigs[lang];
              const Icon = config.icon;
              return (
                <DropdownMenuItem
                  key={lang}
                  onClick={() => onLanguageChange(lang)}
                  className="gap-2"
                >
                  <Icon className="h-4 w-4" style={{ color: config.color }} />
                  <span>{config.name}</span>
                  {lang === language && <Check className="ml-auto h-4 w-4" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Center Section: Execution Mode + Connection Status + Collaborators */}
      <div className="flex items-center gap-4">
        {/* Execution Mode Indicator */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium",
              modeConfig.color
            )}>
              <ModeIcon className="h-3 w-3" />
              <span>{modeConfig.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p className="font-medium">{modeConfig.label} Mode</p>
            <p className="text-xs text-muted-foreground">
              {executionMode === 'preview' && 'Live rendering of React/HTML components'}
              {executionMode === 'console' && 'Browser-based JavaScript execution'}
              {executionMode === 'backend' && 'Server-side code execution'}
              {executionMode === 'analysis' && 'TypeScript type checking'}
            </p>
          </TooltipContent>
        </Tooltip>
        {/* Connection Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5">
              <div className={cn("h-2 w-2 rounded-full", getConnectionStatusColor())} />
              <span className="text-xs text-muted-foreground">
                {getConnectionStatusText()}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            {connectionStatus === 'connected' ? (
              <div className="flex items-center gap-1.5">
                <Wifi className="h-3.5 w-3.5" />
                <span>Real-time sync active</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <WifiOff className="h-3.5 w-3.5" />
                <span>Changes will sync when reconnected</span>
              </div>
            )}
          </TooltipContent>
        </Tooltip>

        {/* Active Collaborators */}
        {activeCollaborators.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex -space-x-2">
                  {activeCollaborators.slice(0, 3).map((collab) => (
                    <Avatar
                      key={collab.user.id}
                      className="h-6 w-6 border-2 border-background"
                    >
                      <AvatarImage src={collab.user.imageUrl} alt={collab.user.name} />
                      <AvatarFallback
                        className="text-[10px]"
                        style={{ backgroundColor: collab.user.color }}
                      >
                        {collab.user.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {activeCollaborators.length > 3 && (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
                      +{activeCollaborators.length - 3}
                    </div>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                <p className="font-medium">Active collaborators</p>
                {activeCollaborators.map((collab) => (
                  <div key={collab.user.id} className="flex items-center gap-2 text-sm">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: collab.user.color }}
                    />
                    <span>{collab.user.name}</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Right Section: Actions */}
      <div className="flex items-center gap-2">
        {/* Templates Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5"
              onClick={onOpenTemplates}
            >
              <LayoutTemplate className="h-4 w-4" />
              <span className="hidden sm:inline">Templates</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                {templateCount}
              </Badge>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Insert code template</TooltipContent>
        </Tooltip>

        {/* Run Button (for executable languages) */}
        {canRun && onRun && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="h-8 gap-1.5 bg-green-600 hover:bg-green-700"
                onClick={onRun}
              >
                <Play className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Run</span>
                <kbd className="ml-1 hidden rounded bg-green-700/50 px-1 text-[10px] sm:inline">
                  Ctrl+↵
                </kbd>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Execute code (Ctrl+Enter)</TooltipContent>
          </Tooltip>
        )}

        {/* Share Button */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={onShare}>
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Share</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Share document link</TooltipContent>
        </Tooltip>

        {/* Theme Toggle */}
        <ThemeToggle className="h-8 w-8" />
      </div>
    </motion.div>
  );
}

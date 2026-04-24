import { useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  Edit3,
  Share2,
  Play,
  Sun,
  Moon,
  Menu,
  Users,
  Wifi,
  WifiOff,
  Loader2,
  LayoutTemplate,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useTheme } from '@/contexts/ThemeContext';
import { languageConfigs, languages } from '@/constants/languages';
import type { Language, User, ConnectionStatus } from '@/types';

interface TopBarProps {
  documentTitle: string;
  language: Language;
  connectionStatus: ConnectionStatus;
  activeUsers: User[];
  templateCount?: number;
  canExecute?: boolean;
  onTitleChange: (title: string) => void;
  onLanguageChange: (language: Language) => void;
  onToggleSidebar: () => void;
  onOpenTemplates: () => void;
  onShare: () => void;
  onExecute: () => void;
}

export function TopBar({
  documentTitle,
  language,
  connectionStatus,
  activeUsers,
  templateCount = 0,
  canExecute = false,
  onTitleChange,
  onLanguageChange,
  onToggleSidebar,
  onOpenTemplates,
  onShare,
  onExecute,
}: TopBarProps) {
  const { toggleTheme, isDark } = useTheme();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(documentTitle);

  const handleTitleSubmit = () => {
    setIsEditingTitle(false);
    if (titleValue.trim() && titleValue !== documentTitle) {
      onTitleChange(titleValue.trim());
    } else {
      setTitleValue(documentTitle);
    }
  };

  const statusConfig = {
    connected: { icon: Wifi, label: 'Connected', className: 'text-success' },
    syncing: { icon: Loader2, label: 'Syncing', className: 'text-warning animate-spin' },
    disconnected: { icon: WifiOff, label: 'Disconnected', className: 'text-destructive' },
    reconnecting: { icon: Loader2, label: 'Reconnecting', className: 'text-warning animate-spin' },
  };

  const status = statusConfig[connectionStatus];
  const StatusIcon = status.icon;

  const langConfig = languageConfigs[language];
  const LangIcon = langConfig.icon;

  return (
    <div className="flex items-center justify-between h-12 px-3 gap-3">
      {/* Left Section */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleSidebar}
          className="h-8 w-8"
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Document Title */}
        {isEditingTitle ? (
          <Input
            value={titleValue}
            onChange={(e) => setTitleValue(e.target.value)}
            onBlur={handleTitleSubmit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleTitleSubmit();
              if (e.key === 'Escape') {
                setTitleValue(documentTitle);
                setIsEditingTitle(false);
              }
            }}
            className="h-7 w-48 text-sm font-medium"
            autoFocus
          />
        ) : (
          <button
            onClick={() => setIsEditingTitle(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-accent transition-colors group"
          >
            <span className="font-medium text-sm">{documentTitle}</span>
            <Edit3 className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </button>
        )}

        {/* Language Selector */}
        <Select value={language} onValueChange={(v) => onLanguageChange(v as Language)}>
          <SelectTrigger className="h-8 w-36 text-sm">
            <div className="flex items-center gap-2">
              <LangIcon className="h-4 w-4" style={{ color: langConfig.color }} />
              <SelectValue />
            </div>
          </SelectTrigger>
          <SelectContent>
            {languages.map((lang) => {
              const config = languageConfigs[lang];
              const Icon = config.icon;
              return (
                <SelectItem key={lang} value={lang}>
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: config.color }} />
                    <span>{config.name}</span>
                  </div>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>

      {/* Center Section - Templates */}
      <div className="flex items-center">
        <Button
          variant="outline"
          size="sm"
          onClick={onOpenTemplates}
          className="gap-2"
        >
          <LayoutTemplate className="h-4 w-4" />
          Templates
          {templateCount > 0 && (
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
              {templateCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Right Section */}
      <div className="flex items-center gap-2">
        {/* Connection Status */}
        <Tooltip>
          <TooltipTrigger asChild>
            <div className={cn("flex items-center gap-1.5 px-2 py-1 rounded-md", status.className)}>
              <StatusIcon className="h-3.5 w-3.5" />
              <span className="text-xs font-medium hidden sm:inline">{status.label}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{status.label}</TooltipContent>
        </Tooltip>

        {/* Active Users */}
        {activeUsers.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 px-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <div className="flex -space-x-2 avatar-stack">
                  {activeUsers.slice(0, 4).map((user) => (
                    <Avatar key={user.id} className="h-6 w-6 border-2 border-background">
                      <AvatarImage src={user.imageUrl} alt={user.name} />
                      <AvatarFallback style={{ backgroundColor: user.color }} className="text-[10px] text-white">
                        {user.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  ))}
                  {activeUsers.length > 4 && (
                    <div className="flex items-center justify-center h-6 w-6 rounded-full bg-muted text-xs font-medium">
                      +{activeUsers.length - 4}
                    </div>
                  )}
                </div>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <div className="space-y-1">
                {activeUsers.map((user) => (
                  <div key={user.id} className="flex items-center gap-2">
                    <div
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: user.color }}
                    />
                    <span>{user.name}</span>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        )}

        {/* Share Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={onShare}
          className="gap-2"
        >
          <Share2 className="h-4 w-4" />
          <span className="hidden sm:inline">Share</span>
        </Button>

        {/* Execute Button (for Java/Python) */}
        {canExecute && (
          <Button
            size="sm"
            onClick={onExecute}
            className="gap-2 bg-success hover:bg-success/90 text-success-foreground"
          >
            <Play className="h-4 w-4" />
            <span className="hidden sm:inline">Run</span>
          </Button>
        )}

        {/* Theme Toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-8 w-8"
            >
              <motion.div
                initial={false}
                animate={{ rotate: isDark ? 0 : 180 }}
                transition={{ duration: 0.3 }}
              >
                {isDark ? (
                  <Moon className="h-4 w-4" />
                ) : (
                  <Sun className="h-4 w-4" />
                )}
              </motion.div>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

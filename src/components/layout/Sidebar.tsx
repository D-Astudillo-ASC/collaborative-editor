import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import {
  FileCode,
  FolderOpen,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useClerk } from '@clerk/clerk-react';
// import type { DocumentCard as DocumentCardType } from '@/types';
import type { Document } from '@/types';

interface SidebarProps {
  // TODO: Update to use DocumentCardType when backend provides language and activeUsers fields
  documents: Document[];
  selectedDocumentId?: string;
  onSelectDocument: (id: string) => void;
  onCreateDocument: () => void;
  onToggleSidebar: () => void;
  isCollapsed?: boolean;
}

export function Sidebar({
  documents,
  selectedDocumentId,
  onSelectDocument,
  isCollapsed = false,
}: SidebarProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { signOut } = useClerk();

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };
  return (
    <div className="flex h-full flex-col">
      {/* Profile Header */}
      <div className="flex items-center gap-3 p-3 border-b border-sidebar-border">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={() => navigate('/profile')}
              className="flex-shrink-0 hover:opacity-80 transition-opacity"
            >
              <Avatar className="h-8 w-8 border-2 border-sidebar-border">
                <AvatarImage src={user?.imageUrl} alt={user?.name} />
                <AvatarFallback className="text-xs bg-primary text-primary-foreground">
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">View Profile</TooltipContent>
        </Tooltip>
        {!isCollapsed && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex-1 min-w-0"
          >
            <p className="text-sm font-medium text-sidebar-foreground truncate">
              {user?.name || 'User'}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user?.email || 'user@example.com'}
            </p>
          </motion.div>
        )}
      </div>

      {/* New Document Button */}
      {/* <div className="p-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              onClick={onCreateDocument}
              className={cn(
                "w-full justify-start gap-2 border-dashed",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isCollapsed && "justify-center px-2"
              )}
            >
              <PlusCircle className="h-4 w-4 text-primary" />
              {!isCollapsed && <span>New Document</span>}
            </Button>
          </TooltipTrigger>
          {isCollapsed && (
            <TooltipContent side="right">New Document</TooltipContent>
          )}
        </Tooltip>
      </div> */}

      {/* Documents List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {documents.map((doc) => (
          <Tooltip key={doc.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onSelectDocument(doc.id)}
                className={cn(
                  "flex items-center gap-2 w-full rounded-md px-2 py-2 text-sm transition-colors",
                  "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  selectedDocumentId === doc.id && "bg-sidebar-accent text-sidebar-accent-foreground",
                  isCollapsed && "justify-center"
                )}
              >
                <FileCode className="h-4 w-4 flex-shrink-0" />
                {!isCollapsed && (
                  <span className="truncate">{doc.title}</span>
                )}
              </button>
            </TooltipTrigger>
            {isCollapsed && (
              <TooltipContent side="right">{doc.title}</TooltipContent>
            )}
          </Tooltip>
        ))}

        {documents.length === 0 && !isCollapsed && (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50 mb-2" />
            <p className="text-sm text-muted-foreground">No documents yet</p>
            <p className="text-xs text-muted-foreground/70">Create your first document</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-sidebar-border p-2 space-y-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={() => navigate('/settings')}
              className={cn(
                "w-full justify-start gap-2",
                "text-sidebar-foreground hover:bg-sidebar-accent",
                isCollapsed && "justify-center px-2"
              )}
            >
              <Settings className="h-4 w-4" />
              {!isCollapsed && <span>Settings</span>}
            </Button>
          </TooltipTrigger>
          {isCollapsed && (
            <TooltipContent side="right">Settings</TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              className={cn(
                "w-full justify-start gap-2",
                "text-sidebar-foreground hover:bg-sidebar-accent",
                isCollapsed && "justify-center px-2"
              )}
            >
              <HelpCircle className="h-4 w-4" />
              {!isCollapsed && <span>Help</span>}
            </Button>
          </TooltipTrigger>
          {isCollapsed && (
            <TooltipContent side="right">Help</TooltipContent>
          )}
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              onClick={handleSignOut}
              className={cn(
                "w-full justify-start gap-2",
                "text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive",
                isCollapsed && "justify-center px-2"
              )}
            >
              <LogOut className="h-4 w-4" />
              {!isCollapsed && <span>Sign Out</span>}
            </Button>
          </TooltipTrigger>
          {isCollapsed && (
            <TooltipContent side="right">Sign Out</TooltipContent>
          )}
        </Tooltip>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/ThemeToggle';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useNotificationInbox } from '@/hooks/useNotificationInbox';
import type { InAppNotification } from '@/hooks/useNotificationInbox';

export default function Notifications() {
  const navigate = useNavigate();
  const [clearAllOpen, setClearAllOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const {
    notifications,
    unreadCount,
    isLoading,
    markRead,
    markAllRead,
    markAllReadPending,
    deleteOne,
    deleteAll,
    deleteAllPending,
  } = useNotificationInbox();

  const openItem = async (n: InAppNotification) => {
    try {
      if (!n.readAt) await markRead(n.id);
    } catch {
      /* ignore */
    }
    if (n.documentId) {
      navigate(`/editor/${n.documentId}`);
    }
  };

  const handleRemove = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteOne(id);
    } catch {
      /* ignore */
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      await deleteAll();
      setClearAllOpen(false);
    } catch {
      /* ignore */
    }
  };

  return (
    <AppLayout>
      <div className="flex h-full flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card/50 px-4 py-3 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9" asChild>
              <Link to="/dashboard" aria-label="Back to dashboard">
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-sm font-semibold">Message center</h1>
              {unreadCount > 0 ? (
                <p className="text-[11px] text-muted-foreground">{unreadCount} unread</p>
              ) : (
                <p className="text-[11px] text-muted-foreground">All caught up</p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {unreadCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                disabled={markAllReadPending}
                onClick={() => void markAllRead()}
              >
                {markAllReadPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  'Mark all read'
                )}
              </Button>
            ) : null}
            {notifications.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={deleteAllPending}
                onClick={() => setClearAllOpen(true)}
              >
                Clear all
              </Button>
            ) : null}
            <NotificationBell />
            <ThemeToggle className="h-9 w-9" />
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4">
          {isLoading && notifications.length === 0 ? (
            <div className="flex justify-center py-20 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No messages yet. When someone requests access to your documents, or when your requests
              are approved, they will show up here.
            </p>
          ) : (
            <ul className="mx-auto max-w-xl divide-y divide-border rounded-lg border border-border bg-card">
              {notifications.map((n) => (
                <li key={n.id} className="flex items-stretch gap-0">
                  <button
                    type="button"
                    className={cn(
                      'flex min-w-0 flex-1 flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      !n.readAt && 'bg-muted/25',
                    )}
                    onClick={() => void openItem(n)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{n.title}</span>
                      {!n.readAt ? (
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    {n.body ? (
                      <p className="text-xs text-muted-foreground">{n.body}</p>
                    ) : null}
                    <p className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                      {n.documentId ? ' · Open document' : ''}
                    </p>
                  </button>
                  <div className="flex shrink-0 items-start border-l border-border py-2 pr-2 pl-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-muted-foreground hover:text-destructive"
                          disabled={deletingId === n.id}
                          aria-label="Remove message"
                          onClick={(e) => {
                            e.preventDefault();
                            void handleRemove(n.id);
                          }}
                        >
                          {deletingId === n.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="left">Remove from inbox</TooltipContent>
                    </Tooltip>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>

      <AlertDialog open={clearAllOpen} onOpenChange={setClearAllOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all messages?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes every notification from your inbox. You can’t undo this.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllPending}>Cancel</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={deleteAllPending}
              onClick={() => void handleClearAll()}
            >
              {deleteAllPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                'Clear all'
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}

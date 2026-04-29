import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Loader2, X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useNotificationInbox } from '@/hooks/useNotificationInbox';

interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({ className }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const {
    notifications,
    unreadCount,
    isLoading,
    refetch,
    markRead,
    deleteOne,
  } = useNotificationInbox();

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const preview = notifications.slice(0, 8);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) void refetch();
  };

  const handleRowClick = async (n: (typeof notifications)[0]) => {
    try {
      if (!n.readAt) await markRead(n.id);
    } catch {
      /* ignore */
    }
    setOpen(false);
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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn('relative h-8 w-8 shrink-0', className)}
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 ? (
            <Badge
              variant="destructive"
              className="absolute -right-0.5 -top-0.5 h-4 min-w-4 px-1 text-[10px] leading-none"
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] p-0" align="end">
        <div className="border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Messages</p>
          <p className="text-[11px] text-muted-foreground">Access requests and updates</p>
        </div>
        {isLoading && preview.length === 0 ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : preview.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
        ) : (
          <ScrollArea className="max-h-[min(60vh,320px)]">
            <ul className="divide-y divide-border">
              {preview.map((n) => (
                <li key={n.id} className="flex items-stretch gap-0">
                  <button
                    type="button"
                    className={cn(
                      'flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/80',
                      !n.readAt && 'bg-muted/40',
                    )}
                    onClick={() => void handleRowClick(n)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium leading-snug">{n.title}</span>
                      {!n.readAt ? (
                        <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      ) : null}
                    </div>
                    {n.body ? (
                      <span className="text-xs text-muted-foreground line-clamp-2">{n.body}</span>
                    ) : null}
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-start border-l border-border py-1.5 pr-1 pl-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                      aria-label="Remove message"
                      disabled={deletingId === n.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleRemove(n.id);
                      }}
                    >
                      {deletingId === n.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
        <div className="border-t border-border p-2">
          <Button variant="secondary" className="h-8 w-full text-xs" asChild>
            <Link to="/notifications" onClick={() => setOpen(false)}>
              Open message center
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

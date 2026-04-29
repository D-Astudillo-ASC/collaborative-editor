import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/config/backend';

export const NOTIFICATION_INBOX_KEY = ['notifications', 'inbox'] as const;

export interface InAppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  documentId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

async function fetchInbox(getAccessToken: () => Promise<string | null>) {
  const t = await getAccessToken();
  if (!t) throw new Error('unauthorized');
  const res = await fetch(apiUrl('/api/notifications'), {
    headers: { Authorization: `Bearer ${t}` },
  });
  if (!res.ok) throw new Error('failed');
  return res.json() as Promise<{
    notifications: InAppNotification[];
    unreadCount: number;
  }>;
}

export function useNotificationInbox() {
  const { getAccessToken, isLoaded, isAuthenticated } = useAuth();
  const qc = useQueryClient();

  const inboxQuery = useQuery({
    queryKey: NOTIFICATION_INBOX_KEY,
    queryFn: () => fetchInbox(getAccessToken),
    enabled: isLoaded && isAuthenticated,
    staleTime: 0,
    refetchInterval: 45_000,
    refetchOnWindowFocus: true,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const t = await getAccessToken();
      if (!t) throw new Error('unauthorized');
      const res = await fetch(apiUrl(`/api/notifications/${id}/read`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY }),
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const t = await getAccessToken();
      if (!t) throw new Error('unauthorized');
      const res = await fetch(apiUrl('/api/notifications/mark-all-read'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY }),
  });

  const deleteOne = useMutation({
    mutationFn: async (id: string) => {
      const t = await getAccessToken();
      if (!t) throw new Error('unauthorized');
      const res = await fetch(apiUrl(`/api/notifications/${id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY }),
  });

  const deleteAll = useMutation({
    mutationFn: async () => {
      const t = await getAccessToken();
      if (!t) throw new Error('unauthorized');
      const res = await fetch(apiUrl('/api/notifications'), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error('failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY }),
  });

  return {
    notifications: inboxQuery.data?.notifications ?? [],
    unreadCount: inboxQuery.data?.unreadCount ?? 0,
    isLoading: inboxQuery.isLoading,
    isFetching: inboxQuery.isFetching,
    refetch: inboxQuery.refetch,
    markRead: markRead.mutateAsync,
    markAllRead: markAllRead.mutateAsync,
    markReadPending: markRead.isPending,
    markAllReadPending: markAllRead.isPending,
    deleteOne: deleteOne.mutateAsync,
    deleteAll: deleteAll.mutateAsync,
    deleteOnePending: deleteOne.isPending,
    deleteAllPending: deleteAll.isPending,
  };
}

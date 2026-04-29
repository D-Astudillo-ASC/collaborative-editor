import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, Link2, Loader2, Search, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { apiUrl } from '@/config/backend';
import { cn } from '@/lib/utils';
import { NOTIFICATION_INBOX_KEY } from '@/hooks/useNotificationInbox';

export type DocumentAccessRole = 'owner' | 'editor' | 'viewer';

interface MemberRow {
  userId: string;
  role: DocumentAccessRole;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface PendingAccessRequest {
  id: string;
  requesterUserId: string;
  requestedRole: 'editor' | 'viewer';
  createdAt: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

export interface DirectoryUser {
  userId: string | null;
  clerkUserId: string | null;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}

interface DocumentShareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  linkToken: string | null;
  canManageMembers: boolean;
}

export function DocumentShareDialog({
  open,
  onOpenChange,
  documentId,
  linkToken,
  canManageMembers,
}: DocumentShareDialogProps) {
  const queryClient = useQueryClient();
  const { getAccessToken } = useAuth();
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [pendingAccessRequests, setPendingAccessRequests] = useState<PendingAccessRequest[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [resolvingAccessRequestId, setResolvingAccessRequestId] = useState<string | null>(null);
  const [inviteRole, setInviteRole] = useState<'editor' | 'viewer'>('editor');
  const [adding, setAdding] = useState(false);
  const [linkMode, setLinkMode] = useState<'view' | 'edit'>('edit');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [searchResults, setSearchResults] = useState<DirectoryUser[]>([]);
  const [searchSource, setSearchSource] = useState<'clerk' | 'database' | 'none' | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  const loadMembers = useCallback(async () => {
    if (!documentId || !canManageMembers) return;
    const t = await getAccessToken();
    if (!t) return;
    setLoadingList(true);
    try {
      const res = await fetch(apiUrl(`/api/documents/${documentId}/members`), {
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) throw new Error(`load failed: ${res.status}`);
      const data = await res.json();
      setMembers(data.members || []);
      setPendingAccessRequests(data.pendingAccessRequests || []);
    } catch {
      toast.error('Could not load people with access');
    } finally {
      setLoadingList(false);
    }
  }, [documentId, canManageMembers, getAccessToken]);

  useEffect(() => {
    if (!open) return;
    void queryClient.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY });
    if (!canManageMembers) return;
    void loadMembers();
    setGeneratedUrl(null);
    setPickerOpen(false);
    setSearchInput('');
    setDebouncedSearch('');
    setSearchResults([]);
    setSearchSource(null);
  }, [open, canManageMembers, loadMembers, queryClient]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedSearch(searchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    if (!documentId || !canManageMembers || !pickerOpen) return;
    if (debouncedSearch.length < 2) {
      setSearchResults([]);
      setSearchSource('none');
      return;
    }
    let cancelled = false;
    (async () => {
      setSearchLoading(true);
      try {
        const t = await getAccessToken();
        if (!t) return;
        const params = new URLSearchParams({ q: debouncedSearch, documentId });
        const res = await fetch(apiUrl(`/api/users/search?${params}`), {
          headers: { Authorization: `Bearer ${t}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setSearchResults([]);
          setSearchSource(null);
          if (res.status === 429) {
            toast.error('Too many searches', {
              description: typeof data.message === 'string' ? data.message : undefined,
            });
          }
          return;
        }
        setSearchResults(Array.isArray(data.users) ? data.users : []);
        setSearchSource(data.source === 'clerk' || data.source === 'database' ? data.source : 'none');
      } catch {
        if (!cancelled) {
          setSearchResults([]);
          setSearchSource(null);
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch, documentId, canManageMembers, pickerOpen, getAccessToken]);

  const memberUrl = documentId
    ? `${window.location.origin}/editor/${documentId}${linkToken ? `?token=${encodeURIComponent(linkToken)}` : ''}`
    : '';

  const copyText = async (text: string, okMsg: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(okMsg);
    } catch {
      toast.error('Could not copy');
    }
  };

  const postAddMember = async (body: Record<string, unknown>) => {
    if (!documentId) return false;
    const t = await getAccessToken();
    if (!t) return false;
    setAdding(true);
    try {
      const res = await fetch(apiUrl(`/api/documents/${documentId}/members`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ ...body, role: inviteRole }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg =
          typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : res.statusText;
        if (res.status === 429) {
          toast.error('Too many invitations', { description: msg });
        } else {
          toast.error('Could not add person', { description: msg });
        }
        return false;
      }
      toast.success('Added to document');
      await loadMembers();
      return true;
    } finally {
      setAdding(false);
    }
  };

  const handlePickUser = async (row: DirectoryUser) => {
    const payload =
      row.clerkUserId && row.clerkUserId.length > 0
        ? { clerkUserId: row.clerkUserId }
        : row.userId
          ? { userId: row.userId }
          : null;
    if (!payload) {
      toast.error('Invalid selection');
      return;
    }
    const ok = await postAddMember(payload);
    if (ok) {
      setPickerOpen(false);
      setSearchInput('');
      setDebouncedSearch('');
      setSearchResults([]);
    }
  };

  const handleRoleChange = async (userId: string, role: 'editor' | 'viewer') => {
    if (!documentId) return;
    const t = await getAccessToken();
    if (!t) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${documentId}/members/${userId}`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        toast.error('Could not update role');
        return;
      }
      await loadMembers();
      toast.success('Role updated');
    } catch {
      toast.error('Could not update role');
    }
  };

  const handleRemoveMember = async (userId: string) => {
    if (!documentId) return;
    const t = await getAccessToken();
    if (!t) return;
    try {
      const res = await fetch(apiUrl(`/api/documents/${documentId}/members/${userId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${t}` },
      });
      if (!res.ok) {
        toast.error('Could not remove');
        return;
      }
      await loadMembers();
      toast.success('Removed from document');
    } catch {
      toast.error('Could not remove');
    }
  };

  const handleResolveAccessRequest = async (requestId: string, decision: 'approve' | 'deny') => {
    if (!documentId) return;
    const t = await getAccessToken();
    if (!t) return;
    setResolvingAccessRequestId(requestId);
    try {
      const res = await fetch(
        apiUrl(`/api/documents/${documentId}/access-requests/${requestId}/resolve`),
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${t}`,
          },
          body: JSON.stringify({ decision }),
        },
      );
      if (!res.ok) {
        toast.error('Could not update request');
        return;
      }
      await loadMembers();
      void queryClient.invalidateQueries({ queryKey: NOTIFICATION_INBOX_KEY });
      toast.success(decision === 'approve' ? 'Access granted' : 'Request declined');
    } catch {
      toast.error('Could not update request');
    } finally {
      setResolvingAccessRequestId(null);
    }
  };

  const handleGenerateLink = async () => {
    if (!documentId || !canManageMembers) return;
    const t = await getAccessToken();
    if (!t) return;
    setGeneratingLink(true);
    try {
      const res = await fetch(apiUrl(`/api/documents/${documentId}/share-link`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${t}`,
        },
        body: JSON.stringify({ mode: linkMode === 'edit' ? 'edit' : 'view' }),
      });
      if (!res.ok) {
        toast.error('Could not create link');
        return;
      }
      const data = await res.json();
      const url = `${window.location.origin}/editor/${documentId}?token=${encodeURIComponent(data.token)}`;
      setGeneratedUrl(url);
      await copyText(url, 'Share link copied');
    } catch {
      toast.error('Could not create link');
    } finally {
      setGeneratingLink(false);
    }
  };

  const searchHint =
    searchSource === 'clerk'
      ? 'Searching your Clerk app (all registered users).'
      : searchSource === 'database'
        ? 'Searching people who have opened this app at least once (set CLERK_SECRET_KEY for full directory).'
        : debouncedSearch.length >= 2
          ? null
          : 'Type at least 2 characters.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-md overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Share document</DialogTitle>
          <DialogDescription>
            {canManageMembers
              ? 'Search for people like Google Docs or use a link. Only the owner can manage access.'
              : 'Copy a link to open this document. You can’t change who has access.'}
          </DialogDescription>
        </DialogHeader>

        {!canManageMembers ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Document URL</Label>
              <div className="flex gap-2">
                <Input readOnly value={memberUrl} className="font-mono text-xs" />
                <Button type="button" variant="secondary" onClick={() => void copyText(memberUrl, 'Copied')}>
                  Copy
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                People already added by the owner can open this URL while signed in. If you used a share link,
                copying includes the same access as your current session.
              </p>
            </div>
          </div>
        ) : (
          <Tabs defaultValue="people" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="people">People</TabsTrigger>
              <TabsTrigger value="link">Link</TabsTrigger>
            </TabsList>

            <TabsContent value="people" className="mt-4 space-y-4">
              <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
                <Label className="text-xs font-medium">Add people</Label>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                  <Popover
                    open={pickerOpen}
                    onOpenChange={(o) => {
                      setPickerOpen(o);
                      if (!o) {
                        setSearchInput('');
                        setDebouncedSearch('');
                        setSearchResults([]);
                        setSearchSource(null);
                      }
                    }}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        className={cn('w-full justify-between sm:max-w-[240px]', !pickerOpen && 'font-normal')}
                        disabled={adding}
                      >
                        <span className="flex items-center gap-2">
                          <Search className="h-4 w-4 opacity-70" />
                          Search people
                        </span>
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(calc(100vw-2rem),22rem)] p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Name or email…"
                          value={searchInput}
                          onValueChange={setSearchInput}
                        />
                        {searchHint ? (
                          <p className="border-b px-3 py-2 text-[11px] text-muted-foreground">{searchHint}</p>
                        ) : null}
                        <CommandList>
                          {searchLoading ? (
                            <div className="flex justify-center py-8 text-muted-foreground">
                              <Loader2 className="h-6 w-6 animate-spin" />
                            </div>
                          ) : (
                            <>
                              <CommandEmpty>No matching people.</CommandEmpty>
                              <CommandGroup>
                                {searchResults.map((row, idx) => {
                                  const label = row.name || row.email || 'User';
                                  const sub = row.email && row.name ? row.email : null;
                                  return (
                                    <CommandItem
                                      key={`${row.clerkUserId || row.userId || idx}`}
                                      value={`${row.clerkUserId || ''}-${row.userId || ''}-${idx}`}
                                      disabled={adding}
                                      onSelect={() => void handlePickUser(row)}
                                      className="flex cursor-pointer items-center gap-2"
                                    >
                                      <Avatar className="h-8 w-8">
                                        <AvatarImage src={row.avatarUrl || undefined} alt="" />
                                        <AvatarFallback className="text-xs">
                                          {label.charAt(0).toUpperCase()}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium">{label}</div>
                                        {sub ? (
                                          <div className="truncate text-xs text-muted-foreground">{sub}</div>
                                        ) : null}
                                      </div>
                                    </CommandItem>
                                  );
                                })}
                              </CommandGroup>
                            </>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Select
                    value={inviteRole}
                    onValueChange={(v) => setInviteRole(v === 'viewer' ? 'viewer' : 'editor')}
                  >
                    <SelectTrigger className="w-full sm:w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="editor">Can edit</SelectItem>
                      <SelectItem value="viewer">Can view</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-medium">People with access</Label>
                {loadingList ? (
                  <div className="flex justify-center py-6 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : (
                  <ul className="divide-y rounded-md border border-border/60">
                    {members.map((m) => (
                      <li key={m.userId} className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">{m.name || m.email || 'User'}</div>
                          {m.email ? (
                            <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                          ) : null}
                        </div>
                        {m.role === 'owner' ? (
                          <span className="text-xs font-medium text-muted-foreground">Owner</span>
                        ) : (
                          <>
                            <Select
                              value={m.role}
                              onValueChange={(v) =>
                                void handleRoleChange(m.userId, v === 'viewer' ? 'viewer' : 'editor')
                              }
                            >
                              <SelectTrigger className="h-8 w-[124px] text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="editor">Can edit</SelectItem>
                                <SelectItem value="viewer">Can view</SelectItem>
                              </SelectContent>
                            </Select>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => void handleRemoveMember(m.userId)}
                              aria-label="Remove access"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {pendingAccessRequests.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs font-medium">Access requests</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Signed-in users who tried to open this document without access. Approve adds them with the
                    role they asked for.
                  </p>
                  <ul className="divide-y rounded-md border border-border/60">
                    {pendingAccessRequests.map((r) => {
                      const label = r.name || r.email || 'User';
                      const busy = resolvingAccessRequestId === r.id;
                      return (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-center gap-2 px-3 py-2.5 text-sm"
                        >
                          <Avatar className="h-8 w-8">
                            <AvatarImage src={r.avatarUrl || undefined} alt="" />
                            <AvatarFallback className="text-xs">
                              {label.charAt(0).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium">{label}</div>
                            {r.email ? (
                              <div className="truncate text-xs text-muted-foreground">{r.email}</div>
                            ) : null}
                            <div className="text-[11px] text-muted-foreground">
                              Wants {r.requestedRole === 'editor' ? 'edit' : 'view'} access
                            </div>
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-8 gap-1 px-2"
                              disabled={busy}
                              onClick={() => void handleResolveAccessRequest(r.id, 'approve')}
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1 px-2 text-muted-foreground"
                              disabled={busy}
                              onClick={() => void handleResolveAccessRequest(r.id, 'deny')}
                            >
                              <X className="h-3.5 w-3.5" />
                              Decline
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="link" className="mt-4 space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Link access</Label>
                <Select
                  value={linkMode}
                  onValueChange={(v) => setLinkMode(v === 'view' ? 'view' : 'edit')}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="edit">Anyone with the link can edit</SelectItem>
                    <SelectItem value="view">Anyone with the link can view</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Creating a link still requires a signed-in Clerk user to open the doc (same as today). The
                  link encodes view vs edit for people who aren’t yet on the member list.
                </p>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full gap-2"
                  disabled={generatingLink}
                  onClick={() => void handleGenerateLink()}
                >
                  {generatingLink ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Link2 className="h-4 w-4" />
                  )}
                  Create link & copy
                </Button>
                {generatedUrl ? (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">Last generated</Label>
                    <Input readOnly className="font-mono text-xs" value={generatedUrl} />
                  </div>
                ) : null}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import type { UserPresence, CursorPosition, User, ConnectionStatus } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import { getSocket } from '@/services/socket';
import type { Socket } from 'socket.io-client';
import * as Y from 'yjs';
import { Awareness } from 'y-protocols/awareness';
import * as awarenessProtocol from 'y-protocols/awareness';

interface UseCollaborationOptions {
  documentId: string;
  user: User | null;
  linkToken?: string | null; // Optional share link token for document access
}

export function useCollaboration({ documentId, user, linkToken }: UseCollaborationOptions) {
  const navigate = useNavigate();
  const { token, isAuthenticated, isLoaded } = useAuth();

  const [collaborators, setCollaborators] = useState<UserPresence[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastSynced, setLastSynced] = useState<Date>(new Date());
  const [activeUserIds, setActiveUserIds] = useState<string[]>([]);
  const activeUserIdsRef = useRef<string[]>([]); // Ref to track active users for awareness filtering

  // Refs for Yjs and Socket
  const ydocRef = useRef<Y.Doc | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const awarenessRef = useRef<Awareness | null>(null);
  const yTextRef = useRef<Y.Text | null>(null);
  const localAwarenessSetRef = useRef<boolean>(false);
  const awarenessUpdateHandlerRef = useRef<((changes: any, origin: any) => void) | null>(null);
  const awarenessRenderHandlerRef = useRef<(() => void) | null>(null); // Added for proper cleanup
  const yjsUpdateHandlerRef = useRef<((update: Uint8Array, origin: any) => void) | null>(null); // Store Yjs update handler for cleanup
  const autosaveTimerRef = useRef<number | null>(null);
  const uniqueUserIdRef = useRef<string>(user?.id || `user-${Date.now()}`);
  // Store stable handler references to prevent React StrictMode from removing listeners
  const handlersRef = useRef<{
    handleConnect: (() => void) | null;
    handleDocInit: ((init: any) => void) | null;
    handleAwarenessUpdate: ((data: any) => void) | null;
    handleAwarenessRequest: ((data: any) => void) | null;
    handleRemoteUpdate: ((data: any) => void) | null;
    handleUserJoined: ((data: any) => void) | null;
    handleUserLeft: ((data: any) => void) | null;
    handleActiveUsers: ((users: any[]) => void) | null;
    handleConnectError: ((err: any) => void) | null;
    handleDisconnect: ((reason: any) => void) | null;
    handleError: ((error: any) => void) | null;
  }>({
    handleConnect: null,
    handleDocInit: null,
    handleAwarenessUpdate: null,
    handleAwarenessRequest: null,
    handleRemoteUpdate: null,
    handleUserJoined: null,
    handleUserLeft: null,
    handleActiveUsers: null,
    handleConnectError: null,
    handleDisconnect: null,
    handleError: null,
  });
  const documentIdRef = useRef<string>(documentId);
  const tokenRef = useRef<string | null>(token);
  const isAuthenticatedRef = useRef<boolean>(isAuthenticated);
  const isLoadedRef = useRef<boolean>(isLoaded);
  const navigateRef = useRef(navigate);

  // Keep refs in sync
  useEffect(() => {
    documentIdRef.current = documentId;
  }, [documentId]);

  useEffect(() => {
    tokenRef.current = token;
    // Update socket auth if socket exists and token changed
    if (socketRef.current && token) {
      socketRef.current.auth = { token };
    }
  }, [token]);

  useEffect(() => {
    isAuthenticatedRef.current = isAuthenticated;
  }, [isAuthenticated]);

  useEffect(() => {
    isLoadedRef.current = isLoaded;
  }, [isLoaded]);

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Helper to convert various formats to Uint8Array
  const toUint8 = useCallback((val: any): Uint8Array => {
    if (!val) return new Uint8Array();
    if (val instanceof ArrayBuffer) return new Uint8Array(val);
    if (val instanceof Uint8Array) return val;
    if (val?.type === 'Buffer' && Array.isArray(val.data)) return new Uint8Array(val.data);
    return new Uint8Array(val);
  }, []);

  // Initialize Yjs document from server init data
  // Not using useCallback to avoid dependency issues - this is called from socket handlers
  const initYjsFromServer = (init: any) => {
    const currentDocId = documentIdRef.current;
    console.log('[useCollaboration] initYjsFromServer called', {
      initDocumentId: init?.documentId,
      currentDocId,
      hasSnapshot: !!init?.snapshot,
      updatesCount: init?.updates?.length || 0,
    });
    if (!init || init.documentId !== currentDocId) {
      console.warn('[useCollaboration] initYjsFromServer: documentId mismatch, ignoring');
      return;
    }

    // Cleanup existing doc if any (like old CodeEditor)
    if (ydocRef.current) {
      // Remove Yjs update handler before destroying
      if (yjsUpdateHandlerRef.current) {
        ydocRef.current.off('update', yjsUpdateHandlerRef.current);
        yjsUpdateHandlerRef.current = null;
      }
      ydocRef.current.destroy();
    }
    if (awarenessRef.current && awarenessUpdateHandlerRef.current) {
      awarenessRef.current.off('update', awarenessUpdateHandlerRef.current);
      awarenessUpdateHandlerRef.current = null;
    }
    if (awarenessRef.current && awarenessRenderHandlerRef.current) {
      awarenessRef.current.off('update', awarenessRenderHandlerRef.current);
      awarenessRenderHandlerRef.current = null;
    }

    // Create new Y.Doc
    const doc = new Y.Doc();
    ydocRef.current = doc;

    // CRITICAL: Attach update handler IMMEDIATELY after creating doc
    // This must happen before yText is exposed to MonacoEditor to ensure
    // the handler is always attached before any binding is created
    const yjsUpdateHandler = (update: Uint8Array, origin: any) => {
      console.log('[useCollaboration] yjsUpdateHandler called', {
        updateSize: update?.length || 0,
        origin: origin || 'undefined',
        originType: typeof origin,
        isRemote: origin === 'remote',
        socketConnected: socketRef.current?.connected,
      });

      // Filter out remote updates to prevent re-broadcasting
      // MonacoBinding uses 'monaco-binding' or undefined/null for local edits
      // Remote updates from server use 'remote'
      if (origin === 'remote') {
        console.log('[useCollaboration] yjsUpdateHandler: Skipping remote update');
        return;
      }

      // Log all non-remote origins to understand what MonacoBinding uses
      if (origin !== 'remote' && origin !== null && origin !== undefined) {
        console.log('[useCollaboration] yjsUpdateHandler: Local update with origin:', origin);
      }

      // Filter out empty updates (no-op changes)
      if (!update || update.length === 0) {
        console.log('[useCollaboration] yjsUpdateHandler: Skipping empty update');
        return;
      }

      // This is a LOCAL update from MonacoBinding - broadcast it immediately
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        console.warn('[useCollaboration] yjsUpdateHandler: Cannot broadcast - socket not available or not connected', {
          hasSocket: !!socket,
          connected: socket?.connected,
        });
        return;
      }

      // Emit update immediately without delays for smooth real-time sync
      const docId = documentIdRef.current;
      socket.emit('yjs-update', { documentId: docId, update });
      console.log('[useCollaboration] 📤 yjsUpdateHandler: Emitted yjs-update to server', {
        documentId: docId,
        updateSize: update.length,
        socketId: socket.id,
      });

      // Autosave UX: after 750ms idle, mark as "saved"
      if (autosaveTimerRef.current) window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = window.setTimeout(() => {
        setLastSynced(new Date());
      }, 750);
    };
    yjsUpdateHandlerRef.current = yjsUpdateHandler;
    doc.on('update', yjsUpdateHandler);

    // Verify handler is attached
    const listenerCount = (doc as any)._observers?.update?.length || 0;
    console.log('[useCollaboration] ✅ Yjs update handler attached IMMEDIATELY after doc creation', {
      listenerCount,
      docClientId: doc.clientID,
      hasSocket: !!socketRef.current,
      socketConnected: socketRef.current?.connected,
    });

    if (listenerCount === 0) {
      console.error('[useCollaboration] ⚠️ CRITICAL: Handler was not attached! Listener count is 0!');
    }

    // Apply snapshot FIRST (if it exists) - this is the initial state
    if (init.snapshot) {
      Y.applyUpdate(doc, toUint8(init.snapshot), 'remote');
    }

    // Then apply updates (replay tail updates after snapshot)
    if (init.updates && Array.isArray(init.updates)) {
      init.updates.forEach((update: any) => {
        // Handle both { seq, update } format and raw update
        const updateBytes = update.update || update;
        Y.applyUpdate(doc, toUint8(updateBytes), 'remote');
      });
    }

    // Get or create Y.Text for content
    // IMPORTANT: Handler is already attached above, so binding can safely be created now
    const yText = doc.getText('content');
    yTextRef.current = yText;

    // Create awareness
    const awareness = new Awareness(doc);
    awarenessRef.current = awareness;
    localAwarenessSetRef.current = false; // Reset for new awareness (like old CodeEditor)

    // Set local user state
    if (user && !localAwarenessSetRef.current) {
      awareness.setLocalStateField('user', {
        name: user.name || `User ${uniqueUserIdRef.current.slice(-4)}`,
        id: user.id,
        color: user.color,
      });
      localAwarenessSetRef.current = true;

      // Publish initial awareness
      if (socketRef.current && socketRef.current.connected) {
        const update = awarenessProtocol.encodeAwarenessUpdate(awareness, [awareness.clientID]);
        socketRef.current.emit('awareness-update', { documentId: documentIdRef.current, update });
        console.log('[useCollaboration] Emitted initial awareness update', {
          documentId: documentIdRef.current,
          clientID: awareness.clientID,
          updateSize: update.length,
        });
      } else {
        console.warn('[useCollaboration] Cannot emit initial awareness - socket not connected', {
          hasSocket: !!socketRef.current,
          connected: socketRef.current?.connected,
        });
      }
    }

    // Handle awareness updates (send to server)
    const awarenessUpdateHandler = (changes: any, origin: any) => {
      if (origin === 'remote') return;
      if (!socketRef.current) return;

      const changedClients = ([] as number[])
        .concat(changes.added || [])
        .concat(changes.updated || [])
        .concat(changes.removed || []);
      if (changedClients.length === 0) return;

      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, changedClients);
      socketRef.current.emit('awareness-update', { documentId: documentIdRef.current, update });
    };
    awarenessUpdateHandlerRef.current = awarenessUpdateHandler;
    awareness.on('update', awarenessUpdateHandler);

    // Handle awareness changes (update collaborators list)
    // Store handler in ref for proper cleanup (like old CodeEditor)
    // CRITICAL: Filter awareness states to only include active users and deduplicate by user ID
    // CRITICAL: Use awarenessRef.current instead of closure variable to ensure we always have the latest awareness instance
    const awarenessRenderHandler = () => {
      const currentAwareness = awarenessRef.current; // Always get latest awareness from ref
      if (!currentAwareness) {
        console.warn('[useCollaboration] awarenessRenderHandler: No awareness instance available');
        return;
      }

      const states = currentAwareness.getStates();
      const currentActiveUserIds = activeUserIdsRef.current; // Use ref to get latest value
      const collaboratorsMap = new Map<string, UserPresence>(); // Use Map to deduplicate by user ID

      console.log('[useCollaboration] awarenessRenderHandler: Processing awareness states', {
        totalStates: states.size,
        currentClientId: currentAwareness.clientID,
        activeUserIdsCount: currentActiveUserIds.length,
        activeUserIds: currentActiveUserIds,
      });

      states.forEach((state: any, clientId: number) => {
        if (clientId === currentAwareness.clientID) {
          console.log('[useCollaboration] awarenessRenderHandler: Skipping self', { clientId });
          return; // Skip self
        }

        console.log('[useCollaboration] awarenessRenderHandler: Processing state', {
          clientId,
          hasUser: !!state.user,
          hasCursor: !!state.cursor,
          userData: state.user,
        });

        if (!state.user) {
          console.log('[useCollaboration] awarenessRenderHandler: Skipping state without user data', { clientId });
          return; // Skip if no user data
        }

        const userId = state.user.id || `anon-${clientId}`;

        // CRITICAL: Filter by active users list ONLY if the list has been populated
        // If activeUserIds is empty (initial state), show all awareness states
        // Once active-users event is received, filter to only show active users
        // This prevents showing stale awareness states from disconnected users
        // NOTE: Backend now sends Clerk user IDs (not socket IDs) in active-users event
        if (currentActiveUserIds.length > 0) {
          // Active users list has been populated - filter by it
          if (!currentActiveUserIds.includes(userId)) {
            // User is not in active list - skip (they've disconnected)
            console.log('[useCollaboration] awarenessRenderHandler: Filtering out user not in active list', {
              userId,
              clientId,
              activeUserIds: currentActiveUserIds,
            });
            return;
          }
        }
        // If activeUserIds is empty, show all awareness states (initial state before active-users is received)

        // CRITICAL: Deduplicate by user ID - if same user appears multiple times (different client IDs),
        // keep the most recent one (or first one encountered)
        if (!collaboratorsMap.has(userId)) {
          const collaborator: UserPresence = {
            user: {
              id: userId,
              name: state.user.name || `User ${clientId}`,
              email: state.user.email || '',
              imageUrl: state.user.imageUrl || '',
              color: state.user.color || '#cccccc',
            },
            cursor: state.cursor || null,
            isActive: true,
            lastSeen: new Date(),
          };
          collaboratorsMap.set(userId, collaborator);
          console.log('[useCollaboration] awarenessRenderHandler: Added collaborator', {
            userId,
            name: collaborator.user.name,
            clientId,
          });
        } else {
          console.log('[useCollaboration] awarenessRenderHandler: Skipping duplicate user', { userId, clientId });
        }
      });

      // Convert Map to array - this ensures unique user IDs
      const collaboratorsArray = Array.from(collaboratorsMap.values());
      setCollaborators(collaboratorsArray);
      console.log('[useCollaboration] awarenessRenderHandler: ✅ Updated collaborators', {
        count: collaboratorsArray.length,
        userIds: collaboratorsArray.map(c => c.user.id),
        activeUserIdsCount: currentActiveUserIds.length,
        allStates: Array.from(states.keys()),
      });
    };
    awarenessRenderHandlerRef.current = awarenessRenderHandler;
    awareness.on('update', awarenessRenderHandler);

    // Note: yjsUpdateHandler was already attached above, immediately after creating the Y.Doc
    // This ensures it's always attached before yText is exposed to MonacoEditor

    setIsReady(true);
    setConnectionStatus('connected');
    setLastSynced(new Date());

    // Request active users list immediately after initialization
    // This ensures we get the list of active users to filter awareness states
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('get-active-users', documentIdRef.current);
      console.log('[useCollaboration] Requested active users list after initialization');
    }

    // Trigger initial awareness render to show any existing awareness states
    // This ensures users show up immediately, even before active-users is received
    // Use setTimeout to ensure awareness is fully initialized
    setTimeout(() => {
      if (awarenessRenderHandlerRef.current) {
        console.log('[useCollaboration] Triggering initial awareness render after initialization');
        awarenessRenderHandlerRef.current();
      } else {
        console.warn('[useCollaboration] awarenessRenderHandlerRef.current is null - cannot trigger initial render');
      }
    }, 100);

    // Also trigger after a longer delay to catch any awareness states that arrive later
    setTimeout(() => {
      if (awarenessRenderHandlerRef.current) {
        console.log('[useCollaboration] Triggering delayed awareness render to catch late-arriving states');
        awarenessRenderHandlerRef.current();
      }
    }, 1000);
  };

  // Update local cursor position
  const updateCursor = useCallback((position: CursorPosition['position'], selection?: CursorPosition['selection']) => {
    if (!awarenessRef.current) return;

    // Convert Monaco position to Yjs offset format
    // For now, we'll store the position directly in awareness
    awarenessRef.current.setLocalStateField('cursor', {
      position,
      selection,
    });

    // Trigger awareness update
    const update = awarenessProtocol.encodeAwarenessUpdate(awarenessRef.current, [
      awarenessRef.current.clientID,
    ]);
    socketRef.current?.emit('awareness-update', { documentId: documentIdRef.current, update });
  }, []);

  // Get Yjs text binding for Monaco
  const getTextBinding = useCallback(() => {
    return yTextRef.current;
  }, []);

  // Helper to validate UUID format (not memoized to avoid dependency issues)
  const isValidUUID = (str: string): boolean => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };

  // Socket connection and event handling
  // Only re-run when documentId changes or auth state transitions (null -> token or token -> null)
  useEffect(() => {
    const currentDocId = documentIdRef.current;
    const currentToken = tokenRef.current;
    const currentIsAuthenticated = isAuthenticatedRef.current;
    const currentIsLoaded = isLoadedRef.current;

    // Don't connect if documentId is missing or invalid
    if (!currentDocId || currentDocId === 'new' || currentDocId.trim() === '' || !isValidUUID(currentDocId)) {
      setConnectionStatus('disconnected');
      setIsReady(false);
      return;
    }

    // Wait for auth to load
    if (!currentIsLoaded) {
      setConnectionStatus('disconnected');
      setIsReady(false);
      return;
    }

    if (!currentIsAuthenticated) {
      navigateRef.current('/login');
      return;
    }

    if (!currentToken) {
      setConnectionStatus('disconnected');
      setIsReady(false);
      return;
    }

    // Get socket with auth token
    console.log('[useCollaboration] Getting socket', {
      documentId: currentDocId,
      hasToken: !!currentToken,
      tokenLength: currentToken?.length || 0,
    });
    const socket = getSocket(currentToken);
    socketRef.current = socket;
    console.log('[useCollaboration] Socket obtained', {
      socketId: socket.id,
      connected: socket.connected,
      documentId: currentDocId,
    });
    setConnectionStatus('reconnecting');

    const join = () => {
      const docId = documentIdRef.current;
      const listenerCount = socket.listeners('doc-init').length;
      console.log('[useCollaboration] Joining document', {
        documentId: docId,
        socketId: socket.id,
        socketConnected: socket.connected,
        docInitListenerCount: listenerCount,
      });

      if (listenerCount === 0) {
        console.error('[useCollaboration] CRITICAL: Attempting to join but doc-init listener is not registered!');
        // Re-register as emergency fallback
        socket.on('doc-init', handleDocInit);
      }

      setConnectionStatus('syncing');
      socket.emit('join-document', { documentId: docId, linkToken: linkToken || null });
      console.log('[useCollaboration] join-document emitted', { documentId: docId, hasLinkToken: !!linkToken });
      console.log('[useCollaboration] Waiting for doc-init...');
    };

    const handleConnect = () => {
      console.log('[useCollaboration] Socket connected event fired', {
        documentId: documentIdRef.current,
        socketId: socket.id,
      });
      join();
    };
    handlersRef.current.handleConnect = handleConnect;

    const handleConnectError = (err: any) => {
      setConnectionStatus('disconnected');
      console.error('Socket connection error:', err);
    };
    handlersRef.current.handleConnectError = handleConnectError;

    const handleDisconnect = (reason: any) => {
      setConnectionStatus('disconnected');
      console.warn('Socket disconnected:', reason);
    };
    handlersRef.current.handleDisconnect = handleDisconnect;

    const handleDocInit = (init: any) => {
      const docId = documentIdRef.current;
      console.log('[useCollaboration] ✅ Received doc-init event', {
        initDocumentId: init?.documentId,
        currentDocId: docId,
        hasSnapshot: !!init?.snapshot,
        updatesCount: init?.updates?.length || 0,
        socketId: socket.id,
        socketConnected: socket.connected,
      });
      if (!init || init.documentId !== docId) {
        console.warn('[useCollaboration] doc-init documentId mismatch, ignoring', {
          initDocumentId: init?.documentId,
          currentDocId: docId,
        });
        return;
      }
      console.log('[useCollaboration] Initializing Yjs from server data');
      try {
        initYjsFromServer(init);
      } catch (error) {
        console.error('[useCollaboration] Error in initYjsFromServer:', error);
        setConnectionStatus('disconnected');
      }
    };
    handlersRef.current.handleDocInit = handleDocInit;

    const handleAwarenessUpdate = (data: any) => {
      const docId = documentIdRef.current;
      if (!data || data.documentId !== docId) {
        console.log('[useCollaboration] handleAwarenessUpdate: Document ID mismatch or missing data', {
          dataDocumentId: data?.documentId,
          currentDocId: docId,
        });
        return;
      }
      if (!awarenessRef.current) {
        console.warn('[useCollaboration] handleAwarenessUpdate: No awareness instance available');
        return;
      }
      const updateBytes = toUint8(data.update);
      console.log('[useCollaboration] handleAwarenessUpdate: Applying remote awareness update', {
        documentId: docId,
        updateSize: updateBytes.length,
      });
      awarenessProtocol.applyAwarenessUpdate(awarenessRef.current, updateBytes, 'remote');
      // Awareness update will trigger the awareness 'update' event, which will call awarenessRenderHandler
      // No need to manually trigger here - the handler is already listening
      console.log('[useCollaboration] handleAwarenessUpdate: ✅ Applied awareness update - handler should fire');
    };
    handlersRef.current.handleAwarenessUpdate = handleAwarenessUpdate;

    const handleAwarenessRequest = (data: any) => {
      const docId = documentIdRef.current;
      if (!data || data.documentId !== docId) return;
      if (!awarenessRef.current) return;
      const update = awarenessProtocol.encodeAwarenessUpdate(awarenessRef.current, [
        awarenessRef.current.clientID,
      ]);
      socket.emit('awareness-update', { documentId: docId, update });
    };
    handlersRef.current.handleAwarenessRequest = handleAwarenessRequest;

    const handleRemoteUpdate = (data: any) => {
      const docId = documentIdRef.current;
      if (!data || data.documentId !== docId) return;
      if (!ydocRef.current) return;

      console.log('[useCollaboration] 📥 Received remote yjs-update', {
        documentId: docId,
        updateSize: data.update?.length || 0,
      });

      // Apply remote update to Y.Doc
      // This will automatically trigger MonacoBinding to update Monaco editor
      Y.applyUpdate(ydocRef.current, toUint8(data.update), 'remote');
      setLastSynced(new Date());

      console.log('[useCollaboration] ✅ Applied remote update - Monaco should update via binding');
    };
    handlersRef.current.handleRemoteUpdate = handleRemoteUpdate;

    const handleUserJoined = (data: any) => {
      if (data?.userId) {
        setActiveUserIds((prev) => {
          const updated = prev.includes(data.userId) ? prev : [...prev, data.userId];
          activeUserIdsRef.current = updated; // Keep ref in sync
          return updated;
        });
        // Trigger awareness render to update collaborators list
        if (awarenessRef.current && awarenessRenderHandlerRef.current) {
          awarenessRenderHandlerRef.current();
        }
      }
    };
    handlersRef.current.handleUserJoined = handleUserJoined;

    const handleUserLeft = (data: any) => {
      if (data?.userId) {
        setActiveUserIds((prev) => {
          const updated = prev.filter((id) => id !== data.userId);
          activeUserIdsRef.current = updated; // Keep ref in sync
          return updated;
        });
        // Trigger awareness render to remove disconnected user from collaborators
        if (awarenessRef.current && awarenessRenderHandlerRef.current) {
          awarenessRenderHandlerRef.current();
        }
      }
    };
    handlersRef.current.handleUserLeft = handleUserLeft;

    const handleActiveUsers = (users: any[]) => {
      console.log('[useCollaboration] handleActiveUsers: Received active users list', {
        usersCount: users?.length || 0,
        users: users || [],
      });
      const userIds = (users || []).map((u) => u.userId || u.id || u);
      setActiveUserIds(userIds);
      activeUserIdsRef.current = userIds; // Keep ref in sync
      console.log('[useCollaboration] handleActiveUsers: Updated activeUserIds', {
        userIds,
        count: userIds.length,
      });
      // Trigger awareness render to sync collaborators with active users
      if (awarenessRef.current && awarenessRenderHandlerRef.current) {
        console.log('[useCollaboration] handleActiveUsers: Triggering awareness render');
        awarenessRenderHandlerRef.current();
      } else {
        console.warn('[useCollaboration] handleActiveUsers: Cannot trigger awareness render', {
          hasAwareness: !!awarenessRef.current,
          hasHandler: !!awarenessRenderHandlerRef.current,
        });
      }
    };
    handlersRef.current.handleActiveUsers = handleActiveUsers;

    // CRITICAL: Only remove listeners if documentId changed (not on every render)
    // Removing listeners on every render can cause doc-init to be missed if it arrives
    // between listener removal and re-registration (especially in React StrictMode)
    // Socket.IO handles duplicate listeners gracefully, so registering multiple times is safe
    // We'll rely on the cleanup function to remove listeners when documentId actually changes

    // Register ALL listeners FIRST before any operations
    // CRITICAL: doc-init must be registered BEFORE join() is called
    // Some browsers/backends may send doc-init synchronously immediately after join-document
    socket.on('connect', handleConnect);
    socket.on('connect_error', handleConnectError);
    socket.on('disconnect', handleDisconnect);
    socket.on('doc-init', handleDocInit);
    socket.on('yjs-update', handleRemoteUpdate);
    socket.on('awareness-update', handleAwarenessUpdate);
    socket.on('awareness-request', handleAwarenessRequest);
    socket.on('user-joined', handleUserJoined);
    socket.on('user-left', handleUserLeft);
    socket.on('active-users', handleActiveUsers);

    // Add error handler to catch any socket errors from backend
    const handleError = (error: any) => {
      console.error('[useCollaboration] ❌ Backend error event:', error);
      if (error?.message === 'forbidden' || error?.message === 'join_failed') {
        console.error('[useCollaboration] Backend rejected join-document request');
        setConnectionStatus('disconnected');
        navigateRef.current('/dashboard');
      } else {
        setConnectionStatus('disconnected');
      }
    };
    socket.on('error', handleError);
    handlersRef.current.handleError = handleError;

    // Log listener registration status
    const docInitListenerCount = socket.listeners('doc-init').length;
    console.log('[useCollaboration] All listeners registered', {
      docInitListeners: docInitListenerCount,
      connectListeners: socket.listeners('connect').length,
      connected: socket.connected,
      socketId: socket.id,
    });

    // Connect if not already connected, otherwise join after ensuring listeners are registered
    // CRITICAL: Ensure doc-init listener is registered BEFORE calling join()
    // The backend may send doc-init synchronously or very quickly after join-document
    if (!socket.connected) {
      console.log('[useCollaboration] Socket not connected, connecting...');
      socket.connect();
      // join() will be called in handleConnect after socket connects
    } else {
      console.log('[useCollaboration] Socket already connected, joining after ensuring listeners are ready...', {
        socketId: socket.id,
        docInitListeners: docInitListenerCount,
      });

      // CRITICAL: Use setTimeout to ensure listener registration has fully propagated
      // This is especially important for Safari and React StrictMode where timing can be tight
      setTimeout(() => {
        const finalDocInitCount = socket.listeners('doc-init').length;
        console.log('[useCollaboration] About to join, final doc-init listener count:', finalDocInitCount);

        // Defensive: re-register if somehow missing (shouldn't happen, but safety check)
        if (finalDocInitCount === 0) {
          console.error('[useCollaboration] CRITICAL: doc-init listener missing! Re-registering...');
          socket.on('doc-init', handleDocInit);
        }

        join();
      }, 50); // Small delay to ensure listener registration has propagated (increased from 0 to 50ms for Safari)
    }

    // Health check interval
    const healthCheckInterval = setInterval(() => {
      const docId = documentIdRef.current;
      if (socket.connected && docId) {
        socket.emit('get-active-users', docId);
        socket.emit('ping');
        setLastSynced(new Date());
      }
    }, 30000);

    // Cleanup
    return () => {
      console.log('[useCollaboration] Cleanup: removing listeners and leaving document');
      clearInterval(healthCheckInterval);

      // Use handlersRef to ensure we remove the correct listeners (critical for StrictMode)
      const currentHandlers = handlersRef.current;
      if (currentHandlers.handleConnect) socket.off('connect', currentHandlers.handleConnect);
      if (currentHandlers.handleConnectError) socket.off('connect_error', currentHandlers.handleConnectError);
      if (currentHandlers.handleDisconnect) socket.off('disconnect', currentHandlers.handleDisconnect);
      if (currentHandlers.handleDocInit) socket.off('doc-init', currentHandlers.handleDocInit);
      if (currentHandlers.handleRemoteUpdate) socket.off('yjs-update', currentHandlers.handleRemoteUpdate);
      if (currentHandlers.handleAwarenessUpdate) socket.off('awareness-update', currentHandlers.handleAwarenessUpdate);
      if (currentHandlers.handleAwarenessRequest) socket.off('awareness-request', currentHandlers.handleAwarenessRequest);
      if (currentHandlers.handleUserJoined) socket.off('user-joined', currentHandlers.handleUserJoined);
      if (currentHandlers.handleUserLeft) socket.off('user-left', currentHandlers.handleUserLeft);
      if (currentHandlers.handleActiveUsers) socket.off('active-users', currentHandlers.handleActiveUsers);
      if (currentHandlers.handleError) socket.off('error', currentHandlers.handleError);

      const docId = documentIdRef.current;
      if (docId && socket.connected) {
        socket.emit('leave-document', docId);
      }

      // Cleanup awareness handlers (like old CodeEditor - must detach before nulling refs)
      if (awarenessRef.current && awarenessUpdateHandlerRef.current) {
        awarenessRef.current.off('update', awarenessUpdateHandlerRef.current);
        awarenessUpdateHandlerRef.current = null;
      }
      if (awarenessRef.current && awarenessRenderHandlerRef.current) {
        awarenessRef.current.off('update', awarenessRenderHandlerRef.current);
        awarenessRenderHandlerRef.current = null;
      }
      awarenessRef.current = null;

      // Cleanup Yjs doc and its update handler (like old CodeEditor)
      if (ydocRef.current) {
        if (yjsUpdateHandlerRef.current) {
          ydocRef.current.off('update', yjsUpdateHandlerRef.current);
          yjsUpdateHandlerRef.current = null;
        }
        ydocRef.current.destroy();
        ydocRef.current = null;
      }

      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
        autosaveTimerRef.current = null;
      }

      yTextRef.current = null;
      socketRef.current = null;
      localAwarenessSetRef.current = false;
      setIsReady(false);
      setConnectionStatus('disconnected');
    };
    // Only depend on documentId - token/auth changes are handled via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentId]);

  return {
    collaborators,
    isReady,
    connectionStatus,
    lastSynced,
    activeUserIds,
    updateCursor,
    getTextBinding,
    // Expose refs for advanced usage
    ydoc: ydocRef.current,
    awareness: awarenessRef.current,
    yText: yTextRef.current,
  };
}

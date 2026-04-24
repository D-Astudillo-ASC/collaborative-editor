import { useState, useEffect, useCallback } from 'react';
import type { UserPresence, User } from '@/types';

// Placeholder hook for user presence tracking
// This works alongside useCollaboration for cursor visibility

interface UsePresenceOptions {
  user: User | null;
  collaborators: UserPresence[];
}

// Cursor colors palette (8 accessible colors)
const CURSOR_COLORS = [
  '#6366f1', // Indigo (primary)
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#84cc16', // Lime
];

export function usePresence({ user, collaborators }: UsePresenceOptions) {
  const [visibleCursors, setVisibleCursors] = useState<Map<string, boolean>>(new Map());
  const [cursorLabelsVisible, setCursorLabelsVisible] = useState<Map<string, boolean>>(new Map());

  // Get color for a user (deterministic based on ID)
  const getUserColor = useCallback((userId: string): string => {
    const hash = userId.split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
  }, []);

  // Show cursor label temporarily
  const showCursorLabel = useCallback((userId: string, duration = 2000) => {
    setCursorLabelsVisible(prev => new Map(prev).set(userId, true));
    
    setTimeout(() => {
      setCursorLabelsVisible(prev => new Map(prev).set(userId, false));
    }, duration);
  }, []);

  // Toggle cursor visibility
  const toggleCursorVisibility = useCallback((userId: string) => {
    setVisibleCursors(prev => {
      const next = new Map(prev);
      next.set(userId, !prev.get(userId));
      return next;
    });
  }, []);

  // Get active collaborators (excluding self)
  const activeCollaborators = collaborators.filter(
    c => c.isActive && c.user.id !== user?.id
  );

  // Get collaborators with cursors
  const collaboratorsWithCursors = activeCollaborators.filter(c => c.cursor !== null);

  // Show labels for all cursors when they move
  useEffect(() => {
    collaboratorsWithCursors.forEach(c => {
      showCursorLabel(c.user.id);
    });
  }, [collaboratorsWithCursors.map(c => JSON.stringify(c.cursor)).join(',')]);

  return {
    activeCollaborators,
    collaboratorsWithCursors,
    visibleCursors,
    cursorLabelsVisible,
    getUserColor,
    showCursorLabel,
    toggleCursorVisibility,
  };
}

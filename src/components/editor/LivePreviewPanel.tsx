import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Eye,
  RefreshCw,
  Maximize2,
  Minimize2,
  Smartphone,
  Tablet,
  Monitor,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { PreviewState } from '@/types/execution';

interface LivePreviewPanelProps {
  preview: PreviewState;
  onRefresh: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

type ViewportSize = 'mobile' | 'tablet' | 'desktop' | 'full';

const viewportSizes: Record<ViewportSize, { width: string; label: string; icon: React.ElementType }> = {
  mobile: { width: '375px', label: 'Mobile', icon: Smartphone },
  tablet: { width: '768px', label: 'Tablet', icon: Tablet },
  desktop: { width: '1024px', label: 'Desktop', icon: Monitor },
  full: { width: '100%', label: 'Full Width', icon: Maximize2 },
};

export function LivePreviewPanel({
  preview,
  onRefresh,
  isCollapsed = false,
  onToggleCollapse,
}: LivePreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [viewport, setViewport] = useState<ViewportSize>('full');

  const getStatusDisplay = () => {
    if (preview.isLoading) {
      return (
        <div className="flex items-center gap-1.5 text-yellow-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span className="text-xs">Updating...</span>
        </div>
      );
    }

    if (preview.error) {
      return (
        <div className="flex items-center gap-1.5 text-red-500">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs">Error</span>
        </div>
      );
    }

    if (preview.html) {
      return (
        <div className="flex items-center gap-1.5 text-green-500">
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span className="text-xs">Live</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Eye className="h-3.5 w-3.5" />
        <span className="text-xs">Ready</span>
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col border-t border-border bg-card/50">
      {/* Header */}
      <div className="flex h-9 items-center justify-between border-b border-border bg-muted/30 px-3">
        <div className="flex items-center gap-2">
          {/* Collapse Toggle */}
          {onToggleCollapse && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={onToggleCollapse}
            >
              {isCollapsed ? (
                <Maximize2 className="h-3.5 w-3.5" />
              ) : (
                <Minimize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}

          {/* Status */}
          {getStatusDisplay()}

          {/* Last Update */}
          {preview.lastUpdate && (
            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
              Updated {formatTimeAgo(preview.lastUpdate)}
            </Badge>
          )}
        </div>

        {/* Viewport & Actions */}
        <div className="flex items-center gap-1">
          {/* Viewport Toggles */}
          {Object.entries(viewportSizes).map(([key, { label, icon: Icon }]) => (
            <Tooltip key={key}>
              <TooltipTrigger asChild>
                <Button
                  variant={viewport === key ? 'secondary' : 'ghost'}
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setViewport(key as ViewportSize)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{label}</TooltipContent>
            </Tooltip>
          ))}

          {/* Separator */}
          <div className="mx-1 h-4 w-px bg-border" />

          {/* Refresh Button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onRefresh}
                disabled={preview.isLoading}
              >
                <RefreshCw className={cn(
                  "h-3.5 w-3.5",
                  preview.isLoading && "animate-spin"
                )} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh Preview</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Preview Area */}
      <AnimatePresence>
        {!isCollapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="flex-1 overflow-hidden bg-background"
          >
            <div className="flex h-full items-center justify-center p-4">
              {preview.error ? (
                <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-4">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
                    <div>
                      <h4 className="font-medium text-destructive">Preview Error</h4>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {preview.error}
                      </p>
                    </div>
                  </div>
                </div>
              ) : preview.html ? (
                <div
                  className={cn(
                    "h-full rounded-lg border border-border bg-white shadow-sm transition-all duration-300",
                    viewport === 'full' && "w-full"
                  )}
                  style={{
                    width: viewport !== 'full' ? viewportSizes[viewport].width : undefined,
                    maxWidth: '100%',
                  }}
                >
                  <iframe
                    ref={iframeRef}
                    className="h-full w-full rounded-lg"
                    sandbox="allow-scripts allow-same-origin"
                    title="Live Preview"
                    srcDoc={preview.html || undefined}
                    key={preview.lastUpdate?.getTime() || 0}
                  />
                </div>
              ) : (
                <div className="text-center text-muted-foreground">
                  <Eye className="mx-auto h-12 w-12 opacity-30" />
                  <p className="mt-4 text-sm">
                    Start typing to see a live preview of your component
                  </p>
                  <p className="mt-1 text-xs opacity-70">
                    Supports React, React TSX, and HTML
                  </p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

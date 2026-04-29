import * as React from "react";
import { GripVertical } from "lucide-react";
import { Group, Panel, Separator } from "react-resizable-panels";

import { cn } from "@/lib/utils";

const ResizablePanelGroup = ({
  className,
  direction = "horizontal",
  ...props
}: Omit<React.ComponentProps<typeof Group>, "orientation"> & { direction?: "horizontal" | "vertical" }) => (
  <Group
    className={cn(
      "flex h-full w-full data-[orientation=vertical]:flex-col data-[panel-group-direction=vertical]:flex-col",
      className,
    )}
    orientation={direction}
    {...props}
  />
);

const ResizablePanel = Panel;

const ResizableHandle = ({
  withHandle,
  className,
  ...props
}: React.ComponentProps<typeof Separator> & {
  withHandle?: boolean;
}) => (
  <Separator
    className={cn(
      // Base: always sits above panel content (including Monaco scrollbars, z-index ~3)
      "group relative z-[50] flex shrink-0 touch-none select-none items-center justify-center bg-transparent",
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
      // Horizontal handle: 8px wide hit area, col-resize cursor
      "data-[orientation=horizontal]:w-2 data-[orientation=horizontal]:cursor-col-resize",
      "data-[panel-group-direction=horizontal]:w-2 data-[panel-group-direction=horizontal]:cursor-col-resize",
      // Vertical handle: 8px tall hit area, row-resize cursor
      "data-[orientation=vertical]:h-2 data-[orientation=vertical]:cursor-row-resize",
      "data-[panel-group-direction=vertical]:h-2 data-[panel-group-direction=vertical]:cursor-row-resize",
      // Thin visible rule via ::after — only the visual line, not the hit area
      "after:pointer-events-none after:absolute",
      // Horizontal visual rule: 1px wide, full height — always visible
      "data-[orientation=horizontal]:after:inset-y-0 data-[orientation=horizontal]:after:left-1/2 data-[orientation=horizontal]:after:w-px data-[orientation=horizontal]:after:-translate-x-1/2 data-[orientation=horizontal]:after:bg-border",
      "data-[panel-group-direction=horizontal]:after:inset-y-0 data-[panel-group-direction=horizontal]:after:left-1/2 data-[panel-group-direction=horizontal]:after:w-px data-[panel-group-direction=horizontal]:after:-translate-x-1/2 data-[panel-group-direction=horizontal]:after:bg-border",
      // Vertical visual rule: 1px tall, full width — always visible
      "data-[orientation=vertical]:after:inset-x-0 data-[orientation=vertical]:after:top-1/2 data-[orientation=vertical]:after:h-px data-[orientation=vertical]:after:-translate-y-1/2 data-[orientation=vertical]:after:bg-border",
      "data-[panel-group-direction=vertical]:after:inset-x-0 data-[panel-group-direction=vertical]:after:top-1/2 data-[panel-group-direction=vertical]:after:h-px data-[panel-group-direction=vertical]:after:-translate-y-1/2 data-[panel-group-direction=vertical]:after:bg-border",
      className,
    )}
    {...props}
  >
    {withHandle && (
      <div className="pointer-events-none absolute left-1/2 top-1/2 z-30 flex h-5 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-sm border border-border/80 bg-background/90 shadow-md backdrop-blur-sm transition-colors duration-150 group-hover:border-primary/50 group-hover:bg-accent group-data-[resize-handle-state=drag]:border-primary group-data-[resize-handle-state=drag]:bg-accent">
        <GripVertical className="h-3 w-2.5 text-muted-foreground transition-colors group-hover:text-foreground group-data-[resize-handle-state=drag]:text-primary" />
      </div>
    )}
  </Separator>
);

export { ResizablePanelGroup, ResizablePanel, ResizableHandle };

/**
 * emcn Tooltip stub — exposes a Radix-style Root/Trigger/Content namespace
 * backed by @radix-ui/react-tooltip. Matches the minimal usage in
 * `verified-badge.tsx` (Tooltip.Root / Tooltip.Trigger / Tooltip.Content).
 */

'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { cn } from '@/lib/core/utils/cn'

const TooltipProvider = TooltipPrimitive.Provider

const TooltipRoot: React.FC<React.ComponentProps<typeof TooltipPrimitive.Root>> = ({
  children,
  ...props
}) => (
  <TooltipPrimitive.Provider>
    <TooltipPrimitive.Root {...props}>{children}</TooltipPrimitive.Root>
  </TooltipPrimitive.Provider>
)

const TooltipTrigger = TooltipPrimitive.Trigger

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 overflow-hidden rounded-md border bg-popover px-3 py-1.5 text-popover-foreground text-xs shadow-md',
        className
      )}
      {...props}
    />
  </TooltipPrimitive.Portal>
))
TooltipContent.displayName = TooltipPrimitive.Content.displayName

export const Tooltip = {
  Provider: TooltipProvider,
  Root: TooltipRoot,
  Trigger: TooltipTrigger,
  Content: TooltipContent,
}

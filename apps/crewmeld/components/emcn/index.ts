/**
 * emcn stub for P0 — the upstream engine build ships a proprietary "emcn"
 * component library. For P0 we only need Button, Badge, and a Tooltip namespace
 * so a handful of consumers keep compiling. Implementation delegates to the
 * already-ported shadcn/ui primitives and Radix Tooltip.
 *
 * TODO: P1 port the full emcn component catalog from upstream engine.
 */

export { Badge } from './badge'
export type { ButtonProps } from './button'
export { Button } from './button'
export { Tooltip } from './tooltip'

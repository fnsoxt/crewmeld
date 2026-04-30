'use client'

import React from 'react'
import { AlertTriangle, X } from 'lucide-react'
import { BaseEdge, EdgeLabelRenderer, type EdgeProps, getSmoothStepPath, useNodes } from 'reactflow'
import { useTranslation } from '@/hooks/use-translation'
import type { SopEdgeData, SopNodeData } from '@/stores/sop/editor-store'

/** Normalize exit label to canonical key (handles old Chinese labels) */
const LABEL_KEY_MAP: Record<string, string> = {
  approved: 'approved',
  rejected: 'rejected',
  timeout: 'timeout',
}

/** i18n key for exit display label */
const EXIT_I18N_KEY: Record<string, string> = {
  approved: 'sops.edgeApproved',
  rejected: 'sops.edgeRejected',
  timeout: 'sops.edgeTimeout',
}

/** Exit label -> color */
const EXIT_LABEL_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  approved: { bg: '#f0fdf4', text: '#16a34a', border: '#bbf7d0' },
  rejected: { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' },
  timeout: { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' },
}

const DEFAULT_CASE_COLOR = { bg: '#f9fafb', text: '#6b7280', border: '#e5e7eb' }
const SWITCH_CASE_COLOR = { bg: '#fff7ed', text: '#ea580c', border: '#fed7aa' }
const ERROR_COLOR = { bg: '#fef2f2', text: '#dc2626', border: '#fecaca' }

export const SopEdge = React.memo(function SopEdge(props: EdgeProps<SopEdgeData>) {
  const { t } = useTranslation()
  const {
    id,
    source,
    sourceHandleId,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    selected,
  } = props

  // Find exit info from the source node in the node list
  const nodes = useNodes<SopNodeData>()
  const exitInfo = React.useMemo(() => {
    const sourceNode = nodes.find((n) => n.id === source)
    if (!sourceNode) return null
    const exits = sourceNode.data.sopNode?.exits ?? []
    return exits.find((e) => e.id === sourceHandleId) ?? null
  }, [nodes, source, sourceHandleId])

  const isError = exitInfo?.type === 'error'
  const exitLabel = exitInfo?.label
  const normalizedKey = exitLabel ? LABEL_KEY_MAP[exitLabel] : null
  const i18nKey = normalizedKey ? EXIT_I18N_KEY[normalizedKey] : null
  const displayLabel = isError
    ? null
    : exitLabel
      ? i18nKey
        ? t(i18nKey as Parameters<typeof t>[0])
        : exitLabel
      : null
  const isDefault = exitInfo?.condition?.type === 'always'

  // Determine label color
  let labelStyle = normalizedKey
    ? EXIT_LABEL_COLOR[normalizedKey]
    : exitLabel
      ? EXIT_LABEL_COLOR[exitLabel]
      : null
  if (!labelStyle && !isError) {
    // Switch case or unknown exit
    labelStyle = isDefault ? DEFAULT_CASE_COLOR : SWITCH_CASE_COLOR
  }

  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX: sourceX + 1,
    sourceY,
    targetX: targetX - 1,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 8,
    offset: 20,
  })

  // Label position: near source node (30% from source)
  const tagX = sourceX + (labelX - sourceX) * 0.35
  const tagY = sourceY + (labelY - sourceY) * 0.35

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        data-testid={`canvas:edge:${id}`}
        style={{
          stroke: isError ? '#ef4444' : selected ? '#3b82f6' : '#d1d5db',
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: isError ? '6 3' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        <div
          className='nodrag nopan pointer-events-auto absolute'
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          }}
        >
          {selected && (
            <button
              className='flex h-5 w-5 items-center justify-center rounded-full border border-red-200 bg-white text-red-400 shadow-sm hover:bg-red-50 hover:text-red-600'
              onClick={(e) => {
                e.stopPropagation()
                window.dispatchEvent(new CustomEvent('sop-edge-delete', { detail: { edgeId: id } }))
              }}
            >
              <X className='h-3 w-3' />
            </button>
          )}
        </div>

        {/* Branch label */}
        {(displayLabel || isError) && (
          <div
            className='nodrag nopan pointer-events-none absolute'
            style={{
              transform: `translate(-50%, -50%) translate(${tagX}px,${tagY}px)`,
            }}
          >
            {isError ? (
              <span
                className='inline-flex items-center gap-0.5 rounded border px-1 py-0.5 font-medium text-[10px] leading-none'
                style={{
                  background: ERROR_COLOR.bg,
                  color: ERROR_COLOR.text,
                  borderColor: ERROR_COLOR.border,
                }}
              >
                <AlertTriangle className='h-2.5 w-2.5' />
                {t('sops.edgeError')}
              </span>
            ) : displayLabel && labelStyle ? (
              <span
                className='inline-block rounded border px-1.5 py-0.5 font-medium text-[10px] leading-none'
                style={{
                  background: labelStyle.bg,
                  color: labelStyle.text,
                  borderColor: labelStyle.border,
                }}
              >
                {isDefault ? t('sops.edgeDefault') : displayLabel}
              </span>
            ) : null}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  )
})

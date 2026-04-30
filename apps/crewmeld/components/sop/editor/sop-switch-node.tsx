'use client'

import React from 'react'
import { AlertTriangle, Route, X } from 'lucide-react'
import { Handle, type NodeProps, Position } from 'reactflow'
import { useTranslation } from '@/hooks/use-translation'
import type { SopNodeData } from '@/stores/sop/editor-store'

const HANDLE_STYLE: React.CSSProperties = {
  width: 8,
  height: 16,
  border: 'none',
  borderRadius: 2,
  background: '#d1d5db',
}

const ERROR_HANDLE: React.CSSProperties = {
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: '#ef4444',
  border: '2px solid #fca5a5',
}

/**
 * Multi-branch switch node — rounded rectangle with multiple right-side exits
 *
 * Handle layout:
 *   Left   -> input
 *   Right  -> case exits (vertically aligned)
 *   Bottom -> error exit
 */
export const SopSwitchNode = React.memo(function SopSwitchNode({
  data,
  id,
  selected,
}: NodeProps<SopNodeData>) {
  const { t } = useTranslation()
  const { sopNode, onDelete } = data
  const exits = sopNode.exits ?? []
  const normalExits = exits.filter((e) => e.type !== 'error')
  const errorExit = exits.find((e) => e.type === 'error')

  // Calculate node height: one row per case
  const caseRowHeight = 26
  const headerHeight = 44
  const footerHeight = 12
  const nodeHeight = Math.max(80, headerHeight + normalExits.length * caseRowHeight + footerHeight)

  return (
    <div
      data-testid={`canvas:node:${id}`}
      className={`group relative w-[220px] rounded-lg border bg-white shadow-sm transition-shadow ${
        selected
          ? 'border-orange-500 shadow-md ring-1 ring-orange-200'
          : 'border-gray-200 hover:shadow-md'
      }`}
      style={{ minHeight: nodeHeight }}
    >
      {/* Top-left type badge */}
      <div className='-left-1 -top-1 absolute rounded-tl-md rounded-br-md bg-orange-500 p-0.5'>
        <Route className='h-3 w-3 text-white' />
      </div>

      {/* Input Handle — left side */}
      <Handle
        type='target'
        position={Position.Left}
        data-testid={`canvas:handle:${id}:target`}
        style={{
          ...HANDLE_STYLE,
          left: -8,
          top: '50%',
          transform: 'translateY(-50%)',
          background: '#f97316',
        }}
      />

      {/* Content area */}
      <div className='px-3 py-2.5'>
        {/* Title row */}
        <div className='mb-2 flex items-center justify-between'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <Route className='h-4 w-4 shrink-0 text-orange-500' />
            <span className='truncate font-medium text-gray-900 text-sm'>
              {sopNode.name || t('sops.nodeSwitch')}
            </span>
          </div>
          {onDelete && (
            <button
              className='nodrag shrink-0 rounded p-0.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-500 group-hover:opacity-100'
              onClick={(e) => {
                e.stopPropagation()
                onDelete(id)
              }}
            >
              <X className='h-3.5 w-3.5' />
            </button>
          )}
        </div>

        {/* Case list */}
        {normalExits.length > 0 ? (
          <div className='space-y-0.5'>
            {normalExits.map((exit) => {
              const isDefault = exit.condition?.type === 'always'
              return (
                <div
                  key={exit.id}
                  className='flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px]'
                  style={{ background: isDefault ? '#f9fafb' : '#fff7ed' }}
                >
                  <span
                    className='h-1.5 w-1.5 shrink-0 rounded-full'
                    style={{ background: isDefault ? '#9ca3af' : '#f97316' }}
                  />
                  <span className='truncate' style={{ color: isDefault ? '#6b7280' : '#ea580c' }}>
                    {isDefault ? t('sops.edgeDefault') : exit.label || t('sops.nodeUnnamed')}
                  </span>
                </div>
              )
            })}
          </div>
        ) : (
          <p className='text-gray-400 text-xs'>{t('sops.nodeNoBranches')}</p>
        )}

        {/* Bottom label */}
        <div className='mt-2 flex items-center justify-between text-[11px]'>
          <span className='rounded bg-orange-50 px-1.5 py-0.5 font-medium text-orange-700'>
            {t('sops.nodeSwitch')}
          </span>
          <span className='text-gray-400'>
            {t('sops.nodeRouteCount', { count: normalExits.length })}
          </span>
        </div>
      </div>

      {/* Case exit Handles — right side, aligned with case rows */}
      {normalExits.map((exit, i) => {
        const isDefault = exit.condition?.type === 'always'
        // Calculate handle vertical position, aligned with case row
        const yOffset = headerHeight + i * caseRowHeight + caseRowHeight / 2
        return (
          <Handle
            key={exit.id}
            type='source'
            id={exit.id}
            position={Position.Right}
            data-testid={`canvas:handle:${id}:source:${exit.id}`}
            style={{
              ...HANDLE_STYLE,
              right: -8,
              top: yOffset,
              transform: 'translateY(-50%)',
              background: isDefault ? '#9ca3af' : '#f97316',
            }}
          />
        )
      })}

      {/* Error exit — bottom, shown on hover */}
      {errorExit && (
        <>
          <Handle
            type='source'
            id={errorExit.id}
            position={Position.Bottom}
            data-testid={`canvas:handle:${id}:source:error`}
            style={{
              ...ERROR_HANDLE,
              bottom: -6,
              left: '50%',
              transform: 'translateX(-50%)',
            }}
            className='!opacity-0 group-hover:!opacity-100 transition-opacity'
          />
          <span
            className='absolute flex items-center text-[9px] text-red-400 opacity-0 transition-opacity group-hover:opacity-100'
            style={{ bottom: -18, left: '50%', transform: 'translateX(-50%)' }}
          >
            <AlertTriangle className='h-2.5 w-2.5' />
          </span>
        </>
      )}
    </div>
  )
})

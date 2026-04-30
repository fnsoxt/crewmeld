'use client'

import React from 'react'
import { AlertTriangle, Bot, Settings, X } from 'lucide-react'
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

export const SopDigitalEmployeeNode = React.memo(function SopDigitalEmployeeNode({
  data,
  id,
  selected,
}: NodeProps<SopNodeData>) {
  const { t } = useTranslation()
  const { sopNode, onDelete } = data
  const exits = sopNode.exits ?? []
  const normalExits = exits.filter((e) => e.type !== 'error')
  const errorExit = exits.find((e) => e.type === 'error')

  return (
    <div
      data-testid={`canvas:node:${id}`}
      className={`group relative w-[220px] rounded-lg border bg-white shadow-sm transition-shadow ${
        selected
          ? 'border-blue-500 shadow-md ring-1 ring-blue-200'
          : 'border-gray-200 hover:shadow-md'
      }`}
    >
      {/* BPMN style: top-left task type icon */}
      <div className='-left-1 -top-1 absolute rounded-tl-md rounded-br-md bg-blue-500 p-0.5'>
        <Settings className='h-3 w-3 text-white' />
      </div>

      <Handle
        type='target'
        position={Position.Left}
        data-testid={`canvas:handle:${id}:target`}
        style={{ ...HANDLE_STYLE, left: -8, top: '50%', transform: 'translateY(-50%)' }}
      />

      <div className='px-3 py-2.5'>
        <div className='mb-1.5 flex items-center justify-between'>
          <div className='flex min-w-0 items-center gap-1.5'>
            <Bot className='h-4 w-4 shrink-0 text-blue-500' />
            <span className='truncate font-medium text-gray-900 text-sm'>
              {sopNode.name || t('sops.nodeUnnamedDigitalEmployee')}
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

        <p className='mb-2 line-clamp-2 text-gray-400 text-xs leading-relaxed'>
          {sopNode.description || t('sops.nodeNoDescription')}
        </p>

        <div className='flex items-center justify-between text-[11px]'>
          <span className='rounded bg-blue-50 px-1.5 py-0.5 font-medium text-blue-700'>
            {t('sops.canvasDigitalEmployee')}
          </span>
          {normalExits.length > 0 && (
            <span className='text-gray-400'>
              {t('sops.nodeExitCount', { count: normalExits.length })}
            </span>
          )}
        </div>
      </div>

      {/* Normal exit */}
      <Handle
        type='source'
        position={Position.Right}
        data-testid={`canvas:handle:${id}:source`}
        style={{ ...HANDLE_STYLE, right: -8, top: '50%', transform: 'translateY(-50%)' }}
      />

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

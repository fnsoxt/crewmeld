'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import ReactFlow, {
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  BackgroundVariant,
  type Connection,
  ConnectionLineType,
  Controls,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type OnSelectionChangeParams,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { Bot, FlaskConical, Plus, Route, ShieldCheck, UserCircle } from 'lucide-react'
import { SandboxBanner } from '@/components/sandbox/sandbox-banner'
import { SandboxResultPanel } from '@/components/sandbox/sandbox-result-panel'
import { SandboxRunDialog } from '@/components/sandbox/sandbox-run-dialog'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useSandboxSSE } from '@/hooks/use-sandbox-sse'
import { useTranslation } from '@/hooks/use-translation'
import { useSandboxStore } from '@/stores/sandbox'
import { type SopEdgeData, type SopNodeData, useSopEditorStore } from '@/stores/sop/editor-store'
import { SopDigitalEmployeeNode } from './sop-digital-employee-node'
import { SopEdge } from './sop-edge'
import { SopHumanConfirmNode } from './sop-human-confirm-node'
import { SopHumanEmployeeNode } from './sop-human-employee-node'
import { SopSwitchNode } from './sop-switch-node'

const nodeTypes = {
  sopDigitalEmployee: SopDigitalEmployeeNode,
  sopHumanEmployee: SopHumanEmployeeNode,
  sopHumanConfirm: SopHumanConfirmNode,
  sopSwitch: SopSwitchNode,
}

const edgeTypes = {
  'sop-edge': SopEdge,
}

const DEFAULT_EDGE_OPTIONS = {
  type: 'sop-edge' as const,
}

/**
 * Check if adding an edge would create a cycle in the graph.
 * Uses depth-first search to detect if the source node is reachable from the target node.
 */
function wouldCreateCycle(edges: Edge[], sourceId: string, targetId: string): boolean {
  if (sourceId === targetId) return true

  const adjacencyList = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adjacencyList.has(edge.source)) {
      adjacencyList.set(edge.source, [])
    }
    adjacencyList.get(edge.source)!.push(edge.target)
  }

  const visited = new Set<string>()

  function canReachSource(currentNode: string): boolean {
    if (currentNode === sourceId) return true
    if (visited.has(currentNode)) return false
    visited.add(currentNode)
    const neighbors = adjacencyList.get(currentNode) ?? []
    for (const neighbor of neighbors) {
      if (canReachSource(neighbor)) return true
    }
    return false
  }

  return canReachSource(targetId)
}

export function SopCanvas() {
  const nodes = useSopEditorStore((s) => s.nodes)
  const edges = useSopEditorStore((s) => s.edges)
  const setNodes = useSopEditorStore((s) => s.setNodes)
  const setEdges = useSopEditorStore((s) => s.setEdges)
  const setSelectedNodeId = useSopEditorStore((s) => s.setSelectedNodeId)
  const removeNode = useSopEditorStore((s) => s.removeNode)
  const addNode = useSopEditorStore((s) => s.addNode)
  const sopId = useSopEditorStore((s) => s.sopId)

  const { t } = useTranslation()
  const isSandboxMode = useSandboxStore((s) => s.isSandboxMode)
  const [isSandboxDialogOpen, setIsSandboxDialogOpen] = useState(false)

  // Subscribe to sandbox SSE events
  useSandboxSSE()

  /** Inject onDelete callback into node data */
  const nodesWithCallbacks = useMemo(() => {
    return nodes.map((n) => ({
      ...n,
      data: {
        ...n.data,
        onDelete: (nodeId: string) => removeNode(nodeId),
      },
    }))
  }, [nodes, removeNode])

  const handleNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const updated = applyNodeChanges(changes, nodes) as Node<SopNodeData>[]
      setNodes(updated)
    },
    [nodes, setNodes]
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      const updated = applyEdgeChanges(changes, edges) as Edge<SopEdgeData>[]
      setEdges(updated)
    },
    [edges, setEdges]
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      if (connection.source === connection.target) return

      const exists = edges.some(
        (e) =>
          e.source === connection.source &&
          e.target === connection.target &&
          e.sourceHandle === connection.sourceHandle
      )
      if (exists) return

      if (wouldCreateCycle(edges, connection.source, connection.target)) return

      const newEdge: Edge<SopEdgeData> = {
        id: `sop-edge-${Date.now()}`,
        type: 'sop-edge',
        source: connection.source,
        sourceHandle: connection.sourceHandle,
        target: connection.target,
        targetHandle: connection.targetHandle,
        data: {},
      }
      setEdges([...edges, newEdge])
    },
    [edges, setEdges]
  )

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: OnSelectionChangeParams) => {
      const nodeId = selectedNodes.length === 1 ? selectedNodes[0].id : null
      setSelectedNodeId(nodeId)
    },
    [setSelectedNodeId]
  )

  /** Listen for edge delete custom events */
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { edgeId: string }
      if (detail?.edgeId) {
        const filtered = edges.filter((edge) => edge.id !== detail.edgeId)
        setEdges(filtered)
      }
    }
    window.addEventListener('sop-edge-delete', handler)
    return () => window.removeEventListener('sop-edge-delete', handler)
  }, [edges, setEdges])

  /** Calculate position for next node based on existing nodes */
  const getNextPosition = useCallback(() => {
    const count = nodes.length
    const col = count % 3
    const row = Math.floor(count / 3)
    return { x: col * 300 + 60, y: row * 200 + 60 }
  }, [nodes.length])

  return (
    <div className='relative flex h-full w-full flex-col'>
      {isSandboxMode && <SandboxBanner />}
      <div className='relative flex-1'>
        <ReactFlow
          nodes={nodesWithCallbacks}
          edges={edges}
          onNodesChange={handleNodesChange}
          onEdgesChange={handleEdgesChange}
          onConnect={handleConnect}
          onSelectionChange={handleSelectionChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          defaultEdgeOptions={DEFAULT_EDGE_OPTIONS}
          connectionLineType={ConnectionLineType.SmoothStep}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.3}
          maxZoom={1.5}
          panOnScroll
          deleteKeyCode={['Backspace', 'Delete']}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color='#e5e7eb' />
          <Controls showInteractive={false} />
        </ReactFlow>

        <div className='absolute top-3 left-3 z-10 flex gap-2'>
          {/* Add step (execution nodes) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size='sm' className='gap-1.5 shadow-md' data-testid='canvas:toolbar:add-node'>
                <Plus className='h-4 w-4' />
                {t('sops.canvasAddStep')}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => addNode('digital_employee', getNextPosition())}
                data-testid='canvas:toolbar:add-digital-employee'
              >
                <Bot className='mr-2 h-4 w-4 text-blue-500' />
                {t('sops.canvasDigitalEmployee')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => addNode('human_employee', getNextPosition())}
                data-testid='canvas:toolbar:add-human-employee'
              >
                <UserCircle className='mr-2 h-4 w-4 text-amber-500' />
                {t('sops.canvasHumanEmployee')}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => addNode('human_confirm', getNextPosition())}
                data-testid='canvas:toolbar:add-human-confirm'
              >
                <ShieldCheck className='mr-2 h-4 w-4 text-purple-500' />
                {t('sops.canvasHumanConfirm')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Add branch */}
          <Button
            size='sm'
            variant='outline'
            className='gap-1.5 shadow-md'
            data-testid='canvas:toolbar:add-switch'
            onClick={() => addNode('switch', getNextPosition())}
          >
            <Route className='h-4 w-4 text-orange-500' />
            {t('sops.canvasAddBranch')}
          </Button>

          <Button
            size='sm'
            variant='outline'
            className='gap-1.5 shadow-md'
            data-testid='sop:toolbar:sandbox-run'
            onClick={() => setIsSandboxDialogOpen(true)}
          >
            <FlaskConical className='h-4 w-4 text-amber-500' />
            {t('sops.canvasSandboxRun')}
          </Button>
        </div>
      </div>

      {isSandboxMode && <SandboxResultPanel />}

      <SandboxRunDialog
        open={isSandboxDialogOpen}
        onOpenChange={setIsSandboxDialogOpen}
        sopDefinitionId={sopId ?? undefined}
        runType='sop_run'
      />
    </div>
  )
}

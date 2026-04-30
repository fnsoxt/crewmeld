import type { Edge, Node } from 'reactflow'
import type { SopEdgeData, SopNodeData } from '@/stores/sop/editor-store'
import type { SopDefinitionPayload, SopNode, SopSerializedEdge } from '@/types/sop'

/** Auto-layout when no saved positions: grid with 3 columns */
function autoLayoutPosition(index: number): { x: number; y: number } {
  const col = index % 3
  const row = Math.floor(index / 3)
  return { x: col * 300 + 60, y: row * 200 + 60 }
}

/** SOP node type to ReactFlow nodeType mapping (design doc section 6.7) */
function mapNodeType(sopType: string): string {
  const mapping: Record<string, string> = {
    digital_employee: 'sopDigitalEmployee',
    human_employee: 'sopHumanEmployee',
    human_confirm: 'sopHumanConfirm',
  }
  return mapping[sopType] ?? 'sopDigitalEmployee'
}

/** Canvas state → API payload */
export function serializeSopToPayload(
  nodes: Node<SopNodeData>[],
  edges: Edge<SopEdgeData>[],
  meta: {
    name: string
    description: string
    triggerType: string
    triggerConfig: Record<string, unknown>
    sopTimeoutMinutes: number
    maxRejectionCycles: number
  }
): SopDefinitionPayload {
  // Sync ReactFlow edges to node exit targetNodeId
  // sourceHandle matches exit.id; if sourceHandle is empty, match the first exit
  const sopNodes: SopNode[] = nodes.map((n) => {
    const node = { ...n.data.sopNode, position: n.position }
    const nodeEdges = edges.filter((e) => e.source === node.id)

    node.exits = node.exits.map((exit) => {
      // Error exits must match precisely via sourceHandle, not participate in fallback matching without handle
      const matchedEdge = nodeEdges.find((e) =>
        e.sourceHandle
          ? e.sourceHandle === exit.id
          : exit.type !== 'error' && nodeEdges.length === 1
      )
      return {
        ...exit,
        targetNodeId: matchedEdge?.target ?? null,
      }
    })

    return node
  })

  const sopEdges: SopSerializedEdge[] = edges.map((e) => ({
    id: e.id,
    source: e.source,
    sourceHandle: e.sourceHandle ?? null,
    target: e.target,
    targetHandle: e.targetHandle ?? null,
  }))

  return {
    name: meta.name.trim(),
    description: meta.description.trim() || undefined,
    triggerType: meta.triggerType,
    triggerConfig: meta.triggerConfig,
    sopTimeoutMinutes: meta.sopTimeoutMinutes,
    maxRejectionCycles: meta.maxRejectionCycles,
    nodes: sopNodes,
    edges: sopEdges,
  }
}

/** API definition data → canvas nodes + edges */
export function deserializeSopFromDefinition(definition: {
  nodes: SopNode[]
  edges: SopSerializedEdge[]
}): {
  nodes: Node<SopNodeData>[]
  edges: Edge<SopEdgeData>[]
} {
  const sopNodes = definition.nodes ?? []

  const nodes: Node<SopNodeData>[] = sopNodes.map((sopNode, i) => ({
    id: sopNode.id,
    type: mapNodeType(sopNode.type),
    position: sopNode.position ?? autoLayoutPosition(i),
    data: { sopNode },
  }))

  const sopEdges = definition.edges ?? []

  const edges: Edge<SopEdgeData>[] = sopEdges.map((e) => ({
    id: e.id,
    type: 'sop-edge',
    source: e.source,
    sourceHandle: e.sourceHandle ?? undefined,
    target: e.target,
    targetHandle: e.targetHandle ?? undefined,
    data: {},
  }))

  return { nodes, edges }
}

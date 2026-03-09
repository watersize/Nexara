'use client'

import { useEffect, useState } from 'react'
import { fetchNodeWithNeighbors } from '@/lib/markdown-link-indexer'

type NeighborNode = {
  node_id: string
  title: string
  kind: string
  direction: string
  edge_type: string
  weight: number
}

function kindColor(kind: string) {
  if (kind === 'task') return 'rgba(59,130,246,0.95)'
  if (kind === 'note') return 'rgba(16,185,129,0.95)'
  if (kind === 'schedule') return 'rgba(168,85,247,0.95)'
  return 'rgba(148,163,184,0.95)'
}

export function MiniGraphPreview({
  centerLabel,
  neighbors,
  onExpand,
}: {
  centerLabel: string
  neighbors: NeighborNode[]
  onExpand?: () => void
}) {
  const [subGraphs, setSubGraphs] = useState<Record<string, NeighborNode[]>>({})

  useEffect(() => {
    let mounted = true
    const top = neighbors.slice(0, 4)
    for (const n of top) {
        if (n.kind !== 'task') { // Only fetch sub-branches for notes/schedules to avoid massive task trees
            fetchNodeWithNeighbors(n.node_id).then(res => {
                if (mounted && res?.neighbors) {
                    setSubGraphs(prev => ({
                        ...prev, 
                        [n.node_id]: res.neighbors.filter(sn => sn.title !== centerLabel)
                    }))
                }
            }).catch(() => {})
        }
    }
    return () => { mounted = false }
  }, [neighbors, centerLabel])
  const cx = 92
  const cy = 72
  const radius = 48
  const visible = neighbors.slice(0, 8)

  return (
    <button
      type="button"
      onClick={onExpand}
      className="group w-full rounded-[24px] border border-white/8 bg-white/[0.03] p-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.22em] text-white/45">Мини-граф</div>
        <div className="text-xs text-white/45 group-hover:text-white/75">
          {visible.length ? `${visible.length} связей` : 'без ссылок'}
        </div>
      </div>
      <svg viewBox="0 0 184 144" className="h-36 w-full">
        <defs>
          <filter id="mini-graph-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {visible.map((node, index) => {
          const angle = (Math.PI * 2 * index) / Math.max(visible.length, 1) - Math.PI / 2
          const x = cx + Math.cos(angle) * radius
          const y = cy + Math.sin(angle) * radius
          const stroke = node.direction === 'incoming' ? 'rgba(16,185,129,0.8)' : 'rgba(59,130,246,0.85)'
          const subNodes = subGraphs[node.node_id]?.slice(0, 3) || []
          
          return (
            <g key={node.node_id}>
              {/* Main branch */}
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={stroke} strokeWidth="2.5" filter="url(#mini-graph-glow)" />
              
              {/* Sub-branches (Depth 2) */}
              {subNodes.map((subNode, subIndex) => {
                  const subAngle = angle + (subIndex - (subNodes.length - 1) / 2) * 0.8
                  const sx = x + Math.cos(subAngle) * 22
                  const sy = y + Math.sin(subAngle) * 22
                  const subStroke = subNode.direction === 'incoming' ? 'rgba(16,185,129,0.4)' : 'rgba(59,130,246,0.4)'
                  return (
                      <g key={`sub-${subNode.node_id}`}>
                          <line x1={x} y1={y} x2={sx} y2={sy} stroke={subStroke} strokeWidth="1.2" filter="url(#mini-graph-glow)" />
                          <circle cx={sx} cy={sy} r="4" fill={kindColor(subNode.kind)} filter="url(#mini-graph-glow)" />
                      </g>
                  )
              })}
              
              <circle cx={x} cy={y} r="7.5" fill={kindColor(node.kind)} filter="url(#mini-graph-glow)" />
            </g>
          )
        })}
        <circle cx={cx} cy={cy} r="14" fill="white" filter="url(#mini-graph-glow)" />
        <text x={cx} y={130} textAnchor="middle" fill="rgba(255,255,255,0.72)" fontSize="11">
          {centerLabel.length > 24 ? `${centerLabel.slice(0, 24)}...` : centerLabel}
        </text>
      </svg>
    </button>
  )
}

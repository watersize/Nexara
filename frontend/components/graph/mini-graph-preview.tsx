'use client'

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
          const stroke = node.direction === 'incoming' ? 'rgba(16,185,129,0.5)' : 'rgba(59,130,246,0.55)'
          return (
            <g key={node.node_id}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke={stroke} strokeWidth="1.8" filter="url(#mini-graph-glow)" />
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

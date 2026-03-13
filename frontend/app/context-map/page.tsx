'use client'

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAppState } from '@/lib/tauri-provider'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { Map, Play, Pause, RotateCcw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'
import { useTheme } from 'next-themes'

interface GraphNode {
  node_id: string
  kind: string
  title: string
  slug: string
  topic: string
  content: string
  source_ref: string
  created_at: string
  updated_at: string
}

interface GraphEdge {
  from_node_id: string
  to_node_id: string
  edge_type: string
}

interface SimNode extends GraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  visible: boolean
}

const KIND_COLORS: Record<string, string> = {
  note: '#60a5fa',
  task: '#34d399',
  schedule: '#fbbf24',
  roadmap: '#f472b6',
  textbook: '#a78bfa',
  folder: '#fb923c',
}

const KIND_RADIUS: Record<string, number> = {
  note: 22,
  task: 18,
  schedule: 16,
  roadmap: 26,
  textbook: 20,
  folder: 14,
}

function getKindColor(kind: string) {
  return KIND_COLORS[kind] || '#94a3b8'
}

function getKindRadius(kind: string) {
  return KIND_RADIUS[kind] || 18
}

export default function ContextMapPage() {
  const appState = useAppState()
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme !== 'light' : true

  const [rawNodes, setRawNodes] = useState<GraphNode[]>([])
  const [rawEdges, setRawEdges] = useState<GraphEdge[]>([])
  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const [hoveredNode, setHoveredNode] = useState<string | null>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animProgress, setAnimProgress] = useState(1)
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const svgRef = useRef<SVGSVGElement>(null)
  const animRef = useRef<number>(0)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [draggingNode, setDraggingNode] = useState<string | null>(null)

  // Load graph data
  useEffect(() => {
    tauriInvoke<{ nodes: GraphNode[]; edges: GraphEdge[] }>('get_all_graph')
      .then(res => {
        setRawNodes(res.nodes || [])
        setRawEdges(res.edges || [])
      })
      .catch(err => console.error('Failed to load graph:', err))
  }, [])

  // Initialize simulation
  useEffect(() => {
    if (rawNodes.length === 0) return
    const cx = 500
    const cy = 400
    const initial: SimNode[] = rawNodes.map((n, i) => {
      const angle = (i / rawNodes.length) * Math.PI * 2
      const r = 150 + Math.random() * 200
      return {
        ...n,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        vx: 0, vy: 0,
        radius: getKindRadius(n.kind),
        visible: true,
      }
    })
    setSimNodes(initial)
  }, [rawNodes])

  // Simple force simulation
  useEffect(() => {
    if (simNodes.length === 0) return
    let running = true
    let nodes = simNodes.map(n => ({ ...n }))
    let tick = 0
    const maxTicks = 300

    const step = () => {
      if (!running || tick > maxTicks) return
      tick++
      const alpha = Math.max(0.001, 1 - tick / maxTicks) * 0.4

      // Center gravity
      const cx = 500, cy = 400
      for (const n of nodes) {
        n.vx += (cx - n.x) * 0.002 * alpha
        n.vy += (cy - n.y) * 0.002 * alpha
      }

      // Repulsion
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minDist = a.radius + b.radius + 60
          if (dist < minDist) {
            const force = ((minDist - dist) / dist) * alpha * 2
            a.vx -= dx * force
            a.vy -= dy * force
            b.vx += dx * force
            b.vy += dy * force
          }
        }
      }

      // Attraction (edges)
      const nodeMap = new Map(nodes.map(n => [n.node_id, n]))
      for (const edge of rawEdges) {
        const a = nodeMap.get(edge.from_node_id)
        const b = nodeMap.get(edge.to_node_id)
        if (!a || !b) continue
        const dx = b.x - a.x, dy = b.y - a.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const targetDist = 140
        const force = ((dist - targetDist) / dist) * alpha * 0.3
        a.vx += dx * force
        a.vy += dy * force
        b.vx -= dx * force
        b.vy -= dy * force
      }

      // Apply velocities with damping
      for (const n of nodes) {
        n.vx *= 0.85
        n.vy *= 0.85
        n.x += n.vx
        n.y += n.vy
      }

      setSimNodes([...nodes])
      if (tick < maxTicks) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
    return () => { running = false }
  }, [rawNodes.length]) // Only run once when nodes load

  // Animation playback
  const playAnimation = useCallback(() => {
    if (simNodes.length === 0) return
    setIsAnimating(true)
    setAnimProgress(0)
    const sorted = [...simNodes].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
    const total = sorted.length
    let current = 0
    const nodeOrder = sorted.map(n => n.node_id)

    const step = () => {
      current++
      const progress = current / total
      setAnimProgress(progress)
      setSimNodes(prev => prev.map(n => ({
        ...n,
        visible: nodeOrder.indexOf(n.node_id) < current,
      })))
      if (current < total) {
        animRef.current = window.setTimeout(step, 120) as any
      } else {
        setIsAnimating(false)
      }
    }
    step()
  }, [simNodes])

  const stopAnimation = () => {
    clearTimeout(animRef.current)
    setIsAnimating(false)
    setSimNodes(prev => prev.map(n => ({ ...n, visible: true })))
    setAnimProgress(1)
  }

  const resetView = () => {
    setScale(1)
    setPan({ x: 0, y: 0 })
  }

  // SVG interaction handlers
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.93
    setScale(s => Math.min(4, Math.max(0.15, s * factor)))
  }

  const handleBgMouseDown = (e: React.MouseEvent) => {
    if ((e.target as Element).tagName === 'svg' || (e.target as Element).classList.contains('graph-bg')) {
      setIsDragging(true)
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
    }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingNode) {
      const svgRect = svgRef.current?.getBoundingClientRect()
      if (!svgRect) return
      const x = (e.clientX - svgRect.left - pan.x) / scale
      const y = (e.clientY - svgRect.top - pan.y) / scale
      setSimNodes(prev => prev.map(n => n.node_id === draggingNode ? { ...n, x, y } : n))
    } else if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = () => {
    setIsDragging(false)
    setDraggingNode(null)
  }

  const nodeMap = useMemo(() => new Map(simNodes.map(n => [n.node_id, n])), [simNodes])

  // Legend
  const kindCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of rawNodes) {
      counts[n.kind] = (counts[n.kind] || 0) + 1
    }
    return counts
  }, [rawNodes])

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Toolbar */}
        <div className={cn(
          'flex items-center justify-between gap-3 border-b px-5 py-3',
          dark ? 'border-white/8 bg-white/[0.02]' : 'border-gray-200 bg-white'
        )}>
          <div className="flex items-center gap-3">
            <Map className={cn('h-5 w-5', dark ? 'text-white/60' : 'text-gray-500')} />
            <h1 className={cn('text-lg font-semibold', dark ? 'text-white' : 'text-gray-900')}>Project Context Map</h1>
            <span className={cn('rounded-full px-3 py-0.5 text-xs font-medium', dark ? 'bg-white/8 text-white/50' : 'bg-gray-100 text-gray-500')}>
              {rawNodes.length} узлов · {rawEdges.length} связей
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={isAnimating ? stopAnimation : playAnimation}
              className={cn(
                'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-colors',
                isAnimating
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : dark ? 'bg-white/8 text-white/70 hover:bg-white/12' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              )}
            >
              {isAnimating ? <><Pause className="h-3.5 w-3.5" /> Стоп</> : <><Play className="h-3.5 w-3.5" /> Анимация</>}
            </button>
            <button onClick={resetView} className={cn('rounded-xl p-1.5 transition-colors', dark ? 'text-white/50 hover:bg-white/8 hover:text-white' : 'text-gray-400 hover:bg-gray-100')}>
              <Maximize2 className="h-4 w-4" />
            </button>
            <button onClick={() => setScale(s => Math.min(4, s * 1.2))} className={cn('rounded-xl p-1.5 transition-colors', dark ? 'text-white/50 hover:bg-white/8 hover:text-white' : 'text-gray-400 hover:bg-gray-100')}>
              <ZoomIn className="h-4 w-4" />
            </button>
            <button onClick={() => setScale(s => Math.max(0.15, s * 0.83))} className={cn('rounded-xl p-1.5 transition-colors', dark ? 'text-white/50 hover:bg-white/8 hover:text-white' : 'text-gray-400 hover:bg-gray-100')}>
              <ZoomOut className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* SVG Graph */}
        <div className="relative flex-1 overflow-hidden">
          <svg
            ref={svgRef}
            className="h-full w-full"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={handleBgMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <rect className="graph-bg" width="100%" height="100%" fill={dark ? '#080c18' : '#f8fafc'} />
            <g transform={`translate(${pan.x},${pan.y}) scale(${scale})`}>
              {/* Edges */}
              {rawEdges.map((edge, i) => {
                const a = nodeMap.get(edge.from_node_id)
                const b = nodeMap.get(edge.to_node_id)
                if (!a || !b || !a.visible || !b.visible) return null
                const isHovered = hoveredNode === a.node_id || hoveredNode === b.node_id
                return (
                  <line
                    key={`e-${i}`}
                    x1={a.x} y1={a.y} x2={b.x} y2={b.y}
                    stroke={isHovered ? getKindColor(a.kind) : (dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)')}
                    strokeWidth={isHovered ? 2.5 : 1}
                    style={{ transition: 'stroke 0.2s, stroke-width 0.2s' }}
                  />
                )
              })}

              {/* Nodes */}
              {simNodes.filter(n => n.visible).map(n => {
                const isHovered = hoveredNode === n.node_id
                const color = getKindColor(n.kind)
                return (
                  <g
                    key={n.node_id}
                    onMouseEnter={() => setHoveredNode(n.node_id)}
                    onMouseLeave={() => setHoveredNode(null)}
                    onMouseDown={(e) => { e.stopPropagation(); setDraggingNode(n.node_id) }}
                    style={{ cursor: 'pointer' }}
                  >
                    {/* Glow */}
                    {isHovered && (
                      <circle cx={n.x} cy={n.y} r={n.radius + 8} fill={color} opacity={0.15} />
                    )}
                    {/* Circle */}
                    <circle
                      cx={n.x} cy={n.y} r={n.radius}
                      fill={isHovered ? color : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)')}
                      stroke={color}
                      strokeWidth={isHovered ? 2.5 : 1.5}
                      style={{ transition: 'all 0.2s' }}
                    />
                    {/* Label */}
                    <text
                      x={n.x} y={n.y + n.radius + 16}
                      textAnchor="middle"
                      fill={isHovered ? color : (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)')}
                      fontSize={11} fontWeight={isHovered ? 600 : 400}
                      style={{ transition: 'all 0.2s', pointerEvents: 'none' }}
                    >
                      {n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title}
                    </text>
                    {/* Kind icon letter */}
                    <text
                      x={n.x} y={n.y + 4}
                      textAnchor="middle"
                      fill={color}
                      fontSize={n.radius * 0.8}
                      fontWeight={700}
                      style={{ pointerEvents: 'none' }}
                    >
                      {n.kind.charAt(0).toUpperCase()}
                    </text>
                  </g>
                )
              })}
            </g>
          </svg>

          {/* Hover tooltip */}
          {hoveredNode && (() => {
            const n = nodeMap.get(hoveredNode)
            if (!n) return null
            return (
              <div
                className={cn(
                  'pointer-events-none absolute z-20 max-w-xs rounded-2xl border p-3 shadow-xl',
                  dark ? 'border-white/10 bg-[#0c0e1c]/95 text-white backdrop-blur' : 'border-gray-200 bg-white text-gray-900 shadow-lg'
                )}
                style={{
                  left: n.x * scale + pan.x + 30,
                  top: n.y * scale + pan.y - 10,
                }}
              >
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: getKindColor(n.kind) }} />
                  <span className="text-xs font-semibold">{n.title}</span>
                </div>
                <div className={cn('mt-1 text-[10px]', dark ? 'text-white/40' : 'text-gray-500')}>
                  {n.kind} · {n.topic || 'без темы'}
                </div>
                {n.content && (
                  <p className={cn('mt-1.5 line-clamp-2 text-[10px]', dark ? 'text-white/50' : 'text-gray-600')}>
                    {n.content.slice(0, 100)}
                  </p>
                )}
              </div>
            )
          })()}

          {/* Legend */}
          <div className={cn(
            'absolute bottom-4 left-4 rounded-2xl border p-3',
            dark ? 'border-white/8 bg-[#0c0e1c]/90 backdrop-blur' : 'border-gray-200 bg-white/90 backdrop-blur shadow'
          )}>
            <div className={cn('mb-2 text-[10px] font-semibold uppercase tracking-wider', dark ? 'text-white/30' : 'text-gray-400')}>
              Типы узлов
            </div>
            <div className="flex flex-col gap-1.5">
              {Object.entries(kindCounts).map(([kind, count]) => (
                <div key={kind} className="flex items-center gap-2 text-xs">
                  <div className="h-2.5 w-2.5 rounded-full" style={{ background: getKindColor(kind) }} />
                  <span className={dark ? 'text-white/60' : 'text-gray-600'}>{kind}</span>
                  <span className={cn('ml-auto', dark ? 'text-white/30' : 'text-gray-400')}>{count}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Animation progress */}
          {isAnimating && (
            <div className={cn(
              'absolute bottom-4 right-4 rounded-2xl border px-4 py-2',
              dark ? 'border-white/8 bg-[#0c0e1c]/90 backdrop-blur' : 'border-gray-200 bg-white/90 backdrop-blur shadow'
            )}>
              <div className={cn('text-xs font-medium', dark ? 'text-white/60' : 'text-gray-600')}>
                Воспроизведение: {Math.round(animProgress * 100)}%
              </div>
              <div className={cn('mt-1.5 h-1.5 w-32 rounded-full overflow-hidden', dark ? 'bg-white/10' : 'bg-gray-200')}>
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${animProgress * 100}%` }} />
              </div>
            </div>
          )}

          {/* Empty state */}
          {rawNodes.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Map className={cn('mb-3 h-12 w-12', dark ? 'text-white/15' : 'text-gray-300')} />
              <p className={cn('text-sm font-medium', dark ? 'text-white/30' : 'text-gray-400')}>Граф пуст</p>
              <p className={cn('mt-1 text-xs', dark ? 'text-white/20' : 'text-gray-400')}>
                Создайте заметки и задачи с [[ссылками]] для построения графа
              </p>
            </div>
          )}
        </div>
      </main>
    </AppShell>
  )
}

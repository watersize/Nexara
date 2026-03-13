'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AppShell } from '@/components/app-shell'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'
import { Network, RefreshCw, ZoomIn, ZoomOut, Maximize2 } from 'lucide-react'

type GraphNode = {
  node_id: string
  kind: string
  title: string
  slug: string
  topic: string
  content: string
  date?: string // Added date property for schedule nodes
}

type GraphEdge = {
  from_node_id: string
  to_node_id: string
  edge_type: string
}

type SimNode = GraphNode & {
  x: number
  y: number
  vx: number
  vy: number
  r: number
}

export default function GraphPage() {
  const { resolvedTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const dark = mounted ? resolvedTheme === 'dark' : true
  const router = useRouter()

  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<GraphEdge[]>([])
  const [selected, setSelected] = useState<SimNode | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Viewport transform state
  const [scale, setScale] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isPanningRef = useRef(false)
  const lastPanPos = useRef({ x: 0, y: 0 })

  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<GraphEdge[]>([])
  const rafRef = useRef<number | undefined>(undefined)
  const svgRef = useRef<SVGSVGElement>(null)

  const W = 1800
  const H = 1000

  // Schedule Timeline Helpers
  const parseDate = (d: string) => {
    const parts = d.split('.')
    if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime()
    return Date.parse(d) || 0
  }

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await tauriInvoke<{ nodes: GraphNode[]; edges: GraphEdge[] }>('get_all_graph')
        let sim: SimNode[] = res.nodes.map((n, i) => ({
          ...n,
          x: W / 2 + Math.cos((i / res.nodes.length) * Math.PI * 2) * 280,
          y: H / 2 + Math.sin((i / res.nodes.length) * Math.PI * 2) * 180,
          vx: 0,
          vy: 0,
          r: n.kind === 'folder' ? 14 : (n.kind === 'roadmap' ? 24 : 8),
        }))
        const edgesList = [...(res.edges || [])]

        // Parse cross-links globally
        const linkRegex = /\[\[(.*?)\]\]/g
        const newNodes: SimNode[] = []
        sim.forEach(node => {
            if (!node.content) return
            const matches = [...node.content.matchAll(linkRegex)]
            matches.forEach(m => {
                const linkText = m[1]
                if (linkText.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
                    let schedNode = sim.find(s => s.kind === 'schedule' && s.title === linkText) || newNodes.find(s => s.title === linkText)
                    if (!schedNode) {
                        schedNode = {
                            node_id: `sched-${linkText}`, kind: 'schedule', title: linkText, slug: linkText, topic: 'timeline', content: '', date: linkText,
                            x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, r: 18
                        }
                        newNodes.push(schedNode)
                    }
                    if (!edgesList.find(e => (e.from_node_id === node.node_id && e.to_node_id === schedNode!.node_id))) {
                        edgesList.push({ from_node_id: node.node_id, to_node_id: schedNode.node_id, edge_type: 'date_link' })
                    }
                } else {
                    const target = sim.find(s => s.title.toLowerCase() === linkText.toLowerCase())
                    if (target && target.node_id !== node.node_id) {
                        if (!edgesList.find(e => (e.from_node_id === node.node_id && e.to_node_id === target.node_id))) {
                           edgesList.push({ from_node_id: node.node_id, to_node_id: target.node_id, edge_type: 'cross_link' })
                        }
                    }
                }
            })

            // If it's a task and has no date link, link it to the current day
            if (node.kind === 'task' || node.kind === 'roadmap') {
                const hasDateLink = edgesList.some(e => e.from_node_id === node.node_id && e.edge_type === 'date_link')
                if (!hasDateLink) {
                    const todayStr = new Date().toLocaleDateString('ru-RU', {day: '2-digit', month: '2-digit', year: 'numeric'})
                    let todayNode = sim.find(s => s.kind === 'schedule' && s.title === todayStr) || newNodes.find(s => s.title === todayStr)
                    if (!todayNode) {
                        todayNode = {
                            node_id: `sched-${todayStr}`, kind: 'schedule', title: todayStr, slug: todayStr, topic: 'timeline', content: '', date: todayStr,
                            x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, r: 18
                        }
                        newNodes.push(todayNode)
                    }
                    edgesList.push({ from_node_id: node.node_id, to_node_id: todayNode.node_id, edge_type: 'date_link' })
                }
            }
        })
        sim = [...sim, ...newNodes]

        nodesRef.current = sim
        edgesRef.current = edgesList
        setNodes([...sim])
        setEdges(edgesList)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // Force simulation
  useEffect(() => {
    if (nodes.length === 0) return
    let iter = 0
    const simulate = () => {
      const ns = nodesRef.current
      const es = edgesRef.current
      if (ns.length === 0) return

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x || 0.01
          const dy = ns[j].y - ns[i].y || 0.01
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const minD = ns[i].r + ns[j].r + 20
          if (dist < minD * 2.5) {
            const f = Math.min(250 / (dist * dist), 8)
            const fx = (dx / dist) * f, fy = (dy / dist) * f
            ns[i].vx -= fx; ns[i].vy -= fy
            ns[j].vx += fx; ns[j].vy += fy
          }
        }
      }

      // Spring for edges
      for (const e of es) {
        const src = ns.find(n => n.node_id === e.from_node_id)
        const tgt = ns.find(n => n.node_id === e.to_node_id)
        if (src && tgt) {
          const dx = tgt.x - src.x, dy = tgt.y - src.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const f = (dist - 120) * 0.04
          const fx = (dx / dist) * f, fy = (dy / dist) * f
          src.vx += fx; src.vy += fy
          tgt.vx -= fx; tgt.vy -= fy
        }
      }

      // Pre-calculate timeline positions
      const timelineNodes = ns.filter(n => n.kind === 'schedule' && (n.date || n.title.match(/^\d{2}\.\d{2}\.\d{4}$/)))
      const uniqueDates = Array.from(new Set(timelineNodes.map(n => n.date || n.title)))
      uniqueDates.sort((a,b) => parseDate(a) - parseDate(b))

      const dateX = (d: string) => {
         const index = uniqueDates.indexOf(d)
         if (index === -1) return W / 2
         const spacing = Math.min(1000 / Math.max(1, uniqueDates.length), 300)
         return (W / 2) - ((uniqueDates.length * spacing) / 2) + (index * spacing)
      }

      // Gravity and Date-based pinning for Schedules
      for (const n of ns) {
        if (n.kind === 'schedule' && (n.date || n.title.match(/^\d{2}\.\d{2}\.\d{4}$/))) {
            const dateStr = n.date || n.title
            const targetX = dateX(dateStr)
            // Reduced physics clamping to allow manual dragging out of position
            n.vx += (targetX - n.x) * 0.02
            n.vy += (H / 2 - n.y) * 0.01 // very weak horizontal pinning to allow dragging
        } else if (n.kind === 'roadmap') {
            n.vx += (W / 2 - n.x) * 0.005
            n.vy += (H / 2 - n.y) * 0.005
        } else {
            n.vx += (W / 2 - n.x) * 0.002
            n.vy += ((H / 2) + 150 - n.y) * 0.002 // slight bias downwards from timeline
        }
      }

      let moving = false
      for (const n of ns) {
        n.vx *= 0.65; n.vy *= 0.65
        n.x = Math.max(30, Math.min(W - 30, n.x + n.vx))
        n.y = Math.max(30, Math.min(H - 30, n.y + n.vy))
        // High threshold to allow continuous adaptation dragging
        if (Math.abs(n.vx) > 0.02 || Math.abs(n.vy) > 0.02) moving = true
      }

      setNodes([...ns])
      iter++
      // Constant background simulation loop when dragging
      if (moving && iter < 1200) rafRef.current = requestAnimationFrame(simulate)
    }

    rafRef.current = requestAnimationFrame(simulate)
    return () => cancelAnimationFrame(rafRef.current!)
  }, [nodes.length])

  // Wheel zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setScale(s => Math.max(0.2, Math.min(4, s * factor)))
  }, [])

  // Middle-click / Space+drag pan
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2) { // middle or right click
      e.preventDefault()
      isPanningRef.current = true
      lastPanPos.current = { x: e.clientX, y: e.clientY }
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanningRef.current) return
    const dx = e.clientX - lastPanPos.current.x
    const dy = e.clientY - lastPanPos.current.y
    lastPanPos.current = { x: e.clientX, y: e.clientY }
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
  }, [])

  const handleMouseUp = useCallback(() => { isPanningRef.current = false }, [])

  // Navigate to node's corresponding page
  const openNode = (node: SimNode) => {
    if (node.kind === 'note' || node.kind === 'folder') {
      router.push('/notebook')
    } else if (node.kind === 'task') {
      router.push('/planner')
    } else if (node.kind === 'schedule') {
      router.push('/schedule')
    } else if (node.kind === 'roadmap') {
      router.push('/roadmap')
    }
  }

  const nodeColor = (kind: string) => {
    if (kind === 'folder') return dark ? '#f59e0b' : '#d97706'
    if (kind === 'task') return dark ? '#6366f1' : '#4f46e5'
    if (kind === 'schedule') return dark ? '#10b981' : '#059669'
    if (kind === 'roadmap') return dark ? '#ec4899' : '#db2777' // Pink for roadmap
    return dark ? '#3b82f6' : '#2563eb'
  }

  const resetView = () => { setScale(1); setPan({ x: 0, y: 0 }) }

  return (
    <AppShell>
      <div className={cn('flex flex-col h-screen overflow-hidden', dark ? 'bg-[#07080f]' : 'bg-gray-50')}>
        {/* Header */}
        <div className={cn('flex items-center justify-between px-6 py-4 border-b shrink-0', dark ? 'border-white/8 bg-[#0b0c14]' : 'border-gray-200 bg-white')}>
          <div className="flex items-center gap-3">
            <div className={cn('h-9 w-9 rounded-2xl flex items-center justify-center', dark ? 'bg-indigo-500/15' : 'bg-indigo-50')}>
              <Network className={cn('h-4 w-4', dark ? 'text-indigo-400' : 'text-indigo-500')} />
            </div>
            <div>
              <h1 className={cn('text-base font-bold', dark ? 'text-white' : 'text-gray-900')}>Граф связей</h1>
              <p className={cn('text-xs', dark ? 'text-white/40' : 'text-gray-500')}>{nodes.length} узлов · {edges.length} связей</p>
            </div>
          </div>

          {/* Toolbar — clean, no duplicates */}
          <div className={cn('flex items-center gap-1 rounded-2xl border px-1.5 py-1', dark ? 'border-white/10 bg-white/[0.03]' : 'border-gray-200 bg-white')}>
            <button
              onClick={() => setScale(s => Math.min(4, s * 1.2))}
              title="Приблизить"
              className={cn('h-8 w-8 rounded-xl flex items-center justify-center transition-colors', dark ? 'hover:bg-white/8 text-white/60 hover:text-white' : 'hover:bg-gray-100 text-gray-500')}
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => setScale(s => Math.max(0.2, s * 0.8))}
              title="Отдалить"
              className={cn('h-8 w-8 rounded-xl flex items-center justify-center transition-colors', dark ? 'hover:bg-white/8 text-white/60 hover:text-white' : 'hover:bg-gray-100 text-gray-500')}
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <div className={cn('w-px h-4', dark ? 'bg-white/10' : 'bg-gray-200')} />
            <button
              onClick={resetView}
              title="По умолчанию"
              className={cn('h-8 w-8 rounded-xl flex items-center justify-center transition-colors', dark ? 'hover:bg-white/8 text-white/60 hover:text-white' : 'hover:bg-gray-100 text-gray-500')}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <button
              onClick={load}
              title="Обновить"
              className={cn('h-8 w-8 rounded-xl flex items-center justify-center transition-colors', dark ? 'hover:bg-white/8 text-white/60 hover:text-white' : 'hover:bg-gray-100 text-gray-500')}
            >
              <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
            </button>
            <div className={cn('text-xs px-2 tabular-nums', dark ? 'text-white/30' : 'text-gray-400')}>
              {Math.round(scale * 100)}%
            </div>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Graph canvas */}
          <div
            className="flex-1 overflow-hidden relative"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onContextMenu={e => e.preventDefault()}
            style={{ cursor: isPanningRef.current ? 'grabbing' : 'default' }}
          >
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div className={cn('text-sm', dark ? 'text-white/40' : 'text-gray-400')}>Загрузка графа...</div>
              </div>
            )}
            {!isLoading && nodes.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 z-10">
                <Network className={cn('h-16 w-16', dark ? 'text-white/10' : 'text-gray-300')} />
                <p className={cn('text-sm', dark ? 'text-white/30' : 'text-gray-500')}>
                  Нет данных. Создайте заметки с Wiki-ссылками <code className="mx-1 rounded px-1 font-mono">{'[[название]]'}</code>
                </p>
              </div>
            )}
            <svg
              ref={svgRef}
              className="w-full h-full"
              viewBox={`0 0 ${W} ${H}`}
              preserveAspectRatio="xMidYMid meet"
              style={{ touchAction: 'none' }}
            >
              <defs>
                 <linearGradient id="roadmapEdge" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#00d2ff" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity="0.8" />
                 </linearGradient>
                 <filter id="nodeGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                 </filter>
                 <filter id="timelineGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                 </filter>
              </defs>
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${scale})`} style={{ transformOrigin: `${W / 2}px ${H / 2}px` }}>
                {/* Timeline connector line behind everything - REMOVED PER USER REQUEST */}
                {/* Edges */}
                {edges.map((e, i) => {
                  const src = nodes.find(n => n.node_id === e.from_node_id)
                  const tgt = nodes.find(n => n.node_id === e.to_node_id)
                  if (!src || !tgt) return null
                  const isRoadmapEdge = src.kind === 'roadmap' || tgt.kind === 'roadmap'
                  const isDateLink = e.edge_type === 'date_link'
                  
                  return (
                    <path
                      key={`e-${i}`}
                      d={`M ${src.x} ${src.y} C ${(src.x + tgt.x)/2} ${src.y}, ${(src.x + tgt.x)/2} ${tgt.y}, ${tgt.x} ${tgt.y}`}
                      fill="none"
                      stroke={isRoadmapEdge ? "url(#roadmapEdge)" : isDateLink ? (dark ? 'rgba(16,185,129,0.4)' : 'rgba(5,150,105,0.4)') : (dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)')}
                      strokeWidth={isRoadmapEdge ? "2.5" : isDateLink ? "2" : "1.5"}
                      strokeDasharray={e.edge_type === 'folder' || isDateLink ? '4 3' : undefined}
                    />
                  )
                })}

                {/* Nodes */}
                {nodes.map(n => {
                  const isSelected = selected?.node_id === n.node_id
                  const color = nodeColor(n.kind)
                  return (
                    <g
                      key={n.node_id}
                      transform={`translate(${n.x}, ${n.y})`}
                      className={cn("cursor-pointer", {
                          'roadmap-node-glow': n.kind === 'roadmap'
                      })}
                      onClick={() => setSelected(n)}
                      onDoubleClick={() => openNode(n)}
                      onPointerDown={(e) => {
                          e.stopPropagation()
                          const startX = e.clientX; const startY = e.clientY
                          const initX = n.x; const initY = n.y
                          const onMove = (me: PointerEvent) => {
                             const dx = (me.clientX - startX) / scale
                             const dy = (me.clientY - startY) / scale
                             n.x = initX + dx; n.y = initY + dy;
                             n.vx = 0; n.vy = 0; // stop physics momentarily
                             setNodes([...nodesRef.current]) // trigger adapt
                          }
                          const onUp = () => {
                             window.removeEventListener('pointermove', onMove)
                             window.removeEventListener('pointerup', onUp)
                          }
                          window.addEventListener('pointermove', onMove)
                          window.addEventListener('pointerup', onUp)
                      }}
                    >
                      {/* Glow ring for selected */}
                      {isSelected && (
                        <circle r={n.r + 8} fill="none" stroke={color} strokeWidth="2" opacity="0.4" />
                      )}
                      
                      {/* Special rendering for Roadmap nodes */}
                      {n.kind === 'roadmap' ? (
                          <g filter="url(#nodeGlow)">
                             <circle r={isSelected ? n.r + 3 : n.r} fill="rgba(236,72,153,0.1)" stroke="url(#roadmapEdge)" strokeWidth="3" />
                             <circle r={n.r - 8} fill={color} />
                             <circle r="4" fill="#ffffff" />
                          </g>
                      ) : n.kind === 'schedule' ? (
                          <g filter="url(#timelineGlow)">
                             <rect x={-(isSelected ? n.r + 6 : n.r + 2)} y={-14} width={(isSelected ? n.r + 6 : n.r + 2)*2} height="28" rx="6" fill="rgba(16,185,129,0.18)" stroke={color} strokeWidth={isSelected ? 3 : 2} />
                             <rect x={-(n.r - 4)} y={-8} width={(n.r - 4)*2} height="16" rx="3" fill={color} opacity={0.25} />
                             <text textAnchor="middle" y="4" fontSize="9" fontWeight="700" fill="#ffffff" style={{pointerEvents:'none'}}>📅</text>
                          </g>
                      ) : (
                          <circle
                            r={isSelected ? n.r + 3 : n.r}
                            fill={color}
                            stroke={dark ? '#07080f' : '#f8fafc'}
                            strokeWidth="2"
                            style={{ transition: 'r 0.2s' }}
                          />
                      )}

                      {/* Always-visible label for selected or large nodes */}
                      {(isSelected || n.r >= 14) && (
                        <text
                          y={n.r + 14}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="600"
                          fill={dark ? '#ffffff' : '#1f2937'}
                          style={{ pointerEvents: 'none' }}
                          className="drop-shadow-sm"
                        >
                          {n.title.length > 20 ? n.title.slice(0, 18) + '…' : n.title}
                        </text>
                      )}
                      {/* Hover label for small nodes */}
                      {!isSelected && n.r < 14 && (
                        <text
                          y={n.r + 14}
                          textAnchor="middle"
                          fontSize="10"
                          fontWeight="500"
                          fill={dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.6)'}
                          style={{ pointerEvents: 'none', opacity: 0 }}
                          className="hover:opacity-100 transition-opacity"
                        >
                          {n.title}
                        </text>
                      )}
                    </g>
                  )
                })}
              </g>
            </svg>

            {/* Legend */}
            <div className={cn('absolute bottom-4 left-4 rounded-2xl border px-4 py-3 flex flex-col gap-1.5 text-xs backdrop-blur-sm', dark ? 'bg-black/40 border-white/10 text-white/60' : 'bg-white/80 border-gray-200 text-gray-500')}>
              {[
                { color: '#3b82f6', label: 'Заметка' },
                { color: '#6366f1', label: 'Задача' },
                { color: '#10b981', label: 'Расписание' },
                { color: '#f59e0b', label: 'Папка' },
                { color: '#ec4899', label: 'Дорожная карта' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                  {l.label}
                </div>
              ))}
              <div className={cn('mt-1 pt-1 text-[10px] border-t', dark ? 'border-white/8 text-white/30' : 'border-gray-100 text-gray-400')}>
                Колёсико — зум · Кнопка 3 — перемещение
              </div>
            </div>
          </div>

          {/* Right panel — node properties */}
          <div className={cn('w-80 shrink-0 border-l flex flex-col overflow-hidden', dark ? 'border-white/8 bg-[#0b0c14]' : 'border-gray-200 bg-white')}>
            <div className={cn('px-5 py-4 border-b text-[10px] uppercase tracking-[0.2em] font-semibold shrink-0', dark ? 'border-white/6 text-white/35' : 'border-gray-100 text-gray-400')}>
              Свойства узла
            </div>

            {selected ? (
              <div className="flex-1 overflow-y-auto p-5">
                {/* Clickable title → opens the item */}
                <button
                  onClick={() => openNode(selected)}
                  className={cn('text-left w-full text-2xl font-bold mb-3 hover:underline underline-offset-2 transition-colors', dark ? 'text-white hover:text-primary' : 'text-gray-900 hover:text-primary')}
                  title="Открыть"
                >
                  {selected.title}
                </button>

                <div className="flex flex-wrap gap-2 mb-5">
                  <span className={cn('px-2.5 py-0.5 rounded-full text-xs font-semibold', {
                    'note': 'bg-blue-500/15 text-blue-400',
                    'task': 'bg-indigo-500/15 text-indigo-400',
                    'schedule': 'bg-emerald-500/15 text-emerald-400',
                    'folder': 'bg-amber-500/15 text-amber-400',
                    'roadmap': 'bg-pink-500/15 text-pink-400',
                  }[selected.kind] || 'bg-white/10 text-white/60')}>
                    { { note: 'Заметка', task: 'Задача', schedule: 'Расписание', folder: 'Папка', roadmap: 'Roadmap' }[selected.kind] || selected.kind }
                  </span>
                  {selected.topic && (
                    <span className={cn('px-2.5 py-0.5 rounded-full text-xs', dark ? 'bg-white/8 text-white/60' : 'bg-gray-100 text-gray-600')}>
                      {selected.topic}
                    </span>
                  )}
                </div>

                {selected.content && (
                  <div className={cn('text-sm leading-relaxed whitespace-pre-wrap', dark ? 'text-white/65' : 'text-gray-600')}>
                    {selected.content.slice(0, 500)}{selected.content.length > 500 ? '…' : ''}
                  </div>
                )}

                {/* Connections */}
                {(() => {
                  const connected = edges
                    .filter(e => e.from_node_id === selected.node_id || e.to_node_id === selected.node_id)
                    .map(e => {
                      const otherId = e.from_node_id === selected.node_id ? e.to_node_id : e.from_node_id
                      return nodes.find(n => n.node_id === otherId)
                    })
                    .filter(Boolean) as SimNode[]

                  if (connected.length === 0) return null
                  return (
                    <div className="mt-5">
                      <div className={cn('text-[10px] uppercase tracking-wider font-semibold mb-2', dark ? 'text-white/35' : 'text-gray-400')}>
                        Связи ({connected.length})
                      </div>
                      <div className="space-y-1">
                        {connected.map(c => (
                          <button
                            key={c.node_id}
                            onClick={() => setSelected(c)}
                            className={cn('w-full text-left px-3 py-2 rounded-xl text-sm transition-colors', dark ? 'hover:bg-white/6 text-white/70 hover:text-white' : 'hover:bg-gray-50 text-gray-600 hover:text-gray-900')}
                          >
                            <span className="mr-2 text-[10px]">●</span>
                            {c.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })()}

                <button
                  onClick={() => openNode(selected)}
                  className="mt-6 w-full rounded-2xl bg-primary/90 text-white text-sm font-semibold py-2.5 hover:bg-primary transition-colors"
                >
                  Открыть →
                </button>
              </div>
            ) : (
              <div className={cn('flex-1 flex flex-col items-center justify-center gap-3 text-center p-6', dark ? 'text-white/20' : 'text-gray-300')}>
                <Network className="h-12 w-12" />
                <div className="text-sm">
                  Нажмите на узел<br />чтобы увидеть детали
                </div>
                <div className="text-[11px]">Двойной клик — открыть</div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  )
}

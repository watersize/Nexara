'use client'

import { useEffect, useState, useRef } from 'react'
import { AppShell } from '@/components/app-shell'
import { NexaraHeader } from '@/components/nexara-header'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { useTheme } from 'next-themes'

type Node = {
  node_id: string
  kind: string
  title: string
  slug: string
  topic: string
  content: string
}

type Edge = {
  from_node_id: string
  to_node_id: string
  edge_type: string
}

type SimNode = Node & {
  x: number
  y: number
  vx: number
  vy: number
}

export default function GraphPage() {
  const { resolvedTheme } = useTheme()
  const dark = resolvedTheme === 'dark' || !resolvedTheme
  
  const [nodes, setNodes] = useState<SimNode[]>([])
  const [edges, setEdges] = useState<Edge[]>([])
  const [hovered, setHovered] = useState<SimNode | null>(null)
  
  const width = 1000
  const height = 800
  
  const nodesRef = useRef<SimNode[]>([])
  const edgesRef = useRef<Edge[]>([])
  const requestRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    async function load() {
      try {
        const res = await tauriInvoke<{ nodes: Node[], edges: Edge[] }>('get_all_graph')
        if (res && res.nodes) {
          const simNodes = res.nodes.map(n => ({
            ...n,
            x: Math.random() * width,
            y: Math.random() * height,
            vx: 0,
            vy: 0,
          }))
          nodesRef.current = simNodes
          edgesRef.current = res.edges || []
          setNodes([...simNodes])
          setEdges(res.edges || [])
        }
      } catch (e) {
        console.error(e)
      }
    }
    void load()
  }, [])

  // Simple force-directed layout simulation
  useEffect(() => {
    let iterations = 0
    const alpha = 0.5
    
    const simulate = () => {
      const ns = nodesRef.current
      const es = edgesRef.current
      if (ns.length === 0) return
      
      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const dx = ns[j].x - ns[i].x
          const dy = ns[j].y - ns[i].y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          if (dist < 300) {
            const force = 300 / (dist * dist)
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            ns[i].vx -= fx
            ns[i].vy -= fy
            ns[j].vx += fx
            ns[j].vy += fy
          }
        }
      }
      
      // Attraction
      for (const e of es) {
        const source = ns.find(n => n.node_id === e.from_node_id)
        const target = ns.find(n => n.node_id === e.to_node_id)
        if (source && target) {
          const dx = target.x - source.x
          const dy = target.y - source.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (dist - 100) * 0.05 // target distance 100
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          source.vx += fx
          source.vy += fy
          target.vx -= fx
          target.vy -= fy
        }
      }
      
      // Center gravity
      for (const n of ns) {
        n.vx += (width / 2 - n.x) * 0.005
        n.vy += (height / 2 - n.y) * 0.005
      }
      
      // Apply velocity
      let moving = false
      for (const n of ns) {
        n.vx *= 0.6 // friction
        n.vy *= 0.6
        n.x += n.vx * alpha
        n.y += n.vy * alpha
        if (Math.abs(n.vx) > 0.1 || Math.abs(n.vy) > 0.1) moving = true
      }
      
      setNodes([...ns])
      
      iterations++
      if (moving && iterations < 300) {
        requestRef.current = requestAnimationFrame(simulate)
      }
    }
    
    if (nodes.length > 0 && iterations === 0) {
      requestRef.current = requestAnimationFrame(simulate)
    }
    
    return () => cancelAnimationFrame(requestRef.current!)
  }, [nodes.length])

  return (
    <AppShell>
      <NexaraHeader title="Граф связей" showBackButton />
      <div className={cn('flex flex-1 pt-16', dark ? 'bg-[#0b0c10]' : 'bg-gray-50')}>
        <div className="flex-1 relative overflow-hidden flex items-center justify-center">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full max-w-[80vw] max-h-[80vh]">
            {edges.map((e, i) => {
              const source = nodes.find(n => n.node_id === e.from_node_id)
              const target = nodes.find(n => n.node_id === e.to_node_id)
              if (!source || !target) return null
              return (
                <line
                  key={`${e.from_node_id}-${e.to_node_id}-${i}`}
                  x1={source.x} y1={source.y}
                  x2={target.x} y2={target.y}
                  stroke={dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)'}
                  strokeWidth="2"
                />
              )
            })}
            
            {nodes.map(n => {
              const isHovered = hovered?.node_id === n.node_id
              const isNote = n.kind === 'note'
              const color = isNote ? (dark ? '#3b82f6' : '#2563eb') : (dark ? '#10b981' : '#059669')
              
              return (
                <g 
                  key={n.node_id} 
                  transform={`translate(${n.x}, ${n.y})`}
                  onMouseEnter={() => setHovered(n)}
                  className="cursor-pointer transition-transform hover:scale-125"
                >
                  <circle 
                    r={isHovered ? 12 : 8} 
                    fill={color} 
                    className={cn('transition-all duration-300', isHovered && 'shadow-lg')}
                    stroke={dark ? '#0b0c10' : '#f9fafb'}
                    strokeWidth="2"
                  />
                  <text 
                    y="24" 
                    textAnchor="middle" 
                    className={cn('text-[10px] font-semibold pointer-events-none transition-opacity', isHovered ? 'opacity-100' : 'opacity-0')}
                    fill={dark ? '#ffffff' : '#000000'}
                  >
                    {n.title}
                  </text>
                </g>
              )
            })}
          </svg>
        </div>
        
        {/* Detail Panel */}
        <div className={cn('w-80 border-l p-6 flex flex-col', dark ? 'border-white/10 bg-[#12131a]' : 'border-gray-200 bg-white')}>
          <div className={cn('text-[11px] uppercase tracking-widest mb-1 font-bold', dark ? 'text-white/40' : 'text-gray-400')}>
            Свойства узла
          </div>
          {hovered ? (
            <div className="flex-1 overflow-y-auto pr-2">
              <h2 className={cn('text-2xl font-bold mb-2', dark ? 'text-white' : 'text-black')}>{hovered.title}</h2>
              <div className="flex gap-2 mb-6">
                <span className={cn('px-2 py-0.5 rounded text-xs', hovered.kind === 'note' ? 'bg-blue-500/20 text-blue-500' : 'bg-emerald-500/20 text-emerald-500')}>
                  {hovered.kind === 'note' ? 'Заметка' : 'Задача'}
                </span>
                {hovered.topic && <span className={cn('px-2 py-0.5 rounded text-xs', dark ? 'bg-white/10 text-white/70' : 'bg-gray-100 text-gray-700')}>{hovered.topic}</span>}
              </div>
              <div className={cn('text-sm leading-relaxed prose prose-sm prose-invert', dark ? 'text-white/70' : 'text-gray-700 text-black')}>
                {hovered.content ? (
                  hovered.content
                ) : (
                  <span className="italic opacity-50">Нет содержимого</span>
                )}
              </div>
            </div>
          ) : (
            <div className={cn('flex-1 flex flex-col items-center justify-center text-center text-sm italic', dark ? 'text-white/30' : 'text-gray-400')}>
              <div className="w-16 h-16 rounded-2xl mb-4 flex items-center justify-center opacity-50 bg-black/5 dark:bg-white/5">
                <div className="w-8 h-8 rounded-full border-4 border-dashed border-current animate-spin-slow" />
              </div>
              Наведите курсор на узел<br/>чтобы просмотреть связи
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}

'use client'

import React, { useEffect, useState, useRef, useMemo } from 'react'
import { AppShell } from '@/components/app-shell'
import { useAppState } from '@/lib/tauri-provider'
import { tauriInvoke } from '@/lib/tauri-bridge'
import { cn } from '@/lib/utils'
import { format, addDays } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Network, Plus, Play, MousePointer2, PenTool, Circle, Square, Type, Palette, Move, ChevronLeft, ChevronRight, X, Trash2 } from 'lucide-react'
import { getLassoBox, getSnapGuides, HybridObjectWrapper, resolveLassoSelection } from '@/components/notebook/hybrid-object-wrapper'
import type { HybridObject, HybridPoint, LassoSelection } from '@/components/notebook/types'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useRouter } from 'next/navigation'
import './roadmap.css'

const makeId = (p: string) => `${p}-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`

interface RoadmapNode {
  id: string
  title: string
  status: 'DONE' | 'IN WORK' | 'PLANNED' | 'DESIGN' | string
  tags: string[]
  desc: string
  assignees: string[]
  extraAssignee?: string
  x: number
  y: number
  w: number
  h?: number
  isFile: boolean
  mdContent: string
  highlighted?: boolean
  color?: string
  bgStyle?: string
  objects?: HybridObject[]
}

interface RoadmapProject {
  id: string
  name: string
  desc: string
  nodes: RoadmapNode[]
  edges: { id: string; from: string; to: string }[]
}

// Markdown parser recognizing [[Links]]
const parseDescription = (text: string, router: any) => {
  if (!text) return null
  const parts = text.split(/(\[\[.*?\]\])/g)
  return parts.map((part, i) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const linkText = part.slice(2, -2)
      return (
        <span 
          key={i} 
          onClick={(e) => {
            e.stopPropagation();
            if (linkText.match(/^\d{2}\.\d{2}\.\d{4}$/)) {
               router.push('/schedule') // basic example 
            } else {
               router.push(`/graph`)
            }
          }} 
          className="text-[#00d2ff] cursor-pointer hover:underline bg-[#00d2ff]/10 px-1 rounded mx-0.5"
        >
          {linkText}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

export default function RoadmapPage() {
  const appState = useAppState()
  const router = useRouter()
  const user = appState?.authSession ? { displayName: appState.authSession.display_name, email: appState.authSession.email } : undefined
  
  // Workspace Toggle
  const [isWorkspaceOpen, setIsWorkspaceOpen] = useState(false)
  
  // Roadmaps State
  const [roadmaps, setRoadmaps] = useState<RoadmapProject[]>([{
    id: 'r1',
    name: 'JEES: Next-Gen Task Planner',
    desc: 'Разработка нового поколения планировщика задач с интеграцией AI, графа знаний и бесконечной доски для управления проектами.',
    nodes: [
      { id: '1', title: 'Определить видение продукта', status: 'DONE', tags: ['planning', 'product'], desc: 'Clarify core goals. Check [[Project Graph]].', assignees: ['anna'], x: 100, y: 250, w: 300, isFile: false, mdContent: '', objects: [] },
      { id: '2', title: 'Исследование рынка', status: 'IN WORK', tags: ['research', 'analytics'], desc: '', assignees: ['jack', 'alex'], extraAssignee: 'alex', x: 700, y: 350, w: 400, isFile: true, mdContent: '## Анализ конкурентов...\n- Изучение доли аудитории', highlighted: true, objects: [] },
      { id: '3', title: 'Протестировать MVP', status: 'PLANNED', tags: ['app', 'testing'], desc: 'Run functional tests. Deadline [[11.03.2026]]', assignees: ['jack'], x: 200, y: 550, w: 300, isFile: false, mdContent: '', objects: [] },
    ],
    edges: [
      { id: 'e1', from: '1', to: '2' },
      { id: 'e2', from: '1', to: '3' },
    ]
  }])
  const [currentRoadmapIndex, setCurrentRoadmapIndex] = useState(0)
  const currentRoadmap = roadmaps[currentRoadmapIndex] || roadmaps[0]

  // Update current roadmap data
  const setCurrentRoadmapData = (updater: (p: RoadmapProject) => RoadmapProject) => {
     setRoadmaps(prev => prev.map((r, i) => i === currentRoadmapIndex ? updater(r) : r))
  }
  const setNodes = (nodesOrFn: RoadmapNode[] | ((n: RoadmapNode[]) => RoadmapNode[])) => {
     setCurrentRoadmapData(r => ({
        ...r, 
        nodes: typeof nodesOrFn === 'function' ? nodesOrFn(r.nodes) : nodesOrFn
     }))
  }

  const handleDeleteRoadmap = async () => {
     if (roadmaps.length <= 1) {
        alert("Нельзя удалить единственную дорожную карту.")
        return
     }
     if (confirm("Вы уверены, что хотите удалить эту дорожную карту? Это действие нельзя отменить.")) {
         const newRoadmaps = roadmaps.filter((_, i) => i !== currentRoadmapIndex)
         setRoadmaps(newRoadmaps)
         setCurrentRoadmapIndex(Math.max(0, currentRoadmapIndex - 1))
         setIsWorkspaceOpen(false)
         try {
           await tauriInvoke('save_roadmaps', { roadmaps: newRoadmaps })
         } catch (e) {
           console.error("Failed to delete roadmap:", e)
         }
     }
  }

  // Create Roadmap Modal
  const [showCreateRoadmap, setShowCreateRoadmap] = useState(false)
  const [newRmTitle, setNewRmTitle] = useState('')
  const [newRmDesc, setNewRmDesc] = useState('')

  const handleCreateRoadmap = async () => {
    if (!newRmTitle.trim()) return
    const newRm: RoadmapProject = {
      id: makeId('rm'),
      name: newRmTitle,
      desc: newRmDesc,
      nodes: [],
      edges: []
    }
    const newRoadmaps = [...roadmaps, newRm]
    setRoadmaps(newRoadmaps)
    setCurrentRoadmapIndex(newRoadmaps.length - 1)
    setShowCreateRoadmap(false)
    setNewRmTitle('')
    setNewRmDesc('')

    try {
      await tauriInvoke('save_roadmaps', { roadmaps: newRoadmaps })
    } catch (e) {
      console.error("Failed to save roadmap:", e)
    }
  }

  // Canvas Panning & Zoom state
  const canvasRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.85)
  const [pan, setPan] = useState({ x: -250, y: -100 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

  // Editor State
  const [editingNode, setEditingNode] = useState<RoadmapNode | null>(null)
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [activeTab, setActiveTab] = useState<'info' | 'canvas' | 'style'>('info')
  const [canvasTool, setCanvasTool] = useState<'select' | 'stroke'>('select')
  const [canvasColor, setCanvasColor] = useState('#00d2ff')
  const [canvasStrokeWidth, setCanvasStrokeWidth] = useState(4)
  const [tempStroke, setTempStroke] = useState<HybridPoint[]>([])
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null) // For resize handles
  
  const [allGraphNodes, setAllGraphNodes] = useState<{title: string, id: string}[]>([])

  // Load backend nodes for autocompletion and load saved roadmaps
  useEffect(() => {
     tauriInvoke<{nodes: {title: string, node_id: string}[]}>('get_all_graph')
       .then(res => setAllGraphNodes((res.nodes || []).map(n => ({ title: n.title, id: n.node_id }))))
       .catch(err => console.error("Could not load graph for autocomplete:", err))

     tauriInvoke<RoadmapProject[]>('get_roadmaps')
       .then(res => {
         if (res && res.length > 0) {
           setRoadmaps(res)
         }
       })
       .catch(err => console.error("Could not load roadmaps:", err))
  }, [])

  const handleEditorChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (!editingNode) return
    const val = e.target.value
    setEditingNode({ ...editingNode, desc: val })
    const match = val.match(/\[\[([^\]]*)$/)
    if (match) {
        setShowMentions(true)
        setMentionQuery(match[1].toLowerCase())
    } else {
        setShowMentions(false)
    }
  }

  const handleMentionSelect = (linkName: string) => {
    if (!editingNode) return
    const val = editingNode.desc.replace(/\[\[([^\]]*)$/, `[[${linkName}]] `)
    setEditingNode({ ...editingNode, desc: val })
    setShowMentions(false)
  }

  const handleSaveNode = async () => {
    if (!editingNode) return
    let newRoadmaps = [...roadmaps]
    const updatedNodes = currentRoadmap.nodes.some(n => n.id === editingNode.id)
      ? currentRoadmap.nodes.map(n => n.id === editingNode.id ? editingNode : n)
      : [...currentRoadmap.nodes, editingNode];

    newRoadmaps[currentRoadmapIndex] = { ...currentRoadmap, nodes: updatedNodes };
    setRoadmaps(newRoadmaps);
    
    setEditingNode(null)

    try {
      await tauriInvoke('save_roadmaps', { roadmaps: newRoadmaps })
    } catch (e) {
      console.error("Failed to save changes:", e)
    }
  }

  const toggleNodeStatus = (nodeId: string, currentStatus: string) => {
     const nextStatus = currentStatus === 'PLANNED' ? 'IN WORK' : currentStatus === 'IN WORK' ? 'DONE' : 'PLANNED'
     setCurrentRoadmapData(r => ({ ...r, nodes: r.nodes.map(n => n.id === nodeId ? { ...n, status: nextStatus } : n) }))
     
     // Trigger save on status toggle
     setTimeout(() => {
        setRoadmaps(current => {
           tauriInvoke('save_roadmaps', { roadmaps: current }).catch(e => console.error("Toggle save failed", e))
           return current
        })
     }, 100)
  }

  // Canvas Event Handlers
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [nodeDragStart, setNodeDragStart] = useState({ x: 0, y: 0, nodeX: 0, nodeY: 0 })
  const [resizingNodeId, setResizingNodeId] = useState<string | null>(null)
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, w: 0, h: 0, dir: '' })
  
  // Connection state
  const [connectingFrom, setConnectingFrom] = useState<{ id: string, x: number, y: number, port: 'left' | 'right' } | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
       e.preventDefault()
       const factor = e.deltaY < 0 ? 1.05 : 0.95
       setScale(s => Math.min(2.5, Math.max(0.2, s * factor)))
    } else {
       // Optional pan with scroll
       setPan(p => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }))
    }
  }

  const handleNodeMouseDown = (e: React.MouseEvent, node: RoadmapNode) => {
    e.stopPropagation()
    setActiveNodeId(node.id)
    setDraggingNodeId(node.id)
    setNodeDragStart({
      x: e.clientX,
      y: e.clientY,
      nodeX: node.x,
      nodeY: node.y
    })
  }

  const handleResizeStart = (e: React.MouseEvent, node: RoadmapNode, dir: string) => {
     e.stopPropagation()
     setResizingNodeId(node.id)
     setResizeStart({ x: e.clientX, y: e.clientY, w: node.w, h: node.h || 200, dir })
  }

  const handlePortMouseDown = (e: React.MouseEvent, node: RoadmapNode, port: 'left' | 'right') => {
     e.stopPropagation()
     const rect = (e.target as HTMLElement).getBoundingClientRect()
     setConnectingFrom({
        id: node.id,
        x: (rect.left + rect.width / 2 - pan.x) / scale,
        y: (rect.top + rect.height / 2 - pan.y) / scale,
        port
     })
  }
  
  const handlePortMouseUp = (e: React.MouseEvent, node: RoadmapNode) => {
     e.stopPropagation()
     if (connectingFrom && connectingFrom.id !== node.id) {
         // Create connection
         setCurrentRoadmapData(r => {
             // Avoid duplicate edges
             if (r.edges.some(edge => edge.from === connectingFrom.id && edge.to === node.id)) {
                 return r
             }
             return {
                 ...r,
                 edges: [...r.edges, { id: makeId('edge'), from: connectingFrom.id, to: node.id }]
             }
         })
         setConnectingFrom(null)

         setTimeout(() => {
            setRoadmaps(current => {
               tauriInvoke('save_roadmaps', { roadmaps: current }).catch(e => console.error("Edge save failed", e))
               return current
            })
         }, 100)
     }
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (connectingFrom) {
       const canvasRect = canvasRef.current?.getBoundingClientRect()
       if (canvasRect) {
         setMousePos({ 
            x: (e.clientX - canvasRect.left - pan.x) / scale, 
            y: (e.clientY - canvasRect.top - pan.y) / scale 
         })
       }
    } else if (draggingNodeId) {
      const dx = (e.clientX - nodeDragStart.x) / scale
      const dy = (e.clientY - nodeDragStart.y) / scale
      setNodes(nodes => nodes.map(n => n.id === draggingNodeId ? { ...n, x: nodeDragStart.nodeX + dx, y: nodeDragStart.nodeY + dy } : n))
    } else if (resizingNodeId) {
      const dx = (e.clientX - resizeStart.x) / scale
      const dy = (e.clientY - resizeStart.y) / scale
      setNodes(nodes => nodes.map(n => {
         if (n.id === resizingNodeId) {
            let nw = resizeStart.w
            let nh = resizeStart.h
            if (resizeStart.dir.includes('e')) nw += dx
            if (resizeStart.dir.includes('s')) nh += dy
            return { ...n, w: Math.max(200, nw), h: Math.max(100, nh) }
         }
         return n
      }))
    } else if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
    }
  }

  const handleMouseUp = async () => {
    const wasActive = !!(draggingNodeId || resizingNodeId || isDragging || connectingFrom)
    
    setIsDragging(false)
    setDraggingNodeId(null)
    setResizingNodeId(null)
    setConnectingFrom(null)

    if (wasActive) {
       try {
         await tauriInvoke('save_roadmaps', { roadmaps })
       } catch (err) {
         console.error("Failed to save roadmaps:", err)
       }
    }
  }

  // Right Panel Draggable Blocks State
  const [panelBlocks, setPanelBlocks] = useState([
     { id: 'global_graph', x: 0, y: 0 },
     { id: 'overview', x: 0, y: 200 },
     { id: 'tasks', x: 0, y: 340 }
  ])
  const [draggingPanel, setDraggingPanel] = useState<string | null>(null)
  const [panelDragStart, setPanelDragStart] = useState({ x: 0, y: 0, startX: 0, startY: 0 })

  const handlePanelMouseDown = (e: React.MouseEvent, blockId: string) => {
     setDraggingPanel(blockId)
     const block = panelBlocks.find(b => b.id === blockId)!
     setPanelDragStart({ x: e.clientX, y: e.clientY, startX: block.x, startY: block.y })
  }

  const handlePanelMouseMove = (e: React.MouseEvent) => {
     if (!draggingPanel) return
     const dx = e.clientX - panelDragStart.x
     const dy = e.clientY - panelDragStart.y
     setPanelBlocks(pb => pb.map(b => b.id === draggingPanel ? { ...b, x: panelDragStart.startX + dx, y: panelDragStart.startY + dy } : b))
  }

  const handlePanelMouseUp = () => setDraggingPanel(null)

  // Calendar
  const today = new Date()
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(today, i - 2)
    return {
      date: d,
      dayName: format(d, 'EEEEEE', { locale: ru }),
      dayNum: format(d, 'dd'),
      isActive: format(d, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')
    }
  })

  // Create task helper
  const handleAddTask = () => {
     setEditingNode({
        id: makeId('node'), title: 'Новая задача', status: 'PLANNED', tags: [], desc: '', assignees: [], x: (-pan.x + 400) / scale, y: (-pan.y + 300) / scale, w: 300, isFile: false, mdContent: '', objects: []
     })
  }

  return (
    <AppShell displayName={user?.displayName} email={user?.email}>
      <div 
         className="roadmap-container bg-[#080a10]"
         onMouseMove={(e) => {
            if (draggingPanel) handlePanelMouseMove(e)
            else handleMouseMove(e)
         }}
         onMouseUp={() => {
            handleMouseUp(); handlePanelMouseUp()
         }}
         onMouseLeave={() => {
            handleMouseUp(); handlePanelMouseUp()
         }}
      >
        
        {/* Header */}
        <header className="absolute top-0 left-0 right-0 h-20 flex items-center justify-between px-8 border-b border-white/5 glass-panel z-50 transition-all">
          <div className="flex items-center gap-8">
            {isWorkspaceOpen ? (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsWorkspaceOpen(false)}
                  className="text-white/50 hover:text-white transition-colors flex items-center gap-2 text-sm font-medium"
                >
                  ← Назад
                </button>
                <div className="h-6 w-px bg-white/10" />
                <h1 className="text-[18px] font-semibold tracking-wide">{currentRoadmap.name}</h1>
              </div>
            ) : (
              <h1 className="text-[18px] font-semibold tracking-wide">Дорожные карты (Проекты)</h1>
            )}

            {isWorkspaceOpen && currentRoadmap && (
              <div className="flex items-center gap-6">
                <div className="flex flex-col">
                  <span className="text-[11px] text-[#94a3b8] uppercase tracking-wider">Задач</span>
                  <span className="text-[15px] font-semibold neon-text-blue">{currentRoadmap.nodes.length}</span>
                </div>
                <div className="h-6 w-px bg-white/10" />
                <button 
                  onClick={handleDeleteRoadmap}
                  className="text-red-400 hover:text-red-300 transition-colors flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg hover:bg-red-500/10"
                >
                  <Trash2 className="w-4 h-4" /> Удалить Roadmap
                </button>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-6">
            {isWorkspaceOpen ? (
              <>
                <div className="weekly-calendar flex gap-3">
                  {weekDays.map((d, i) => (
                    <div key={i} className={`day ${d.isActive ? 'active' : ''}`}>
                      {d.dayName}<span>{d.dayNum}</span>
                    </div>
                  ))}
                </div>
                <button className="roadmap-btn primary flex items-center gap-2" onClick={handleAddTask}>
                  <Plus className="w-4 h-4" /> Добавить задачу
                </button>
              </>
            ) : (
              <button className="roadmap-btn primary flex items-center gap-2" onClick={() => setShowCreateRoadmap(true)}>
                <Plus className="w-4 h-4" /> Создать Roadmap
              </button>
            )}
          </div>
        </header>

        {/* View: Roadmap Preview Map */}
        {!isWorkspaceOpen && (
          <div className="absolute top-20 left-0 right-0 bottom-0 overflow-y-auto overflow-x-hidden flex flex-col items-center pt-16 pb-32">
            
            <div className="flex items-center gap-8 mb-4">
               <button 
                  onClick={() => setCurrentRoadmapIndex(i => i > 0 ? i - 1 : roadmaps.length - 1)}
                  className="p-3 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors border border-white/10"
               >
                  <ChevronLeft className="w-6 h-6" />
               </button>

               {/* Interactive Preview Map linked to Current Roadmap */}
               <div 
                 className="relative w-[900px] h-[500px] rounded-3xl overflow-hidden cursor-pointer group shadow-[0_0_50px_rgba(0,0,0,0.5)] border border-white/10 bg-[#0e111a] transition-transform duration-500 hover:scale-[1.02]"
                 onClick={() => setIsWorkspaceOpen(true)}
               >
                 <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, white 1px, transparent 1px)', backgroundSize: '50px 50px' }} />
                 <div className="absolute top-6 left-6 flex items-center gap-3">
                   <div className="w-8 h-8 rounded bg-[#facc15] flex items-center justify-center font-bold text-black border-2 border-white/20">{currentRoadmap.name.slice(0, 4)}</div>
                   <span className="text-white/50 text-xs font-bold uppercase tracking-[0.2em]">Preview Map</span>
                 </div>
                 
                 {/* Dynamic Mini-renderer for Roadmap Nodes */}
                 <svg className="absolute inset-0 w-full h-full" viewBox="0 0 900 500">
                    <defs>
                      <filter id="glow"><feGaussianBlur stdDeviation="3" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
                    </defs>
                    {/* Render actual edge connections */}
                     {(currentRoadmap.edges || []).map((edge, i) => {
                        const fromNode = currentRoadmap.nodes.find(n => n.id === edge.from)
                        const toNode = currentRoadmap.nodes.find(n => n.id === edge.to)
                        if (!fromNode || !toNode) return null
                        const sx = fromNode.x * 0.4 + 200, sy = fromNode.y * 0.4 + 100
                        const ex = toNode.x * 0.4 + 200, ey = toNode.y * 0.4 + 100
                        const cpx = (sx + ex) / 2, cpy = Math.min(sy, ey) - 30
                        return <path key={i} d={`M ${sx} ${sy} Q ${cpx} ${cpy} ${ex} ${ey}`} fill="none" stroke="rgba(0,210,255,0.4)" strokeWidth="2" strokeDasharray="5,5" />
                     })}
                    {currentRoadmap.nodes.map(n => (
                       <g key={n.id} transform={`translate(${n.x * 0.4 + 200}, ${n.y * 0.4 + 100})`}>
                          <circle r="12" fill={n.status === 'DONE' ? 'rgba(16,185,129,0.2)' : 'rgba(0,210,255,0.2)'} stroke={n.status === 'DONE' ? '#10b981' : '#00d2ff'} strokeWidth="2" filter="url(#glow)" />
                          <circle r="3" fill="#fff" />
                          <text x="18" y="4" fill="#fff" fontSize="10">{n.title}</text>
                       </g>
                    ))}
                 </svg>

                 <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                   <span className="px-6 py-3 rounded-full bg-white/10 backdrop-blur border border-white/20 text-white font-semibold flex items-center gap-2">
                     <Play className="w-4 h-4" /> Открыть рабочую область
                   </span>
                 </div>
               </div>

               <button 
                  onClick={() => setCurrentRoadmapIndex(i => i < roadmaps.length - 1 ? i + 1 : 0)}
                  className="p-3 rounded-full hover:bg-white/10 text-white/50 hover:text-white transition-colors border border-white/10"
               >
                  <ChevronRight className="w-6 h-6" />
               </button>
            </div>

            {/* Editable Info Form */}
            <div className="w-[900px] mt-10 px-8 flex flex-col gap-4">
              <input 
                type="text" 
                value={currentRoadmap.name}
                onChange={(e) => setCurrentRoadmapData(r => ({...r, name: e.target.value}))}
                className="bg-transparent border-none outline-none text-4xl font-bold text-white placeholder-white/20 px-0 focus:ring-0"
                placeholder="Название проекта..."
              />
              <textarea 
                value={currentRoadmap.desc}
                onChange={(e) => setCurrentRoadmapData(r => ({...r, desc: e.target.value}))}
                className="bg-transparent border-none outline-none text-[#94a3b8] text-lg resize-none min-h-[100px] px-0 focus:ring-0"
                placeholder="Описание проекта..."
              />
            </div>
          </div>
        )}

        {/* View: Roadmap Workspace (Canvas) */}
        {isWorkspaceOpen && (
          <div className="absolute top-20 left-0 right-0 bottom-0 overflow-hidden animate-in fade-in duration-500 bg-[#07090f]">
          
          {/* Infinite Canvas */}
          <div 
            ref={canvasRef}
            className="w-full h-full relative roadmap-canvas-bg"
            style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
            onWheel={handleWheel}
            onMouseDown={(e) => {
               if ((e.target as HTMLElement).closest('.node-card')) return;
               setActiveNodeId(null)
               setIsDragging(true)
               setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
            }}
          >
            <div 
              className="absolute top-0 left-0 w-[5000px] h-[5000px] origin-top-left"
              style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})` }}
            >
              {/* Edges SVG Layer */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                 <defs>
                   <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                     <polygon points="0 0, 10 3.5, 0 7" fill="#00d2ff" />
                   </marker>
                   <marker id="arrowhead-drawing" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
                     <polygon points="0 0, 10 3.5, 0 7" fill="rgba(255,126,95,0.7)" />
                   </marker>
                 </defs>
                 
                 {/* Render Persistent Edges */}
                 {currentRoadmap.edges?.map(edge => {
                    const fromNode = currentRoadmap.nodes.find(n => n.id === edge.from)
                    const toNode = currentRoadmap.nodes.find(n => n.id === edge.to)
                    if (!fromNode || !toNode) return null
                    
                    const startX = fromNode.x + fromNode.w
                    const startY = fromNode.y + (fromNode.h || 200) / 2
                    const endX = toNode.x
                    const endY = toNode.y + (toNode.h || 200) / 2
                    
                    // Bezier Curve
                    const cp1x = startX + Math.abs(endX - startX) / 2
                    const cp1y = startY
                    const cp2x = endX - Math.abs(endX - startX) / 2
                    const cp2y = endY

                    return (
                       <g key={edge.id} className="pointer-events-auto cursor-pointer group" onClick={() => setCurrentRoadmapData(r => ({ ...r, edges: r.edges.filter(e => e.id !== edge.id) }))}>
                          {/* invisible thick hover path */}
                          <path
                            d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                            fill="none" stroke="transparent" strokeWidth="20"
                          />
                          <path
                            d={`M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`}
                            fill="none" stroke="#00d2ff" strokeWidth="2" strokeDasharray="6,4"
                            markerEnd="url(#arrowhead)"
                            className="group-hover:stroke-[#ff7e5f] group-hover:stroke-[3px] transition-all"
                          />
                       </g>
                    )
                 })}
                 
                 {/* Render Connecting Line (Drawing) */}
                 {connectingFrom && (
                    <path
                       d={`M ${connectingFrom.x} ${connectingFrom.y} C ${connectingFrom.x + Math.abs(mousePos.x - connectingFrom.x)/2} ${connectingFrom.y}, ${mousePos.x - Math.abs(mousePos.x - connectingFrom.x)/2} ${mousePos.y}, ${mousePos.x} ${mousePos.y}`}
                       fill="none" stroke="rgba(255,126,95,0.7)" strokeWidth="3" markerEnd="url(#arrowhead-drawing)" strokeDasharray="8,4" className="animate-pulse"
                    />
                 )}
              </svg>

              {/* Nodes */}
              {currentRoadmap.nodes.map(n => (
                <div 
                  key={n.id} 
                  className={cn("node-card absolute", n.highlighted && 'highlighted')} 
                  style={{ left: n.x, top: n.y, width: n.w, height: n.h && n.h > 100 ? n.h : 'auto' }}
                  onMouseDown={(e) => handleNodeMouseDown(e, n)}
                  onDoubleClick={() => setEditingNode(n)}
                >
                  {/* Resizing Handles */}
                  {activeNodeId === n.id && (
                     <>
                        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-e-resize hover:bg-white/20" onMouseDown={e => handleResizeStart(e, n, 'e')} />
                        <div className="absolute left-0 right-0 bottom-0 h-2 cursor-s-resize hover:bg-white/20" onMouseDown={e => handleResizeStart(e, n, 's')} />
                        <div className="absolute right-0 bottom-0 w-3 h-3 cursor-se-resize bg-white/20 hover:bg-white/auto border border-white z-10" onMouseDown={e => handleResizeStart(e, n, 'se')} />
                     </>
                  )}

                  {/* Ports */}
                  <div 
                     className="absolute top-1/2 -left-2 w-4 h-4 rounded-full border-2 border-[#00d2ff] bg-[#090b14] -translate-y-1/2 cursor-crosshair hover:bg-[#00d2ff] hover:scale-125 transition-all z-20"
                     onMouseDown={e => handlePortMouseDown(e, n, 'left')}
                     onMouseUp={e => handlePortMouseUp(e, n)}
                  />
                  <div 
                     className="absolute top-1/2 -right-2 w-4 h-4 rounded-full border-2 border-[#ff7e5f] bg-[#090b14] -translate-y-1/2 cursor-crosshair hover:bg-[#ff7e5f] hover:scale-125 transition-all z-20"
                     onMouseDown={e => handlePortMouseDown(e, n, 'right')}
                     onMouseUp={e => handlePortMouseUp(e, n)}
                  />

                  <div className="flex justify-between items-center mb-3">
                      <span 
                         onClick={(e) => { e.stopPropagation(); toggleNodeStatus(n.id, n.status) }}
                         className={`status-badge cursor-pointer hover:brightness-125 transition-all ${n.status === 'DONE' ? 'status-done' : n.status === 'IN WORK' ? 'status-in-work' : n.status === 'PLANNED' ? 'status-planned' : 'bg-blue-500/20 text-blue-400'}`}
                      >
                        {n.status}
                      </span>
                      <div className="text-gray-400 font-bold cursor-pointer hover:text-white" onClick={() => setEditingNode(n)}>...</div>
                  </div>
                  <h3 className="text-[16px] mb-2 font-bold leading-snug text-white">{n.title}</h3>

                  {!n.isFile && (
                      <p className="text-[13px] text-[#94a3b8] leading-relaxed mb-4">{parseDescription(n.desc, router)}</p>
                  )}
                  {n.isFile && (
                     <p className="text-[13px] font-mono bg-black/40 p-2 rounded text-white/60 mb-4">{n.mdContent.slice(0, 50)}...</p>
                  )}
                </div>
              ))}
            </div>
          </div >

          {/* Right Panels (Draggable Blocks) */}
          <div className="absolute right-6 top-6 bottom-6 w-[300px] pointer-events-none z-10 transition-transform">
            {panelBlocks.map(block => (
               <div 
                  key={block.id}
                  className="absolute w-full"
                  style={{ transform: `translate(${block.x}px, ${block.y}px)` }}
               >
                  {/* Drag Handle */}
                  <div 
                     className="h-6 -mx-4 -mt-4 mb-2 cursor-move flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-white/5 pointer-events-auto rounded-t-xl"
                     onMouseDown={(e) => handlePanelMouseDown(e, block.id)}
                  >
                     <div className="w-8 h-1 bg-white/30 rounded-full" />
                  </div>

                  {block.id === 'global_graph' && (
                     <div className="glass-panel p-4 rounded-xl flex flex-col h-[180px] pointer-events-auto shadow-lg relative overflow-hidden group">
                        <div className="flex justify-between items-center mb-2 z-10">
                              <h3 className="text-[14px] font-semibold text-white">Мини-граф</h3>
                              <Network className="w-4 h-4 text-white/50" />
                        </div>
                        <div className="flex-1 bg-[#090b14] rounded-lg cursor-pointer border border-white/5 relative overflow-hidden" onClick={() => router.push('/graph')}>
                           <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, white 1px, transparent 1px)', backgroundSize: '20px 20px' }} />
                           <svg className="absolute inset-0 w-full h-full" viewBox="0 0 300 150">
                              <defs>
                                <filter id="miniGlow"><feGaussianBlur stdDeviation="2" result="blur" /><feComposite in="SourceGraphic" in2="blur" operator="over" /></filter>
                              </defs>
                              {(currentRoadmap.edges || []).map((edge, i) => {
                                  const fromNode = currentRoadmap.nodes.find(n => n.id === edge.from)
                                  const toNode = currentRoadmap.nodes.find(n => n.id === edge.to)
                                  if (!fromNode || !toNode) return null
                                  return <line key={i} x1={fromNode.x * 0.15 + 100} y1={fromNode.y * 0.15 + 50} x2={toNode.x * 0.15 + 100} y2={toNode.y * 0.15 + 50} stroke="rgba(0,210,255,0.3)" strokeWidth="1.5" strokeDasharray="3,3" />
                               })}
                              {currentRoadmap.nodes.map(n => (
                                 <g key={n.id} transform={`translate(${n.x * 0.15 + 100}, ${n.y * 0.15 + 50})`}>
                                    <circle r="6" fill={n.status === 'DONE' ? 'rgba(16,185,129,0.3)' : 'rgba(0,210,255,0.3)'} stroke={n.status === 'DONE' ? '#10b981' : '#00d2ff'} strokeWidth="1" filter="url(#miniGlow)" />
                                    <circle r="1.5" fill="#fff" />
                                 </g>
                              ))}
                           </svg>
                           <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-300">
                             <span className="text-white text-xs font-semibold flex items-center gap-1">
                               В глобальный граф <ChevronRight className="w-3 h-3" />
                             </span>
                           </div>
                        </div>
                     </div>
                  )}

                  {block.id === 'overview' && (
                     <div className="glass-panel p-4 rounded-xl pointer-events-auto shadow-lg mt-4">
                        <div className="flex justify-between items-center mb-4">
                              <h3 className="text-[14px] font-semibold text-white">Overview</h3>
                        </div>
                        <div className="flex items-center gap-3">
                              <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                 <div className="h-full w-[65%] progress-bar-fill rounded-full" />
                              </div>
                        </div>
                     </div>
                  )}

                  {block.id === 'tasks' && (
                     <div className="glass-panel p-4 rounded-xl pointer-events-auto shadow-lg mt-4 h-[250px] flex flex-col">
                        <h3 className="text-[14px] font-semibold text-white mb-4">Задачи</h3>
                        <div className="flex-1 overflow-y-auto">
                           {currentRoadmap.nodes.map(n => (
                              <div key={n.id} className="text-sm text-white/70 py-1.5 border-b border-white/5 cursor-pointer hover:text-white" onClick={() => setEditingNode(n)}>{n.title}</div>
                           ))}
                        </div>
                     </div>
                  )}
               </div>
            ))}
          </div>

          </div >
        )}

        {/* Task Editor Modal */}
        {editingNode && (
          <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
             <div className="w-[600px] border border-white/10 bg-[#0e111a] rounded-2xl shadow-2xl flex flex-col pointer-events-auto">
                <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
                    <div className="flex gap-2">
                       {['DONE', 'IN WORK', 'PLANNED'].map(s => (
                          <span 
                            key={s} 
                            onClick={() => setEditingNode({...editingNode, status: s})}
                            className={cn('px-3 py-1 rounded text-xs font-bold cursor-pointer border transition-colors', editingNode.status === s ? 'bg-blue-500/20 text-blue-400 border-blue-500/20' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10')}
                          >{s}</span>
                       ))}
                    </div>
                    <button onClick={() => setEditingNode(null)} className="text-white/50 hover:text-white text-xl leading-none">&times;</button>
                </div>
                
                <div className="flex border-b border-white/10 px-6 pt-2 gap-6">
                    <button onClick={() => setActiveTab('info')} className={cn('pb-3 text-sm font-semibold transition-colors border-b-2', activeTab === 'info' ? 'text-[#00d2ff] border-[#00d2ff]' : 'text-white/50 border-transparent')}>Информация</button>
                    <button onClick={() => setActiveTab('canvas')} className={cn('pb-3 text-sm font-semibold transition-colors border-b-2', activeTab === 'canvas' ? 'text-[#00d2ff] border-[#00d2ff]' : 'text-white/50 border-transparent')}>Холст</button>
                    <button onClick={() => setActiveTab('style')} className={cn('pb-3 text-sm font-semibold transition-colors border-b-2', activeTab === 'style' ? 'text-[#00d2ff] border-[#00d2ff]' : 'text-white/50 border-transparent')}>Стиль</button>
                </div>

                <div className="p-6 flex flex-col gap-4 min-h-[300px] max-h-[60vh] overflow-y-auto">
                  {activeTab === 'info' && (
                    <>
                      <input type="text" value={editingNode.title} onChange={e => setEditingNode({...editingNode, title: e.target.value})} className="bg-transparent border-none outline-none text-2xl font-bold text-white px-0" placeholder="Task Name" />
                      <div className="relative flex-1 flex flex-col">
                          {showMentions && (
                              <div className="absolute top-10 left-0 mt-1 w-[300px] bg-[#1a1c23] border border-white/10 rounded-lg shadow-xl z-20 max-h-[200px] overflow-y-auto">
                                  {allGraphNodes.filter(n => n.title.toLowerCase().includes(mentionQuery)).slice(0, 10).map(l => (
                                    <div key={l.id} onClick={() => handleMentionSelect(l.title)} className="px-4 py-2 hover:bg-[#00d2ff]/20 text-white/80 cursor-pointer text-sm truncate">{l.title}</div>
                                  ))}
                                  {allGraphNodes.filter(n => n.title.toLowerCase().includes(mentionQuery)).length === 0 && (
                                     <div className="px-4 py-2 text-white/50 text-sm italic">Ничего не найдено</div>
                                  )}
                              </div>
                          )}
                          <textarea value={editingNode.desc} onChange={handleEditorChange} placeholder="Описание... (use [[link]])" className="bg-transparent border border-white/5 rounded outline-none text-[#94a3b8] p-3 text-sm resize-none flex-1 min-h-[150px]" />
                      </div>
                    </>
                  )}
                  {activeTab === 'canvas' && (
                     <div className="flex flex-col gap-3">
                        <div className="flex items-center gap-2 mb-2">
                           <button onClick={() => setCanvasTool('select')} className={cn('p-2 rounded-lg border text-xs', canvasTool === 'select' ? 'bg-[#00d2ff]/20 border-[#00d2ff]/40 text-[#00d2ff]' : 'border-white/10 text-white/50 hover:text-white')}><MousePointer2 className="w-4 h-4" /></button>
                           <button onClick={() => setCanvasTool('stroke')} className={cn('p-2 rounded-lg border text-xs', canvasTool === 'stroke' ? 'bg-[#00d2ff]/20 border-[#00d2ff]/40 text-[#00d2ff]' : 'border-white/10 text-white/50 hover:text-white')}><PenTool className="w-4 h-4" /></button>
                           <div className="h-6 w-px bg-white/10" />
                           <input type="color" value={canvasColor} onChange={e => setCanvasColor(e.target.value)} className="w-8 h-8 bg-transparent border-none cursor-pointer" />
                           <select value={canvasStrokeWidth} onChange={e => setCanvasStrokeWidth(+e.target.value)} className="bg-black/50 border border-white/10 rounded-lg px-2 py-1 text-white/70 text-xs">
                              <option value={2}>Тонкая</option>
                              <option value={4}>Средняя</option>
                              <option value={8}>Толстая</option>
                           </select>
                        </div>
                        <svg
                           className="w-full h-[250px] bg-[#090b14] rounded-lg border border-white/5 cursor-crosshair"
                           viewBox="0 0 560 250"
                           onMouseDown={(e) => {
                              if (canvasTool !== 'stroke') return
                              const rect = e.currentTarget.getBoundingClientRect()
                              const x = ((e.clientX - rect.left) / rect.width) * 560
                              const y = ((e.clientY - rect.top) / rect.height) * 250
                              setTempStroke([{ x, y }])
                           }}
                           onMouseMove={(e) => {
                              if (tempStroke.length === 0) return
                              const rect = e.currentTarget.getBoundingClientRect()
                              const x = ((e.clientX - rect.left) / rect.width) * 560
                              const y = ((e.clientY - rect.top) / rect.height) * 250
                              setTempStroke(prev => [...prev, { x, y }])
                           }}
                           onMouseUp={() => {
                              if (tempStroke.length > 1) {
                                 const newObj: HybridObject = { id: makeId('stroke'), type: 'stroke', name: '', stroke: canvasColor, strokeWidth: canvasStrokeWidth, points: tempStroke, x: 0, y: 0, w: 0, h: 0, rot: 0, z: 0, locked: false, visible: true, opacity: 1 }
                                 setEditingNode(prev => prev ? { ...prev, objects: [...(prev.objects || []), newObj] } : prev)
                              }
                              setTempStroke([])
                           }}
                        >
                           {/* Render existing objects */}
                           {(editingNode.objects || []).filter(o => o.type === 'stroke').map(obj => (
                              <polyline key={obj.id} points={(obj.points || []).map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={obj.stroke || '#00d2ff'} strokeWidth={obj.strokeWidth || 4} strokeLinecap="round" strokeLinejoin="round" />
                           ))}
                           {/* Render temp stroke */}
                           {tempStroke.length > 1 && (
                              <polyline points={tempStroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke={canvasColor} strokeWidth={canvasStrokeWidth} strokeLinecap="round" strokeLinejoin="round" opacity={0.7} />
                           )}
                        </svg>
                        <p className="text-[11px] text-white/30">Нажмите и рисуйте. Все штрихи сохраняются с задачей.</p>
                     </div>
                  )}
                  {activeTab === 'style' && (
                     <div className="flex flex-col gap-6">
                        <button onClick={() => setEditingNode({...editingNode, highlighted: !editingNode.highlighted})} className="px-4 py-2 border border-white/10 rounded-xl text-white/50 hover:text-white text-sm">Подсветить карточку</button>
                     </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-white/10 flex justify-between items-center bg-black/20 rounded-b-2xl">
                   <button onClick={() => {
                      setNodes(ns => ns.filter(n => n.id !== editingNode.id))
                      setEditingNode(null)
                   }} className="text-red-400 hover:text-red-300 text-sm flex items-center gap-1"><Trash2 className="w-4 h-4" /> Удалить</button>
                   <button onClick={handleSaveNode} className="roadmap-btn primary">Сохранить</button>
                </div>
             </div>
          </div>
        )}

        {/* Create Roadmap Dialog */}
        {showCreateRoadmap && (
           <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className="w-[400px] bg-[#0e111a] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col gap-4">
                 <h2 className="text-xl font-bold text-white">Новый Roadmap</h2>
                 <input autoFocus value={newRmTitle} onChange={e => setNewRmTitle(e.target.value)} placeholder="Название..." className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-[#00d2ff]" />
                 <textarea value={newRmDesc} onChange={e => setNewRmDesc(e.target.value)} placeholder="Описание..." className="bg-black/50 border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-[#00d2ff] h-24 resize-none" />
                 <div className="flex justify-end gap-3 mt-4">
                    <button onClick={() => setShowCreateRoadmap(false)} className="px-4 py-2 text-white/50 hover:text-white transition-colors">Отмена</button>
                    <button onClick={handleCreateRoadmap} className="px-5 py-2 bg-[#00d2ff] hover:bg-[#00d2ff]/80 text-black font-semibold rounded-lg transition-colors">Создать</button>
                 </div>
              </div>
           </div>
        )}

      </div>
    </AppShell>
  )
}

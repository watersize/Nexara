'use client'

import type { ReactNode } from 'react'
import { RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { HybridObject, HybridPoint, LassoSelection } from '@/components/notebook/types'

type HybridObjectWrapperProps = {
  object: HybridObject
  selected: boolean
  multiSelected?: boolean
  showDimensions: boolean
  scale?: number
  accent: string
  border: string
  panel: string
  dim: string
  onSelect: (id: string, additive?: boolean) => void
  onTransform: (id: string, patch: Partial<HybridObject>) => void
  onGroupMoveStart?: () => void
  onGroupMove?: (dx: number, dy: number) => void
  children?: ReactNode
}

export function getLassoBox(lasso: LassoSelection) {
  return {
    left: Math.min(lasso.start.x, lasso.current.x),
    top: Math.min(lasso.start.y, lasso.current.y),
    right: Math.max(lasso.start.x, lasso.current.x),
    bottom: Math.max(lasso.start.y, lasso.current.y),
  }
}

export function resolveLassoSelection(objects: HybridObject[], lasso: LassoSelection) {
  const box = getLassoBox(lasso)
  return objects
    .filter((object) => object.visible)
    .filter((object) => {
      const centerX = object.x + object.w / 2
      const centerY = object.y + object.h / 2
      return centerX >= box.left && centerX <= box.right && centerY >= box.top && centerY <= box.bottom
    })
    .map((object) => object.id)
}

export function getSnapGuides(objects: HybridObject[], moving: HybridObject) {
  const centerX = moving.x + moving.w / 2
  const centerY = moving.y + moving.h / 2
  return objects
    .filter((object) => object.id !== moving.id && object.visible)
    .flatMap((object) => {
      const guides: HybridPoint[] = []
      const objectCenterX = object.x + object.w / 2
      const objectCenterY = object.y + object.h / 2
      if (Math.abs(objectCenterX - centerX) < 8) guides.push({ x: objectCenterX, y: centerY })
      if (Math.abs(objectCenterY - centerY) < 8) guides.push({ x: centerX, y: objectCenterY })
      if (Math.abs(object.x - moving.x) < 8) guides.push({ x: object.x, y: moving.y })
      if (Math.abs(object.y - moving.y) < 8) guides.push({ x: moving.x, y: object.y })
      return guides
    })
}

function renderCadShape(object: HybridObject) {
  const sw = object.strokeWidth || 3
  if (object.shape === 'circle') return <ellipse cx="50%" cy="50%" rx="46%" ry="46%" fill={object.fill || 'transparent'} stroke={object.stroke} strokeWidth={sw} strokeDasharray={object.dash ? '10 7' : undefined} filter="url(#shadow)" />
  if (object.shape === 'triangle') return <polygon points="50,8 95,92 5,92" fill={object.fill || 'transparent'} stroke={object.stroke} strokeWidth={sw} strokeLinejoin="round" filter="url(#shadow)" />
  if (object.shape === 'rhombus') return <polygon points="50,8 92,50 50,92 8,50" fill={object.fill || 'transparent'} stroke={object.stroke} strokeWidth={sw} strokeLinejoin="round" filter="url(#shadow)" />
  if (object.shape === 'arc') return <path d="M 12 88 A 38 38 0 0 1 88 88" fill="none" stroke={object.stroke} strokeWidth={sw} strokeDasharray={object.dash ? '10 7' : undefined} filter="url(#shadow)" />
  if (object.shape === 'polygon') return <polygon points="26 50, 38 12, 62 12, 74 50, 62 88, 38 88" fill={object.fill || 'transparent'} stroke={object.stroke} strokeWidth={sw} filter="url(#shadow)" />
  return <rect x="8%" y="12%" width="84%" height="76%" rx="12" fill={object.fill || 'transparent'} stroke={object.stroke} strokeWidth={sw} strokeDasharray={object.dash ? '10 7' : undefined} filter="url(#shadow)" />
}

export function HybridObjectWrapper({
  object,
  selected,
  multiSelected,
  showDimensions,
  scale = 1,
  accent,
  border,
  panel,
  dim,
  onSelect,
  onTransform,
  onGroupMoveStart,
  onGroupMove,
  children,
}: HybridObjectWrapperProps) {
  const outline = selected ? accent : (multiSelected ? `${accent}80` : 'transparent')
  const isImage = object.type === 'image'
  const isText = object.type === 'text'

  const handlePointerDown = (e: React.PointerEvent, pivot: string) => {
    e.stopPropagation()
    e.preventDefault()
    
    const startX = e.clientX
    const startY = e.clientY
    const startW = object.w
    const startH = object.h
    const startXPos = object.x
    const startYPos = object.y
    const startFontSize = object.fontSize || 16

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = (moveEvent.clientX - startX) / scale
      const dy = (moveEvent.clientY - startY) / scale
      
      let patch: Partial<HybridObject> = {}

      if (pivot === 'se') {
        const newW = Math.max(20, startW + dx)
        const newH = Math.max(20, startH + dy)
        patch = { w: newW, h: newH }
        if (isText) {
          // Font scaling logic: scale relative to width change
          const ratio = newW / startW
          patch.fontSize = Math.max(8, startFontSize * ratio)
        }
      } else if (pivot === 'nw') {
        const newW = Math.max(20, startW - dx)
        const newH = Math.max(20, startH - dy)
        patch = { 
          x: startXPos + (startW - newW), 
          y: startYPos + (startH - newH), 
          w: newW, 
          h: newH 
        }
      } else if (pivot === 'ne') {
        const newW = Math.max(20, startW + dx)
        const newH = Math.max(20, startH - dy)
        patch = {
          y: startYPos + (startH - newH),
          w: newW,
          h: newH
        }
      } else if (pivot === 'sw') {
        const newW = Math.max(20, startW - dx)
        const newH = Math.max(20, startH + dy)
        patch = {
          x: startXPos + (startW - newW),
          w: newW,
          h: newH
        }
      }

      onTransform(object.id, patch)
    }

    const onPointerUp = () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)
  }

  return (
    <div
      className={cn(
        'absolute transition-shadow',
        (selected || multiSelected) && 'z-50'
      )}
      style={{ 
        left: object.x * scale, 
        top: object.y * scale, 
        width: object.w * scale, 
        height: object.h * scale, 
        transform: `rotate(${object.rot}deg)`, 
        zIndex: object.z, 
        opacity: object.opacity 
      }}
    >
      <div
        className="absolute inset-[-4px] rounded-[4px] border-2 pointer-events-none"
        style={{ borderColor: outline, display: (selected || multiSelected) ? 'block' : 'none' }}
      />
      
      <button
        type="button"
        className="absolute inset-0 cursor-move border-none bg-transparent"
        onPointerDown={(event) => {
          if (event.button !== 0) return
          if (!multiSelected) onSelect(object.id, event.shiftKey)
          const startX = event.clientX
          const startY = event.clientY
          const startObjX = object.x
          const startObjY = object.y

          if (multiSelected && onGroupMoveStart) onGroupMoveStart()

          const handlePointerMove = (moveEvent: PointerEvent) => {
            const dx = (moveEvent.clientX - startX) / scale
            const dy = (moveEvent.clientY - startY) / scale
            
            if (multiSelected && onGroupMove) {
               onGroupMove(dx, dy)
            } else {
               onTransform(object.id, { x: startObjX + dx, y: startObjY + dy })
            }
          }

          const handlePointerUp = () => {
            window.removeEventListener('pointermove', handlePointerMove)
            window.removeEventListener('pointerup', handlePointerUp)
          }

          window.addEventListener('pointermove', handlePointerMove)
          window.addEventListener('pointerup', handlePointerUp)
        }}
      />

      <div className="pointer-events-none h-full w-full overflow-visible">
        {object.type === 'cad' ? <svg viewBox="0 0 100 100" className="h-full w-full pointer-events-none"><defs><filter id="shadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" /></filter></defs>{renderCadShape(object)}</svg> : null}

        {object.type === 'stroke' && object.points?.length ? (
          <svg viewBox={`0 0 ${object.w} ${object.h}`} className="h-full w-full pointer-events-none">
            {object.points.map((point, index) => index ? (
              <line 
                key={index} 
                x1={object.points![index - 1].x * object.w} 
                y1={object.points![index - 1].y * object.h} 
                x2={point.x * object.w} 
                y2={point.y * object.h} 
                stroke={object.stroke} 
                strokeWidth={object.strokeWidth || 4} 
                strokeLinecap="round" 
              />
            ) : null)}
          </svg>
        ) : null}

        {children}
      </div>

      {selected && !object.locked && (
        <>
          {/* Resize handles - Corners */}
          {['nw', 'ne', 'sw', 'se'].map((pivot) => (
            <div
              key={pivot}
              className={cn(
                "absolute h-3.5 w-3.5 rounded-full border-2 border-blue-500 bg-white shadow-md cursor-nwse-resize z-[60] transition-transform hover:scale-125",
                pivot === 'nw' && "-left-[7px] -top-[7px]",
                pivot === 'ne' && "-right-[7px] -top-[7px] cursor-nesw-resize",
                pivot === 'sw' && "-left-[7px] -bottom-[7px] cursor-nesw-resize",
                pivot === 'se' && "-right-[7px] -bottom-[7px]"
              )}
              onPointerDown={(e) => handlePointerDown(e, pivot)}
            />
          ))}
          
          {/* Rotation handle */}
          <button 
            type="button" 
            className="absolute left-1/2 -top-8 flex h-6 w-6 -translate-x-1/2 items-center justify-center rounded-full border bg-white text-blue-500 shadow-md" 
            onPointerDown={(e) => {
              e.stopPropagation()
              // Simple rotation increment for now, or could implement full rotation logic
              onTransform(object.id, { rot: (object.rot + 15) % 360 })
            }}
          >
            <RotateCw className="h-3 w-3" />
          </button>
        </>
      )}

      {selected && !object.locked && object.type === 'cad' && showDimensions ? (
        <div className="absolute -bottom-8 left-0 right-0 flex justify-center">
            <div className="rounded bg-slate-800 px-2 py-0.5 text-[10px] text-white">
                {Math.round(object.w)} x {Math.round(object.h)}
            </div>
        </div>
      ) : null}
    </div>
  )
}

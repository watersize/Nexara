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
  if (object.shape === 'circle') return <ellipse cx="50%" cy="50%" rx="38%" ry="38%" fill={object.fill} stroke={object.stroke} strokeDasharray={object.dash ? '10 7' : undefined} />
  if (object.shape === 'arc') return <path d="M 18 84 A 32 32 0 0 1 82 84" fill="none" stroke={object.stroke} strokeDasharray={object.dash ? '10 7' : undefined} />
  if (object.shape === 'polygon') return <polygon points="20 50, 38 16, 72 16, 90 50, 72 84, 38 84" fill={object.fill} stroke={object.stroke} />
  return <rect x="14%" y="22%" width="72%" height="56%" rx="18" fill={object.fill} stroke={object.stroke} strokeDasharray={object.dash ? '10 7' : undefined} />
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
  children,
}: HybridObjectWrapperProps) {
  const outline = selected ? accent : border

  return (
    <div
      className={cn('absolute rounded-[24px] transition-shadow', (selected || multiSelected) && 'shadow-[0_0_0_1px_rgba(121,167,255,.35)]')}
      style={{ left: object.x * scale, top: object.y * scale, width: object.w * scale, height: object.h * scale, transform: `rotate(${object.rot}deg)`, zIndex: object.z, opacity: object.opacity }}
    >
      <button
        type="button"
        className="absolute inset-0 rounded-[24px] border"
        style={{ borderColor: outline, background: object.type === 'text' ? 'rgba(255,255,255,.02)' : 'transparent' }}
        onClick={(event) => {
          event.stopPropagation()
          onSelect(object.id, event.shiftKey)
        }}
      />

      {object.type === 'cad' ? <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">{renderCadShape(object)}</svg> : null}

      {object.type === 'stroke' && object.points?.length ? (
        <svg viewBox={`0 0 ${object.w} ${object.h}`} className="h-full w-full">
          {object.points.map((point, index) => index ? <line key={index} x1={object.points![index - 1].x * object.w} y1={object.points![index - 1].y * object.h} x2={point.x * object.w} y2={point.y * object.h} stroke={object.stroke} strokeWidth={4} strokeLinecap="round" /> : null)}
        </svg>
      ) : null}

      {children}

      {selected && !object.locked ? (
        <>
          <button type="button" className="absolute -right-2 -bottom-2 h-5 w-5 rounded-full border border-white/40 bg-white/90 text-[10px] font-semibold text-slate-900" onClick={(event) => { event.stopPropagation(); onTransform(object.id, { w: object.w + 20, h: object.h + 20 }) }}>
            SE
          </button>
          <button type="button" className="absolute -left-2 -top-2 h-5 w-5 rounded-full border border-white/40 bg-white/90 text-[10px] font-semibold text-slate-900" onClick={(event) => { event.stopPropagation(); onTransform(object.id, { x: object.x - 20, y: object.y - 20, w: object.w + 20, h: object.h + 20 }) }}>
            NW
          </button>
          <button type="button" className="absolute left-1/2 -top-8 flex h-7 w-7 -translate-x-1/2 items-center justify-center rounded-full border" style={{ background: panel, color: '#fff', borderColor: border }} onClick={(event) => { event.stopPropagation(); onTransform(object.id, { rot: object.rot + 15 }) }}>
            <RotateCw className="h-3.5 w-3.5" />
          </button>
        </>
      ) : null}

      {selected && !object.locked && object.type === 'cad' && showDimensions ? (
        <>
          <div className="absolute left-4 right-4 top-[-30px] flex items-center gap-2">
            <div className="h-px flex-1" style={{ background: dim }} />
            <input value={Math.round(object.w)} onChange={(event) => onTransform(object.id, { w: Math.max(44, Number(event.target.value || 0)) })} className="w-20 rounded-full border px-3 py-1 text-center text-[11px] font-semibold outline-none" style={{ background: panel, color: dim, borderColor: dim }} onClick={(event) => event.stopPropagation()} />
            <div className="h-px flex-1" style={{ background: dim }} />
          </div>
          <div className="absolute bottom-4 left-[-34px] top-4 flex flex-col items-center justify-center gap-2">
            <div className="h-full w-px" style={{ background: dim }} />
            <input value={Math.round(object.h)} onChange={(event) => onTransform(object.id, { h: Math.max(44, Number(event.target.value || 0)) })} className="w-16 rounded-full border px-2 py-1 text-center text-[11px] font-semibold outline-none" style={{ background: panel, color: dim, borderColor: dim }} onClick={(event) => event.stopPropagation()} />
          </div>
        </>
      ) : null}
    </div>
  )
}

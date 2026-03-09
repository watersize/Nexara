export type HybridPoint = { x: number; y: number }

export type HybridObjectKind = 'text' | 'image' | 'cad' | 'stroke' | 'table'

export type HybridCadShape = 'rectangle' | 'circle' | 'arc' | 'polygon'

export type HybridObject = {
  id: string
  type: HybridObjectKind
  name: string
  x: number
  y: number
  w: number
  h: number
  rot: number
  z: number
  locked: boolean
  visible: boolean
  opacity: number
  text?: string
  variant?: 'title' | 'body' | 'callout'
  src?: string
  caption?: string
  traceable?: boolean
  points?: HybridPoint[]
  cells?: string[][]
  shape?: HybridCadShape
  units?: 'px' | 'mm'
  dash?: boolean
  stroke?: string
  fill?: string
  view?: string
}

export type LassoSelection = {
  active: boolean
  start: HybridPoint
  current: HybridPoint
}

export type ObjectPanelState = {
  rightPanelCollapsed: boolean
  textToolbarVisible: boolean
}

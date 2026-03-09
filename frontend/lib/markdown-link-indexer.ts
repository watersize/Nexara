import { tauriInvoke } from '@/lib/tauri-bridge'

export type IndexedLinkReference = {
  target: string
  displayText: string
  rangeStart: number
  rangeEnd: number
  edgeType: 'wikilink'
}

export type SyncNodeLinksInput = {
  nodeId: string
  kind: 'note' | 'task' | 'schedule'
  title: string
  topic?: string
  content: string
  sourceRef?: string
  links: IndexedLinkReference[]
}

export async function parseMarkdownLinksWithWorker(markdown: string): Promise<IndexedLinkReference[]> {
  if (typeof window === 'undefined' || typeof Worker === 'undefined') {
    return parseMarkdownLinksFallback(markdown)
  }

  const worker = new Worker(new URL('../workers/markdown-link-parser.worker.ts', import.meta.url))
  return await new Promise<IndexedLinkReference[]>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      worker.terminate()
      resolve(parseMarkdownLinksFallback(markdown))
    }, 1200)

    worker.onmessage = (event) => {
      window.clearTimeout(timer)
      worker.terminate()
      resolve(event.data?.payload?.links || [])
    }

    worker.onerror = (error) => {
      window.clearTimeout(timer)
      worker.terminate()
      reject(error)
    }

    worker.postMessage({
      type: 'parse-markdown-links',
      payload: { markdown },
    })
  })
}

export async function syncNodeLinks(input: SyncNodeLinksInput) {
  return await tauriInvoke<{ ok: boolean; message: string }>('sync_node_links', {
    payload: {
      node_id: input.nodeId,
      kind: input.kind,
      title: input.title,
      topic: input.topic || '',
      content: input.content,
      source_ref: input.sourceRef || `${input.kind}:${input.nodeId}`,
      links: input.links.map((link) => ({
        target: link.target,
        display_text: link.displayText,
        range_start: link.rangeStart,
        range_end: link.rangeEnd,
        edge_type: link.edgeType,
      })),
    },
  })
}

export async function fetchNodeWithNeighbors(nodeId: string) {
  return await tauriInvoke<{
    node: {
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
    neighbors: Array<{
      node_id: string
      kind: string
      title: string
      slug: string
      topic: string
      edge_type: string
      direction: string
      weight: number
    }>
  }>('get_node_with_neighbors', {
    payload: { node_id: nodeId },
  })
}

function parseMarkdownLinksFallback(markdown: string): IndexedLinkReference[] {
  const links: IndexedLinkReference[] = []
  const regex = /\[\[([^\]]+)\]\]/g
  for (const match of markdown.matchAll(regex)) {
    const raw = (match[1] || '').trim()
    if (!raw) continue
    const [targetText, aliasText] = raw.split('|').map((part) => part.trim())
    const target = targetText
      .trim()
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
    if (!target) continue
    links.push({
      target,
      displayText: aliasText || targetText || '',
      rangeStart: match.index || 0,
      rangeEnd: (match.index || 0) + match[0].length,
      edgeType: 'wikilink',
    })
  }
  return links
}


export type ParsedWikiLink = {
  target: string
  displayText: string
  rangeStart: number
  rangeEnd: number
  edgeType: 'wikilink'
}

export type ParseMarkdownLinksMessage = {
  type: 'parse-markdown-links'
  payload: {
    markdown: string
  }
}

export type ParseMarkdownLinksResult = {
  type: 'parsed-markdown-links'
  payload: {
    links: ParsedWikiLink[]
  }
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
}

function parseMarkdownLinks(markdown: string): ParsedWikiLink[] {
  const links: ParsedWikiLink[] = []
  const regex = /\[\[([^\]]+)\]\]/g
  for (const match of markdown.matchAll(regex)) {
    const raw = (match[1] || '').trim()
    if (!raw) continue
    const [targetText, aliasText] = raw.split('|').map((part) => part.trim())
    const target = slugify(targetText || '')
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

self.onmessage = (event: MessageEvent<ParseMarkdownLinksMessage>) => {
  if (event.data?.type !== 'parse-markdown-links') return
  const links = parseMarkdownLinks(event.data.payload?.markdown || '')
  const result: ParseMarkdownLinksResult = {
    type: 'parsed-markdown-links',
    payload: { links },
  }
  self.postMessage(result)
}


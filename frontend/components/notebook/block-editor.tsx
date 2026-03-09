'use client'

import { useCallback, useEffect, useRef, useState, KeyboardEvent } from 'react'
import { Bold, Italic, List, ListOrdered, Quote, Code, Heading1, Heading2, Type, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export type BlockType = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bullet-list' | 'numbered-list' | 'blockquote' | 'code' | 'divider'

export type Block = {
  id: string
  type: BlockType
  content: string
}

export type BlockEditorProps = {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
  onWikiLinkTrigger?: (query: string, blockId: string, position: { x: number; y: number }) => void
  dark?: boolean
  className?: string
}

const makeBlockId = () => `blk-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`

const SLASH_COMMANDS = [
  { type: 'heading1' as BlockType, label: 'Заголовок 1', icon: Heading1 },
  { type: 'heading2' as BlockType, label: 'Заголовок 2', icon: Heading2 },
  { type: 'paragraph' as BlockType, label: 'Текст', icon: Type },
  { type: 'bullet-list' as BlockType, label: 'Маркер', icon: List },
  { type: 'numbered-list' as BlockType, label: 'Нумерация', icon: ListOrdered },
  { type: 'blockquote' as BlockType, label: 'Цитата', icon: Quote },
  { type: 'code' as BlockType, label: 'Код', icon: Code },
  { type: 'divider' as BlockType, label: 'Разделитель', icon: Minus },
]

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'heading1': return `# ${block.content}`
        case 'heading2': return `## ${block.content}`
        case 'heading3': return `### ${block.content}`
        case 'bullet-list': return `- ${block.content}`
        case 'numbered-list': return `1. ${block.content}`
        case 'blockquote': return `> ${block.content}`
        case 'code': return `\`\`\`\n${block.content}\n\`\`\``
        case 'divider': return '---'
        default: return block.content
      }
    })
    .join('\n\n')
}

export function markdownToBlocks(md: string): Block[] {
  const lines = md.split('\n')
  const blocks: Block[] = []
  let inCode = false
  let codeBuf = ''

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCode) {
        blocks.push({ id: makeBlockId(), type: 'code', content: codeBuf.trim() })
        codeBuf = ''
        inCode = false
      } else {
        inCode = true
      }
      continue
    }
    if (inCode) {
      codeBuf += line + '\n'
      continue
    }
    const trimmed = line.trim()
    if (!trimmed) continue
    if (trimmed === '---' || trimmed === '***') {
      blocks.push({ id: makeBlockId(), type: 'divider', content: '' })
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ id: makeBlockId(), type: 'heading3', content: trimmed.slice(4) })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ id: makeBlockId(), type: 'heading2', content: trimmed.slice(3) })
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ id: makeBlockId(), type: 'heading1', content: trimmed.slice(2) })
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      blocks.push({ id: makeBlockId(), type: 'bullet-list', content: trimmed.slice(2) })
    } else if (/^\d+\.\s/.test(trimmed)) {
      blocks.push({ id: makeBlockId(), type: 'numbered-list', content: trimmed.replace(/^\d+\.\s/, '') })
    } else if (trimmed.startsWith('> ')) {
      blocks.push({ id: makeBlockId(), type: 'blockquote', content: trimmed.slice(2) })
    } else {
      blocks.push({ id: makeBlockId(), type: 'paragraph', content: trimmed })
    }
  }
  if (inCode && codeBuf) {
    blocks.push({ id: makeBlockId(), type: 'code', content: codeBuf.trim() })
  }
  if (blocks.length === 0) {
    blocks.push({ id: makeBlockId(), type: 'paragraph', content: '' })
  }
  return blocks
}

function BlockRow({
  block,
  index,
  focused,
  dark,
  onFocus,
  onContentChange,
  onKeyDown,
  onTypeChange,
  inputRef,
}: {
  block: Block
  index: number
  focused: boolean
  dark: boolean
  onFocus: () => void
  onContentChange: (content: string) => void
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => void
  onTypeChange: (type: BlockType) => void
  inputRef: (el: HTMLTextAreaElement | HTMLInputElement | null) => void
}) {
  const prefix = (() => {
    switch (block.type) {
      case 'bullet-list': return '•  '
      case 'numbered-list': return `${index + 1}.  `
      case 'blockquote': return ''
      default: return ''
    }
  })()

  if (block.type === 'divider') {
    return (
      <div className="py-3 px-2 group flex items-center gap-3">
        <div className={cn('flex-1 border-t', dark ? 'border-white/10' : 'border-black/10')} />
      </div>
    )
  }

  const baseClass = cn(
    'w-full bg-transparent outline-none resize-none border-none px-1 leading-relaxed transition-colors',
    dark ? 'text-white placeholder:text-white/25' : 'text-gray-900 placeholder:text-gray-400',
    block.type === 'heading1' && 'text-3xl font-bold',
    block.type === 'heading2' && 'text-2xl font-semibold',
    block.type === 'heading3' && 'text-xl font-semibold',
    block.type === 'paragraph' && 'text-base',
    block.type === 'bullet-list' && 'text-base',
    block.type === 'numbered-list' && 'text-base',
    block.type === 'blockquote' && 'text-base italic opacity-80',
    block.type === 'code' && 'font-mono text-sm',
  )

  const wrapperClass = cn(
    'group relative flex items-start gap-1 px-2 rounded-lg transition-colors',
    focused && (dark ? 'bg-white/[0.03]' : 'bg-black/[0.02]'),
    block.type === 'blockquote' && (dark ? 'border-l-4 border-blue-500/50 pl-4' : 'border-l-4 border-blue-500/30 pl-4'),
    block.type === 'code' && (dark ? 'bg-white/[0.05] rounded-xl p-3' : 'bg-gray-100 rounded-xl p-3'),
  )

  return (
    <div className={wrapperClass}>
      {prefix && <span className={cn('shrink-0 select-none pt-[3px]', dark ? 'text-white/30' : 'text-gray-400', block.type === 'heading1' && 'pt-1', block.type === 'heading2' && 'pt-0.5')}>{prefix}</span>}
      <textarea
        ref={inputRef as any}
        value={block.content}
        onChange={(e) => onContentChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        placeholder={block.type === 'heading1' ? 'Заголовок' : block.type === 'paragraph' ? 'Начните писать или введите / для команд...' : ''}
        className={baseClass}
        rows={1}
        style={{ height: 'auto', minHeight: block.type.startsWith('heading') ? '2.5rem' : block.type === 'code' ? '4rem' : '1.8rem', overflow: 'hidden' }}
        onInput={(e) => {
          const target = e.currentTarget
          target.style.height = 'auto'
          target.style.height = `${target.scrollHeight}px`
        }}
      />
    </div>
  )
}

export function BlockEditor({ blocks, onChange, onWikiLinkTrigger, dark = true, className }: BlockEditorProps) {
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [slashMenu, setSlashMenu] = useState<{ index: number; filter: string } | null>(null)
  const [slashMenuIndex, setSlashMenuIndex] = useState(0)
  const inputRefs = useRef<(HTMLTextAreaElement | HTMLInputElement | null)[]>([])

  const focusBlock = useCallback((index: number, end = false) => {
    requestAnimationFrame(() => {
      const el = inputRefs.current[index]
      if (el) {
        el.focus()
        if (end) {
          const len = el.value?.length || 0
          el.setSelectionRange(len, len)
        }
      }
    })
  }, [])

  const updateBlock = useCallback((index: number, patch: Partial<Block>) => {
    const updated = [...blocks]
    updated[index] = { ...updated[index], ...patch }
    onChange(updated)
  }, [blocks, onChange])

  const insertBlock = useCallback((afterIndex: number, type: BlockType = 'paragraph') => {
    const updated = [...blocks]
    const newBlock: Block = { id: makeBlockId(), type, content: '' }
    updated.splice(afterIndex + 1, 0, newBlock)
    onChange(updated)
    requestAnimationFrame(() => {
      setFocusedIndex(afterIndex + 1)
      focusBlock(afterIndex + 1)
    })
  }, [blocks, onChange, focusBlock])

  const deleteBlock = useCallback((index: number) => {
    if (blocks.length <= 1) {
      updateBlock(0, { content: '', type: 'paragraph' })
      return
    }
    const updated = [...blocks]
    updated.splice(index, 1)
    onChange(updated)
    const newIndex = Math.max(0, index - 1)
    setFocusedIndex(newIndex)
    requestAnimationFrame(() => focusBlock(newIndex, true))
  }, [blocks, onChange, updateBlock, focusBlock])

  const handleKeyDown = useCallback((index: number, e: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
    const block = blocks[index]

    // Slash menu navigation
    if (slashMenu && slashMenu.index === index) {
      const filtered = SLASH_COMMANDS.filter((cmd) => cmd.label.toLowerCase().includes(slashMenu.filter.toLowerCase()))
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashMenuIndex((prev) => Math.min(prev + 1, filtered.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashMenuIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault()
        if (filtered[slashMenuIndex]) {
          updateBlock(index, { type: filtered[slashMenuIndex].type, content: '' })
          setSlashMenu(null)
        }
        return
      }
      if (e.key === 'Escape') {
        setSlashMenu(null)
        return
      }
    }

    // Enter → new block
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      setSlashMenu(null)
      insertBlock(index)
      return
    }

    // Backspace on empty block → delete
    if (e.key === 'Backspace' && block.content === '') {
      e.preventDefault()
      setSlashMenu(null)
      deleteBlock(index)
      return
    }

    // Arrow Up at start → focus prev
    if (e.key === 'ArrowUp' && index > 0) {
      const el = e.currentTarget
      if (el.selectionStart === 0 && el.selectionEnd === 0) {
        e.preventDefault()
        setFocusedIndex(index - 1)
        focusBlock(index - 1, true)
      }
    }

    // Arrow Down at end → focus next
    if (e.key === 'ArrowDown' && index < blocks.length - 1) {
      const el = e.currentTarget
      if (el.selectionStart === el.value.length) {
        e.preventDefault()
        setFocusedIndex(index + 1)
        focusBlock(index + 1)
      }
    }

    // Bold
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart || 0
      const end = el.selectionEnd || 0
      if (start !== end) {
        const before = block.content.slice(0, start)
        const selected = block.content.slice(start, end)
        const after = block.content.slice(end)
        updateBlock(index, { content: `${before}**${selected}**${after}` })
      }
    }

    // Italic
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault()
      const el = e.currentTarget
      const start = el.selectionStart || 0
      const end = el.selectionEnd || 0
      if (start !== end) {
        const before = block.content.slice(0, start)
        const selected = block.content.slice(start, end)
        const after = block.content.slice(end)
        updateBlock(index, { content: `${before}*${selected}*${after}` })
      }
    }
  }, [blocks, slashMenu, slashMenuIndex, insertBlock, deleteBlock, updateBlock, focusBlock])

  const handleContentChange = useCallback((index: number, content: string) => {
    // Check for slash command trigger
    if (content === '/') {
      setSlashMenu({ index, filter: '' })
      setSlashMenuIndex(0)
      updateBlock(index, { content: '' })
      return
    }
    if (slashMenu && slashMenu.index === index) {
      if (content.length > 0 && !content.includes('\n')) {
        setSlashMenu({ index, filter: content })
        setSlashMenuIndex(0)
        updateBlock(index, { content: '' })
        return
      } else {
        setSlashMenu(null)
      }
    }

    // Check for wiki-link trigger [[
    if (content.endsWith('[[') && onWikiLinkTrigger) {
      const el = inputRefs.current[index]
      if (el) {
        const rect = el.getBoundingClientRect()
        onWikiLinkTrigger('', blocks[index].id, { x: rect.left + 20, y: rect.bottom + 4 })
      }
    }

    updateBlock(index, { content })
  }, [blocks, slashMenu, updateBlock, onWikiLinkTrigger])

  const filteredCommands = slashMenu
    ? SLASH_COMMANDS.filter((cmd) => cmd.label.toLowerCase().includes(slashMenu.filter.toLowerCase()))
    : []

  return (
    <div className={cn('relative flex flex-col gap-0.5 py-4', className)}>
      {blocks.map((block, index) => (
        <div key={block.id} className="relative">
          <BlockRow
            block={block}
            index={index}
            focused={focusedIndex === index}
            dark={dark}
            onFocus={() => setFocusedIndex(index)}
            onContentChange={(content) => handleContentChange(index, content)}
            onKeyDown={(e) => handleKeyDown(index, e)}
            onTypeChange={(type) => updateBlock(index, { type })}
            inputRef={(el) => { inputRefs.current[index] = el }}
          />

          {/* Slash Command Menu */}
          {slashMenu?.index === index && filteredCommands.length > 0 && (
            <div className={cn(
              'absolute left-4 top-full z-50 mt-1 w-60 rounded-xl border shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200',
              dark ? 'bg-neutral-900 border-white/10' : 'bg-white border-gray-200'
            )}>
              {filteredCommands.map((cmd, cmdIndex) => {
                const Icon = cmd.icon
                return (
                  <button
                    key={cmd.type}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      updateBlock(index, { type: cmd.type, content: '' })
                      setSlashMenu(null)
                      focusBlock(index)
                    }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors',
                      cmdIndex === slashMenuIndex
                        ? (dark ? 'bg-white/10 text-white' : 'bg-blue-50 text-blue-700')
                        : (dark ? 'text-white/70 hover:bg-white/5' : 'text-gray-700 hover:bg-gray-50')
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{cmd.label}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

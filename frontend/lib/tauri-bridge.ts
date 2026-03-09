import { invoke } from '@tauri-apps/api/core'

const mockDb = {
  notes: [] as any[],
  tasks: [] as any[],
  textbooks: [] as any[],
  nodes: [] as any[],
  edges: [] as any[],
  folders: [] as any[],
}

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
    console.warn(`[Tauri Mock] Invoking command: ${command}`, args)
    return mockInvoke(command, args) as Promise<T>
  }

  try {
    return await invoke(command, args)
  } catch (error) {
    console.error(`[Tauri Error] ${command} failed:`, error)
    throw error
  }
}

async function mockInvoke(command: string, args?: Record<string, unknown>): Promise<any> {
  switch (command) {
    case 'bootstrap_app':
      return {
        days: [
          { value: 1, label: 'Понедельник' },
          { value: 2, label: 'Вторник' },
          { value: 3, label: 'Среда' },
          { value: 4, label: 'Четверг' },
          { value: 5, label: 'Пятница' },
          { value: 6, label: 'Суббота' },
          { value: 7, label: 'Воскресенье' },
        ],
        subjects: [],
        auth_session: null,
        settings: {
          theme: 'theme-dark',
          hints_enabled: true,
          enable_3d: true,
          reminder_hours: 18,
          telegram_enabled: false,
          telegram_bot_token: '',
          telegram_chat_id: '',
        },
        textbooks: mockDb.textbooks,
        default_week_number: 1,
        default_weekday: 1,
      }
    case 'get_schedule_for_weekday':
      return []
    case 'list_notes':
      return mockDb.notes
    case 'save_note': {
      const note = (args as any)?.payload?.note
      mockDb.notes = [note, ...mockDb.notes.filter((item) => item.id !== note.id)]
      return { ok: true, message: 'ok' }
    }
    case 'delete_note': {
      const id = (args as any)?.payload?.id
      mockDb.notes = mockDb.notes.filter((item) => item.id !== id)
      return { ok: true, message: 'ok' }
    }
    case 'list_note_folders':
      return mockDb.folders
    case 'save_note_folder': {
      const folder = (args as any)?.payload?.folder
      mockDb.folders = [folder, ...mockDb.folders.filter((item) => item.id !== folder.id)]
      return { ok: true, message: 'ok' }
    }
    case 'delete_note_folder': {
      const folderId = (args as any)?.payload?.id
      mockDb.folders = mockDb.folders.filter((item) => item.id !== folderId)
      mockDb.notes = mockDb.notes.map((n) => n.folder_id === folderId ? { ...n, folder_id: '' } : n)
      return { ok: true, message: 'ok' }
    }
    case 'search_notes': {
      const query = ((args as any)?.payload?.query || '').toLowerCase()
      const results = mockDb.notes
        .filter((n) => n.title?.toLowerCase().includes(query))
        .slice(0, 10)
        .map((n) => ({ id: n.id, title: n.title, kind: 'note' }))
      const folderResults = mockDb.folders
        .filter((f) => f.name?.toLowerCase().includes(query))
        .slice(0, 5)
        .map((f) => ({ id: f.id, title: f.name, kind: 'folder' }))
      return [...results, ...folderResults]
    }
    case 'list_tasks':
      return mockDb.tasks
    case 'save_task': {
      const task = (args as any)?.payload?.task
      mockDb.tasks = [task, ...mockDb.tasks.filter((item) => item.id !== task.id)]
      return { ok: true, message: 'ok' }
    }
    case 'delete_task': {
      const id = (args as any)?.payload?.id
      mockDb.tasks = mockDb.tasks.filter((item) => item.id !== id)
      return { ok: true, message: 'ok' }
    }
    case 'sync_node_links': {
      const payload = args as any
      const node = {
        node_id: payload?.nodeId || payload?.node_id || '',
        kind: payload?.kind || 'note',
        title: payload?.title || '',
        slug: String(payload?.title || '')
          .toLowerCase()
          .replace(/[^\p{L}\p{N}]+/gu, '-')
          .replace(/^-+|-+$/g, ''),
        topic: payload?.topic || '',
        content: payload?.content || '',
        source_ref: payload?.sourceRef || payload?.source_ref || '',
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      }
      mockDb.nodes = [node, ...mockDb.nodes.filter((item) => item.node_id !== node.node_id)]
      mockDb.edges = (payload?.links || []).map((link: any) => ({
        from_node_id: node.node_id,
        target_slug: link.target,
        display_text: link.displayText || link.display_text || '',
      }))
      return { ok: true, message: 'ok' }
    }
    case 'get_node_with_neighbors': {
      const nodeId = (args as any)?.payload?.node_id || (args as any)?.payload?.nodeId
      const node = mockDb.nodes.find((item) => item.node_id === nodeId)
      return {
        node: node || {
          node_id: nodeId,
          kind: 'note',
          title: '',
          slug: '',
          topic: '',
          content: '',
          source_ref: '',
          updated_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        },
        neighbors: [],
      }
    }
    case 'list_textbooks_command':
      return mockDb.textbooks
    case 'upload_textbook':
      return { ok: true, message: 'ok' }
    case 'delete_textbook':
      return { ok: true, message: 'ok' }
    case 'notify_status':
      return { ok: true, message: 'ok' }
    case 'save_settings':
      return { ok: true, message: 'ok' }
    case 'update_profile':
      return { ok: true, message: 'ok' }
    case 'logout_user':
      return { ok: true, message: 'ok' }
    case 'delete_account':
      mockDb.notes = []
      mockDb.tasks = []
      mockDb.textbooks = []
      mockDb.folders = []
      return { ok: true, message: 'ok' }
    default:
      console.log(`Mock ignored command: ${command}`)
      return {}
  }
}

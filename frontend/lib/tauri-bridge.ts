import { invoke } from '@tauri-apps/api/core'

const mockDb = {
  notes: [] as any[],
  tasks: [] as any[],
  textbooks: [] as any[],
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
      return { ok: true, message: 'ok' }
    default:
      console.log(`Mock ignored command: ${command}`)
      return {}
  }
}

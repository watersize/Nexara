import { invoke } from '@tauri-apps/api/core';

export async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // If running in browser without Tauri (e.g. standard Next.js dev server accessed from Chrome)
  if (typeof window !== 'undefined' && !(window as any).__TAURI_INTERNALS__) {
    console.warn(`[Tauri Mock] Invoking command: ${command}`, args);
    return mockInvoke(command, args) as Promise<T>;
  }

  try {
    return await invoke(command, args);
  } catch (error) {
    console.error(`[Tauri Error] ${command} failed:`, error);
    throw error;
  }
}

// Temporary mock implementations for browser testing
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
          { value: 7, label: 'Воскресенье' }
        ],
        subjects: ['Математика', 'Физика', 'Информатика'],
        auth_session: null,
        settings: {
          theme: 'theme-dark',
          hints_enabled: true,
          enable_3d: true,
          reminder_hours: 18,
          telegram_enabled: false
        },
        textbooks: [],
        default_week_number: 1,
        default_weekday: 1
      };
    case 'get_schedule_for_weekday':
      return [];
    default:
      console.log(`Mock ignored command: ${command}`);
      return {};
  }
}

// ===== Planner App =====
const PLANNER_KEY = 'nexara-tasks';

const SUBJECT_COLORS = {
  'Математика': '59,130,246',
  'Физика': '168,85,247',
  'Химия': '249,115,22',
  'Биология': '34,197,94',
  'История': '245,158,11',
  'Литература': '16,185,129',
  'Английский': '236,72,153',
  'Информатика': '99,102,241',
  'Общее': '100,116,139',
};

const PRIORITY_COLORS = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#6b7280',
};

const SECTIONS = {
  today: 'Сегодня',
  week: 'На неделе',
  later: 'Позже',
  done: 'Выполнено',
};

class PlannerApp {
  constructor() {
    this.tasks = this.loadTasks();
    this.init();
  }

  loadTasks() {
    try {
      const raw = localStorage.getItem(PLANNER_KEY);
      return raw ? JSON.parse(raw) : this.defaultTasks();
    } catch {
      return this.defaultTasks();
    }
  }

  defaultTasks() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 5);

    return [
      { id: 't1', title: 'Решить задачи §12 (№1-5)', subject: 'Математика', deadline: tomorrow.toISOString().slice(0,10), priority: 'high', section: 'today', done: false, createdAt: Date.now() },
      { id: 't2', title: 'Читать главу 4 "Война и мир"', subject: 'Литература', deadline: tomorrow.toISOString().slice(0,10), priority: 'medium', section: 'today', done: false, createdAt: Date.now() - 1000 },
      { id: 't3', title: 'Написать конспект по теме "Электрический ток"', subject: 'Физика', deadline: nextWeek.toISOString().slice(0,10), priority: 'medium', section: 'week', done: false, createdAt: Date.now() - 2000 },
      { id: 't4', title: 'Выучить слова Unit 7', subject: 'Английский', deadline: nextWeek.toISOString().slice(0,10), priority: 'low', section: 'week', done: false, createdAt: Date.now() - 3000 },
      { id: 't5', title: 'Подготовить реферат по биологии', subject: 'Биология', deadline: '', priority: 'low', section: 'later', done: false, createdAt: Date.now() - 4000 },
      { id: 't6', title: 'Сдать лабораторную по химии', subject: 'Химия', deadline: '', priority: 'medium', section: 'done', done: true, createdAt: Date.now() - 5000 },
    ];
  }

  saveTasks() {
    localStorage.setItem(PLANNER_KEY, JSON.stringify(this.tasks));
  }

  isOverdue(deadline) {
    if (!deadline) return false;
    const today = new Date().toISOString().slice(0,10);
    return deadline < today;
  }

  formatDeadline(deadline) {
    if (!deadline) return '';
    const today = new Date().toISOString().slice(0,10);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tmr = tomorrow.toISOString().slice(0,10);

    if (deadline === today) return 'Сегодня';
    if (deadline === tmr) return 'Завтра';
    const d = new Date(deadline + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  getTasksBySection(section) {
    return this.tasks.filter(t => t.section === section);
  }

  renderProgress() {
    const todayTasks = this.tasks.filter(t => t.section === 'today' || (t.done && t.section !== 'later' && t.section !== 'week'));
    const allToday = this.tasks.filter(t => t.section === 'today');
    const doneToday = allToday.filter(t => t.done).length;
    const total = allToday.length;

    const label = document.getElementById('progress-label');
    const fill = document.getElementById('progress-fill');
    if (label) label.textContent = `${doneToday} / ${total}`;
    if (fill) fill.style.width = total > 0 ? `${Math.round(doneToday / total * 100)}%` : '0%';
  }

  renderSections() {
    const container = document.getElementById('planner-sections');
    if (!container) return;

    const sectionOrder = ['today', 'week', 'later', 'done'];

    container.innerHTML = sectionOrder.map(section => {
      const tasks = this.getTasksBySection(section);
      const label = SECTIONS[section];
      const activeTasks = tasks.filter(t => !t.done);
      const doneTasks = tasks.filter(t => t.done);
      const renderList = section === 'done' ? doneTasks : [...activeTasks, ...doneTasks];

      return `
        <div class="planner-section" data-section="${section}">
          <div class="planner-section-header">
            <span class="planner-section-title">
              ${label}
              <span class="task-count-badge">${renderList.length}</span>
            </span>
            ${section !== 'done' ? `
              <button class="add-task-btn" data-section="${section}">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M7 2V12M2 7H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                Добавить
              </button>
            ` : ''}
          </div>
          <div class="tasks-list">
            ${renderList.length === 0 ? `
              <div style="padding:12px 16px; text-align:center; font-size:0.82rem; color:var(--text-tertiary);">
                ${section === 'today' ? 'Нет задач на сегодня' : section === 'done' ? 'Нет выполненных задач' : 'Нет задач'}
              </div>
            ` : renderList.map((task, i) => this.renderTask(task, i)).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  renderTask(task, delay = 0) {
    const color = SUBJECT_COLORS[task.subject] || SUBJECT_COLORS['Общее'];
    const pColor = PRIORITY_COLORS[task.priority] || PRIORITY_COLORS.medium;
    const overdue = this.isOverdue(task.deadline);
    const deadlineText = this.formatDeadline(task.deadline);

    return `
      <div class="task-item ${task.done ? 'done' : ''}" data-id="${task.id}" style="animation-delay:${delay * 0.04}s">
        <div class="task-priority" style="background:${pColor};"></div>
        <div class="task-checkbox ${task.done ? 'checked' : ''}" data-check="${task.id}">
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 5L4 7L8 3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="task-content">
          <div class="task-title">${task.title}</div>
          <div class="task-meta">
            <span class="task-subject" style="--ts-color:${color};">${task.subject}</span>
            ${deadlineText ? `
              <span class="task-deadline ${overdue && !task.done ? 'overdue' : ''}">
                <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
                ${deadlineText}${overdue && !task.done ? ' — просрочено' : ''}
              </span>
            ` : ''}
          </div>
        </div>
        <button class="task-delete" data-delete="${task.id}" title="Удалить">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
        </button>
      </div>
    `;
  }

  render() {
    this.renderProgress();
    this.renderSections();
  }

  init() {
    this.render();

    // Set default date for input
    const today = new Date().toISOString().slice(0,10);
    const deadlineInput = document.getElementById('task-deadline-input');
    if (deadlineInput) deadlineInput.value = today;

    // Events
    document.getElementById('planner-sections')?.addEventListener('click', (e) => {
      // Checkbox
      const check = e.target.closest('[data-check]');
      if (check) {
        const id = check.dataset.check;
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;
        task.done = !task.done;
        if (task.done && task.section !== 'done') {
          task.prevSection = task.section;
          task.section = 'done';
        } else if (!task.done && task.section === 'done') {
          task.section = task.prevSection || 'today';
        }
        this.saveTasks();
        this.render();
        return;
      }

      // Delete
      const del = e.target.closest('[data-delete]');
      if (del) {
        const id = del.dataset.delete;
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.saveTasks();
        this.render();
        return;
      }

      // Add task button
      const addBtn = e.target.closest('.add-task-btn');
      if (addBtn) {
        const section = addBtn.dataset.section;
        const sectionInput = document.getElementById('task-section-input');
        if (sectionInput) sectionInput.value = section;
        this.openModal();
      }
    });

    document.getElementById('add-task-fab')?.addEventListener('click', () => this.openModal());

    document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });

    document.getElementById('save-task-btn')?.addEventListener('click', () => {
      const title = document.getElementById('task-title-input')?.value?.trim();
      if (!title) {
        document.getElementById('task-title-input')?.focus();
        return;
      }
      const task = {
        id: 'task-' + Date.now(),
        title,
        subject: document.getElementById('task-subject-input')?.value || 'Общее',
        deadline: document.getElementById('task-deadline-input')?.value || '',
        priority: document.getElementById('task-priority-input')?.value || 'medium',
        section: document.getElementById('task-section-input')?.value || 'today',
        done: false,
        createdAt: Date.now(),
      };
      this.tasks.unshift(task);
      this.saveTasks();
      this.render();
      this.closeModal();
    });

    // Enter key in title input
    document.getElementById('task-title-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('save-task-btn')?.click();
    });
  }

  openModal() {
    document.getElementById('modal-backdrop')?.classList.add('open');
    document.getElementById('task-title-input')?.focus();
  }

  closeModal() {
    document.getElementById('modal-backdrop')?.classList.remove('open');
    if (document.getElementById('task-title-input')) document.getElementById('task-title-input').value = '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PlannerApp();
});

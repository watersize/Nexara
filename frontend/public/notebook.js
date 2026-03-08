// ===== Notebook App =====
const STORAGE_KEY = 'nexara-notes';

const TAGS_COLORS = {
  'Математика': { bg: '59,130,246', label: 'Математика' },
  'Физика': { bg: '168,85,247', label: 'Физика' },
  'История': { bg: '245,158,11', label: 'История' },
  'Биология': { bg: '34,197,94', label: 'Биология' },
  'Химия': { bg: '249,115,22', label: 'Химия' },
  'Литература': { bg: '16,185,129', label: 'Литература' },
  'Другое': { bg: '100,116,139', label: 'Другое' },
};

class NotebookApp {
  constructor() {
    this.notes = this.loadNotes();
    this.activeNoteId = null;
    this.saveTimer = null;
    this.isMobile = window.innerWidth < 768;

    this.init();
  }

  loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : this.defaultNotes();
    } catch {
      return this.defaultNotes();
    }
  }

  defaultNotes() {
    return [
      {
        id: 'note-1',
        title: 'Формулы по физике',
        content: 'Второй закон Ньютона: F = ma\n\nЗакон сохранения энергии: E = mc²\n\nСкорость света: c = 3×10⁸ м/с\n\nЗакон Ома: I = U/R',
        tag: 'Физика',
        updatedAt: Date.now() - 1000 * 60 * 30,
      },
      {
        id: 'note-2',
        title: 'Конспект по истории',
        content: 'Первая мировая война (1914–1918)\n\nПричины:\n- Убийство эрцгерцога Франца Фердинанда\n- Обострение противоречий между державами\n- Гонка вооружений',
        tag: 'История',
        updatedAt: Date.now() - 1000 * 60 * 60 * 2,
      },
      {
        id: 'note-3',
        title: 'Разбор задач по математике',
        content: 'Квадратное уравнение: ax² + bx + c = 0\n\nДискриминант: D = b² - 4ac\n\nКорни: x = (-b ± √D) / 2a\n\nПример: x² - 5x + 6 = 0\nD = 25 - 24 = 1\nx₁ = 3, x₂ = 2',
        tag: 'Математика',
        updatedAt: Date.now() - 1000 * 60 * 60 * 5,
      },
      {
        id: 'note-4',
        title: 'Стихи для заучивания',
        content: 'Мороз и солнце; день чудесный!\nЕщё ты дремлешь, друг прелестный –\nПора, красавица, проснись:\nОткрой сомкнуты негой взоры\nНавстречу северной Авроры,\nЗвездою севера явись!\n\n— А.С. Пушкин',
        tag: 'Литература',
        updatedAt: Date.now() - 1000 * 60 * 60 * 24,
      },
    ];
  }

  saveNotes() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.notes));
  }

  createNote() {
    const note = {
      id: 'note-' + Date.now(),
      title: '',
      content: '',
      tag: 'Другое',
      updatedAt: Date.now(),
    };
    this.notes.unshift(note);
    this.saveNotes();
    return note;
  }

  deleteNote(id) {
    this.notes = this.notes.filter(n => n.id !== id);
    this.saveNotes();
  }

  updateNote(id, fields) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    Object.assign(note, fields, { updatedAt: Date.now() });
    // Move to top
    this.notes = [note, ...this.notes.filter(n => n.id !== id)];
    this.saveNotes();
  }

  getFiltered(query) {
    if (!query) return this.notes;
    const q = query.toLowerCase();
    return this.notes.filter(n =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }

  formatDate(ts) {
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHr = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} мин. назад`;
    if (diffHr < 24) return `${diffHr} ч. назад`;
    if (diffDay < 7) return `${diffDay} дн. назад`;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  wordCount(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  // ===== Desktop Rendering =====
  renderNotesList(query = '') {
    const list = document.getElementById('notes-list');
    if (!list) return;
    const notes = this.getFiltered(query);
    if (notes.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:32px 16px;"><p class="empty-state-title">Нет заметок</p><p class="empty-state-text">Создай первую заметку</p></div>`;
      return;
    }
    list.innerHTML = notes.map(note => {
      const tag = TAGS_COLORS[note.tag] || TAGS_COLORS['Другое'];
      const isActive = note.id === this.activeNoteId;
      return `
        <div class="note-item ${isActive ? 'active' : ''}" data-id="${note.id}">
          <div class="note-item-title">${note.title || 'Без названия'}</div>
          <div class="note-item-preview">${note.content.slice(0, 60) || 'Пустая заметка'}</div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:5px;">
            <span class="note-tag" style="background:rgba(${tag.bg},0.12); color:rgb(${tag.bg});">${tag.label}</span>
            <span class="note-item-date">${this.formatDate(note.updatedAt)}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  openNote(id) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    this.activeNoteId = id;

    const editorArea = document.getElementById('note-editor');
    const emptyArea = document.getElementById('empty-editor');
    if (editorArea) editorArea.style.display = 'flex';
    if (emptyArea) emptyArea.style.display = 'none';

    const titleEl = document.getElementById('editor-title');
    const contentEl = document.getElementById('editor-content');
    if (titleEl) titleEl.value = note.title;
    if (contentEl) contentEl.value = note.content;

    this.updateWordCount(note.content);
    this.renderNotesList(document.getElementById('search-notes')?.value || '');
  }

  updateWordCount(text) {
    const el = document.getElementById('editor-word-count');
    if (el) el.textContent = `${this.wordCount(text)} слов`;
    const mob = document.getElementById('mobile-word-count');
    if (mob) mob.textContent = `${this.wordCount(text)} слов`;
  }

  scheduleSave(id, title, content) {
    clearTimeout(this.saveTimer);
    const statusEl = document.getElementById('editor-save-status');
    if (statusEl) statusEl.textContent = 'Сохранение...';
    this.saveTimer = setTimeout(() => {
      this.updateNote(id, { title, content });
      if (statusEl) statusEl.textContent = 'Сохранено';
      this.renderNotesList(document.getElementById('search-notes')?.value || '');
    }, 600);
  }

  initDesktop() {
    const newBtn = document.getElementById('new-note-btn');
    const createFirstBtn = document.getElementById('create-first-note');
    const deleteBtn = document.getElementById('delete-note-btn');
    const searchEl = document.getElementById('search-notes');
    const titleEl = document.getElementById('editor-title');
    const contentEl = document.getElementById('editor-content');

    const editorArea = document.getElementById('note-editor');
    const emptyArea = document.getElementById('empty-editor');

    if (this.notes.length === 0) {
      if (editorArea) editorArea.style.display = 'none';
      if (emptyArea) emptyArea.style.display = 'flex';
    } else {
      if (emptyArea) emptyArea.style.display = 'none';
      this.openNote(this.notes[0].id);
    }

    newBtn?.addEventListener('click', () => {
      const note = this.createNote();
      this.renderNotesList();
      this.openNote(note.id);
    });

    createFirstBtn?.addEventListener('click', () => {
      const note = this.createNote();
      this.renderNotesList();
      this.openNote(note.id);
    });

    deleteBtn?.addEventListener('click', () => {
      if (!this.activeNoteId) return;
      if (!confirm('Удалить эту заметку?')) return;
      this.deleteNote(this.activeNoteId);
      this.activeNoteId = null;
      this.renderNotesList();
      if (this.notes.length > 0) {
        this.openNote(this.notes[0].id);
      } else {
        if (editorArea) editorArea.style.display = 'none';
        if (emptyArea) emptyArea.style.display = 'flex';
      }
    });

    searchEl?.addEventListener('input', (e) => {
      this.renderNotesList(e.target.value);
    });

    document.getElementById('notes-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.note-item');
      if (!item) return;
      this.openNote(item.dataset.id);
    });

    titleEl?.addEventListener('input', () => {
      if (!this.activeNoteId) return;
      this.scheduleSave(this.activeNoteId, titleEl.value, contentEl?.value || '');
    });

    contentEl?.addEventListener('input', () => {
      if (!this.activeNoteId) return;
      this.updateWordCount(contentEl.value);
      this.scheduleSave(this.activeNoteId, titleEl?.value || '', contentEl.value);
    });

    // Toolbar
    document.querySelector('.editor-toolbar')?.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cmd]');
      if (!btn || !this.activeNoteId) return;
      const cmd = btn.dataset.cmd;
      const noteEl = document.getElementById('editor-content');
      if (!noteEl) return;

      const start = noteEl.selectionStart;
      const end = noteEl.selectionEnd;
      const sel = noteEl.value.substring(start, end);
      let wrap = '';

      if (cmd === 'bold') wrap = `**${sel}**`;
      else if (cmd === 'italic') wrap = `_${sel}_`;
      else if (cmd === 'underline') wrap = `__${sel}__`;
      else if (cmd === 'h2') wrap = `\n## ${sel}`;
      else if (cmd === 'h3') wrap = `\n### ${sel}`;
      else if (cmd === 'ul') wrap = `\n- ${sel}`;
      else if (cmd === 'ol') wrap = `\n1. ${sel}`;
      else if (cmd.startsWith('tag-')) {
        const tagMap = { 'tag-math': 'Математика', 'tag-physics': 'Физика' };
        const tag = tagMap[cmd];
        if (tag) this.updateNote(this.activeNoteId, { tag });
        return;
      }

      noteEl.value = noteEl.value.substring(0, start) + wrap + noteEl.value.substring(end);
      noteEl.focus();
      this.scheduleSave(this.activeNoteId, titleEl?.value || '', noteEl.value);
    });

    this.renderNotesList();
  }

  // ===== Mobile =====
  renderMobileList(query = '') {
    const list = document.getElementById('mobile-notes-list');
    if (!list) return;
    const notes = this.getFiltered(query);
    if (notes.length === 0) {
      list.innerHTML = `<div class="empty-state"><svg viewBox="0 0 24 24" fill="none"><path d="M4 4H20C20.55 4 21 4.45 21 5V19C21 19.55 20.55 20 20 20H4C3.45 20 3 19.55 3 19V5C3 4.45 3.45 4 4 4Z" stroke="currentColor" stroke-width="1.5"/></svg><p class="empty-state-title">Нет заметок</p><p class="empty-state-text">Нажми + чтобы создать</p></div>`;
      return;
    }
    list.innerHTML = notes.map(note => {
      const tag = TAGS_COLORS[note.tag] || TAGS_COLORS['Другое'];
      return `
        <div class="notebook-mobile-item" data-id="${note.id}">
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:5px;">
            <span style="font-size:0.88rem; font-weight:600;">${note.title || 'Без названия'}</span>
            <span style="font-size:0.68rem; color:var(--text-tertiary);">${this.formatDate(note.updatedAt)}</span>
          </div>
          <p style="font-size:0.8rem; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${note.content.slice(0,80) || 'Пустая заметка'}</p>
          <span class="note-tag" style="background:rgba(${tag.bg},0.12); color:rgb(${tag.bg}); margin-top:6px;">${tag.label}</span>
        </div>
      `;
    }).join('');
  }

  openMobileNote(id) {
    const note = this.notes.find(n => n.id === id);
    if (!note) return;
    this.activeNoteId = id;

    const listView = document.getElementById('mobile-list-view');
    const editorView = document.getElementById('mobile-editor-view');
    if (listView) listView.style.display = 'none';
    if (editorView) editorView.classList.add('active');

    const titleEl = document.getElementById('mobile-editor-title');
    const contentEl = document.getElementById('mobile-editor-content');
    if (titleEl) titleEl.value = note.title;
    if (contentEl) contentEl.value = note.content;
    this.updateWordCount(note.content);
  }

  closeMobileEditor() {
    const listView = document.getElementById('mobile-list-view');
    const editorView = document.getElementById('mobile-editor-view');
    if (listView) listView.style.display = 'block';
    if (editorView) editorView.classList.remove('active');
    this.activeNoteId = null;
    this.renderMobileList();
  }

  initMobile() {
    this.renderMobileList();

    document.getElementById('new-note-fab')?.addEventListener('click', () => {
      const note = this.createNote();
      this.openMobileNote(note.id);
    });

    document.getElementById('new-note-mobile')?.addEventListener('click', () => {
      const note = this.createNote();
      this.openMobileNote(note.id);
    });

    document.getElementById('mobile-back-btn')?.addEventListener('click', () => {
      this.closeMobileEditor();
    });

    document.getElementById('mobile-notes-list')?.addEventListener('click', (e) => {
      const item = e.target.closest('.notebook-mobile-item');
      if (!item) return;
      this.openMobileNote(item.dataset.id);
    });

    document.getElementById('mobile-editor-title')?.addEventListener('input', (e) => {
      if (!this.activeNoteId) return;
      const content = document.getElementById('mobile-editor-content')?.value || '';
      this.scheduleSave(this.activeNoteId, e.target.value, content);
    });

    document.getElementById('mobile-editor-content')?.addEventListener('input', (e) => {
      if (!this.activeNoteId) return;
      this.updateWordCount(e.target.value);
      const title = document.getElementById('mobile-editor-title')?.value || '';
      this.scheduleSave(this.activeNoteId, title, e.target.value);
    });

    document.getElementById('delete-note-mobile')?.addEventListener('click', () => {
      if (!this.activeNoteId) return;
      if (!confirm('Удалить эту заметку?')) return;
      this.deleteNote(this.activeNoteId);
      this.closeMobileEditor();
    });

    document.getElementById('search-notes-mobile')?.addEventListener('input', (e) => {
      this.renderMobileList(e.target.value);
    });
  }

  init() {
    const checkMobile = () => window.innerWidth < 768;
    if (checkMobile()) {
      this.initMobile();
    } else {
      this.initDesktop();
    }
    window.addEventListener('resize', () => {
      const nowMobile = checkMobile();
      if (nowMobile !== this.isMobile) {
        this.isMobile = nowMobile;
        if (nowMobile) this.initMobile(); else this.initDesktop();
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new NotebookApp();
});

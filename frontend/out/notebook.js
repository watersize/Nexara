const NOTEBOOK_KEY = 'nexara-notes';

const TAGS = {
  'Математика': { bg: '59,130,246', label: 'Математика' },
  'Физика': { bg: '168,85,247', label: 'Физика' },
  'История': { bg: '245,158,11', label: 'История' },
  'Литература': { bg: '16,185,129', label: 'Литература' },
  'Другое': { bg: '100,116,139', label: 'Другое' },
};

class NotebookWorkspace {
  constructor() {
    this.notes = this.loadNotes();
    this.activeNoteId = this.notes[0]?.id || null;
    this.saveTimer = null;
    this.init();
  }

  loadNotes() {
    try {
      return JSON.parse(localStorage.getItem(NOTEBOOK_KEY)) || this.defaultNotes();
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
        updatedAt: Date.now() - 30 * 60 * 1000,
      },
      {
        id: 'note-2',
        title: 'Конспект по истории',
        content: 'Первая мировая война (1914-1918)\n\nПричины:\n- борьба за колонии\n- гонка вооружений',
        tag: 'История',
        updatedAt: Date.now() - 2 * 60 * 60 * 1000,
      },
    ];
  }

  saveNotes() {
    localStorage.setItem(NOTEBOOK_KEY, JSON.stringify(this.notes));
  }

  createNote() {
    const note = {
      id: `note-${Date.now()}`,
      title: 'Новая заметка',
      content: '',
      tag: 'Другое',
      updatedAt: Date.now(),
    };
    this.notes.unshift(note);
    this.activeNoteId = note.id;
    this.saveNotes();
    this.render();
  }

  deleteNote() {
    if (!this.activeNoteId) return;
    if (!window.confirm('Удалить эту заметку?')) return;
    this.notes = this.notes.filter((note) => note.id !== this.activeNoteId);
    this.activeNoteId = this.notes[0]?.id || null;
    this.saveNotes();
    this.render();
  }

  setTag(tag) {
    const note = this.notes.find((item) => item.id === this.activeNoteId);
    if (!note) return;
    note.tag = tag;
    note.updatedAt = Date.now();
    this.saveNotes();
    this.renderList();
  }

  updateActive(fields) {
    const note = this.notes.find((item) => item.id === this.activeNoteId);
    if (!note) return;
    Object.assign(note, fields, { updatedAt: Date.now() });
    this.notes = [note, ...this.notes.filter((item) => item.id !== note.id)];
    this.activeNoteId = note.id;
    this.saveNotes();
    this.renderList();
    this.updateStatus(note.content);
  }

  formatTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.max(1, Math.floor(diff / 60000));
    if (minutes < 60) return `${minutes} мин. назад`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours} ч. назад`;
    return `${Math.floor(hours / 24)} дн. назад`;
  }

  wordCount(text) {
    return text.trim() ? text.trim().split(/\s+/).length : 0;
  }

  getFilteredNotes() {
    const query = (document.getElementById('search-notes')?.value || '').toLowerCase();
    if (!query) return this.notes;
    return this.notes.filter((note) => `${note.title} ${note.content}`.toLowerCase().includes(query));
  }

  renderList() {
    const list = document.getElementById('notes-list');
    const notes = this.getFilteredNotes();
    list.innerHTML = notes.map((note) => {
      const tag = TAGS[note.tag] || TAGS['Другое'];
      return `
        <button class="note-item ${note.id === this.activeNoteId ? 'active' : ''}" data-note-id="${note.id}">
          <div class="note-item-title">${note.title || 'Без названия'}</div>
          <div class="note-item-preview">${note.content.slice(0, 90) || 'Пустая заметка'}</div>
          <div style="display:flex; align-items:center; justify-content:space-between; margin-top:6px;">
            <span class="note-tag" style="background:rgba(${tag.bg},0.12); color:rgb(${tag.bg});">${tag.label}</span>
            <span class="note-item-date">${this.formatTime(note.updatedAt)}</span>
          </div>
        </button>
      `;
    }).join('');
  }

  renderEditor() {
    const note = this.notes.find((item) => item.id === this.activeNoteId);
    if (!note) return;
    document.getElementById('editor-title').value = note.title;
    document.getElementById('editor-content').value = note.content;
    this.updateStatus(note.content);
  }

  updateStatus(text) {
    document.getElementById('editor-word-count').textContent = `${this.wordCount(text)} слов`;
    document.getElementById('editor-save-status').textContent = 'Сохранено';
  }

  applyFormat(command) {
    const textarea = document.getElementById('editor-content');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    const selected = value.slice(start, end) || 'текст';
    let replacement = selected;

    if (command === 'bold') replacement = `**${selected}**`;
    if (command === 'italic') replacement = `*${selected}*`;
    if (command === 'underline') replacement = `__${selected}__`;
    if (command === 'h2') replacement = `\n## ${selected}`;
    if (command === 'h3') replacement = `\n### ${selected}`;
    if (command === 'ul') replacement = `\n- ${selected}`;
    if (command === 'ol') replacement = `\n1. ${selected}`;

    textarea.value = `${value.slice(0, start)}${replacement}${value.slice(end)}`;
    this.updateActive({ content: textarea.value, title: document.getElementById('editor-title').value });
    textarea.focus();
  }

  bindEvents() {
    document.getElementById('new-note-btn').addEventListener('click', () => this.createNote());
    document.getElementById('delete-note-btn').addEventListener('click', () => this.deleteNote());

    document.getElementById('notes-list').addEventListener('click', (event) => {
      const item = event.target.closest('[data-note-id]');
      if (!item) return;
      this.activeNoteId = item.dataset.noteId;
      this.render();
    });

    document.getElementById('search-notes').addEventListener('input', () => this.renderList());

    document.getElementById('editor-title').addEventListener('input', (event) => {
      clearTimeout(this.saveTimer);
      document.getElementById('editor-save-status').textContent = 'Сохранение...';
      this.saveTimer = setTimeout(() => {
        this.updateActive({
          title: event.target.value,
          content: document.getElementById('editor-content').value,
        });
      }, 250);
    });

    document.getElementById('editor-content').addEventListener('input', (event) => {
      clearTimeout(this.saveTimer);
      document.getElementById('editor-save-status').textContent = 'Сохранение...';
      this.saveTimer = setTimeout(() => {
        this.updateActive({
          title: document.getElementById('editor-title').value,
          content: event.target.value,
        });
      }, 250);
    });

    document.querySelector('.editor-toolbar').addEventListener('click', (event) => {
      const button = event.target.closest('[data-cmd]');
      if (!button) return;
      const command = button.dataset.cmd;
      if (command === 'tag-math') return this.setTag('Математика');
      if (command === 'tag-physics') return this.setTag('Физика');
      this.applyFormat(command);
    });
  }

  render() {
    this.renderList();
    this.renderEditor();
  }

  init() {
    this.render();
    this.bindEvents();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new NotebookWorkspace();
});

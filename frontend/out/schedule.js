const SCHEDULE_KEY = 'nexara-schedule-v2';

const DAYS_SHORT = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const DAYS_FULL = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье'];
const DEFAULT_TIMES = [
  ['08:30', '09:15'],
  ['09:25', '10:10'],
  ['10:25', '11:10'],
  ['11:25', '12:10'],
  ['12:30', '13:15'],
  ['13:25', '14:10'],
  ['14:20', '15:05'],
];

function loadSchedule() {
  try {
    return JSON.parse(localStorage.getItem(SCHEDULE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveSchedule(data) {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(data));
}

function getWeekStart(baseDate, weekOffset) {
  const now = new Date(baseDate);
  const weekday = now.getDay() === 0 ? 6 : now.getDay() - 1;
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - weekday + weekOffset * 7);
  return now;
}

function getWeekDates(baseDate, weekOffset) {
  const start = getWeekStart(baseDate, weekOffset);
  return DAYS_SHORT.map((_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function weekKey(date) {
  const start = getWeekStart(date, 0);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
}

function formatShort(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatLong(date) {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

class ScheduleWorkspace {
  constructor() {
    this.storage = loadSchedule();
    this.currentDate = new Date();
    this.weekOffset = 0;
    this.selectedDay = Math.max(0, (this.currentDate.getDay() || 7) - 1);
    this.builderDay = this.selectedDay;
    this.builderLessons = [];
    this.init();
  }

  getCurrentWeekDates() {
    return getWeekDates(this.currentDate, this.weekOffset);
  }

  getCurrentWeekKey() {
    const dates = this.getCurrentWeekDates();
    return weekKey(dates[0]);
  }

  getLessons(dayIndex) {
    const week = this.storage[this.getCurrentWeekKey()] || {};
    return week[dayIndex] || [];
  }

  setLessons(dayIndex, lessons) {
    const key = this.getCurrentWeekKey();
    if (!this.storage[key]) this.storage[key] = {};
    this.storage[key][dayIndex] = lessons;
    saveSchedule(this.storage);
  }

  renderWeekHeader() {
    const dates = this.getCurrentWeekDates();
    const range = `${formatShort(dates[0])} - ${dates[6].toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}`;
    document.getElementById('week-label').textContent = range;
    document.getElementById('week-range-chip').textContent = range;
  }

  renderDayButtons() {
    const dates = this.getCurrentWeekDates();
    const container = document.getElementById('day-selector');
    container.innerHTML = dates.map((date, index) => `
      <button class="schedule-day-btn ${this.selectedDay === index ? 'active' : ''}" data-day="${index}">
        <div class="schedule-day-btn-short">${DAYS_SHORT[index]}</div>
        <div class="schedule-day-btn-number">${date.getDate()}</div>
        <div class="schedule-day-btn-short schedule-day-btn-bottom">${DAYS_SHORT[index]}</div>
      </button>
    `).join('');
  }

  renderSummary() {
    const dates = this.getCurrentWeekDates();
    const selectedDate = dates[this.selectedDay];
    const lessons = this.getLessons(this.selectedDay);

    document.getElementById('selected-day-name').textContent = DAYS_FULL[this.selectedDay];
    document.getElementById('selected-day-date').textContent = formatLong(selectedDate);
    document.getElementById('lessons-count').textContent = String(lessons.length);
    document.getElementById('detail-title').textContent = `${DAYS_FULL[this.selectedDay]}, ${formatLong(selectedDate)}`;

    const stepTitle = document.getElementById('step-title');
    const stepSubtitle = document.getElementById('step-subtitle');
    if (lessons.length) {
      stepTitle.textContent = 'Проверь уроки';
      stepSubtitle.textContent = 'Если нужно, открой конструктор и поправь порядок или детали.';
    } else {
      stepTitle.textContent = 'Собери день';
      stepSubtitle.textContent = 'Добавь первый урок через кнопку справа.';
    }
  }

  renderLessons() {
    const list = document.getElementById('lessons-list');
    const lessons = this.getLessons(this.selectedDay);

    if (!lessons.length) {
      list.innerHTML = `
        <div class="schedule-empty-state">
          <div class="schedule-empty-icon">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </div>
          <div class="empty-state-title">На этот день пока нет уроков</div>
          <div class="empty-state-text">Нажми на круглую кнопку справа и собери расписание в конструкторе.</div>
        </div>
      `;
      return;
    }

    list.innerHTML = lessons.map((lesson, index) => `
      <article class="schedule-lesson-card">
        <div class="schedule-lesson-top">
          <div class="schedule-lesson-meta">${index + 1} урок · ${lesson.start} - ${lesson.end}${lesson.room ? ` · каб. ${lesson.room}` : ''}</div>
          <button class="lesson-action-btn" data-delete="${index}" title="Удалить урок">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M3 6H21M8 6V4H16V6M19 6L18 20C18 21.1 17.1 22 16 22H8C6.9 22 6 21.1 6 20L5 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div class="schedule-lesson-title">${lesson.subject || 'Без названия'}</div>
        <div class="schedule-lesson-pills">
          <span class="schedule-lesson-pill">${lesson.teacher || 'Учитель не указан'}</span>
        </div>
        ${lesson.notes ? `<div class="schedule-lesson-notes">${lesson.notes}</div>` : ''}
      </article>
    `).join('');
  }

  openBuilder() {
    this.builderDay = this.selectedDay;
    this.builderLessons = this.getLessons(this.builderDay).map((lesson) => ({ ...lesson }));
    if (!this.builderLessons.length) {
      this.builderLessons = [this.makeLesson(0)];
    }
    document.getElementById('modal-backdrop').classList.add('open');
    this.renderBuilderDays();
    this.renderBuilder();
  }

  closeBuilder() {
    document.getElementById('modal-backdrop').classList.remove('open');
  }

  makeLesson(index) {
    const slot = DEFAULT_TIMES[index] || ['', ''];
    return {
      subject: '',
      start: slot[0],
      end: slot[1],
      teacher: '',
      room: '',
      notes: '',
      materials: '',
    };
  }

  renderBuilderDays() {
    const dates = this.getCurrentWeekDates();
    const grid = document.getElementById('builder-day-grid');
    grid.innerHTML = dates.map((date, index) => `
      <button class="schedule-builder-day ${this.builderDay === index ? 'active' : ''}" data-builder-day="${index}">
        <div class="schedule-day-btn-short">${DAYS_SHORT[index]}</div>
        <div class="schedule-day-btn-number">${date.getDate()}</div>
        <div class="schedule-builder-day-name">${DAYS_FULL[index]}</div>
      </button>
    `).join('');
  }

  renderBuilder() {
    document.getElementById('builder-selected-day').textContent = DAYS_FULL[this.builderDay];
    document.getElementById('builder-editor').style.display = 'block';

    const list = document.getElementById('builder-lessons-list');
    list.innerHTML = this.builderLessons.map((lesson, index) => `
      <div class="schedule-builder-card">
        <div class="schedule-builder-card-head">
          <div class="schedule-builder-card-title">${lesson.subject || `Урок ${index + 1}`}</div>
          <div class="schedule-builder-card-actions">
            <button class="lesson-action-btn" data-move-up="${index}" title="Поднять">↑</button>
            <button class="lesson-action-btn" data-move-down="${index}" title="Опустить">↓</button>
            <button class="lesson-action-btn" data-remove-builder="${index}" title="Удалить">×</button>
          </div>
        </div>
        <div class="schedule-builder-grid">
          <div class="form-group">
            <label class="form-label">Предмет</label>
            <input class="form-input" data-field="subject" data-index="${index}" value="${lesson.subject || ''}" placeholder="Например: География">
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Начало</label>
              <input class="form-input" type="time" data-field="start" data-index="${index}" value="${lesson.start || ''}">
            </div>
            <div class="form-group">
              <label class="form-label">Конец</label>
              <input class="form-input" type="time" data-field="end" data-index="${index}" value="${lesson.end || ''}">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Учитель</label>
              <input class="form-input" data-field="teacher" data-index="${index}" value="${lesson.teacher || ''}" placeholder="Например: Петрова И.А.">
            </div>
            <div class="form-group">
              <label class="form-label">Кабинет</label>
              <input class="form-input" data-field="room" data-index="${index}" value="${lesson.room || ''}" placeholder="Например: 203">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Задание или заметка</label>
            <textarea class="form-input schedule-textarea" data-field="notes" data-index="${index}" placeholder="Например: повторить параграф, решить задачу">${lesson.notes || ''}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">Материалы</label>
            <textarea class="form-input schedule-textarea" data-field="materials" data-index="${index}" placeholder="Каждый материал с новой строки">${lesson.materials || ''}</textarea>
          </div>
        </div>
      </div>
    `).join('');
  }

  bindEvents() {
    document.getElementById('day-selector').addEventListener('click', (event) => {
      const button = event.target.closest('[data-day]');
      if (!button) return;
      this.selectedDay = Number(button.dataset.day);
      this.renderDayButtons();
      this.renderSummary();
      this.renderLessons();
    });

    document.getElementById('prev-week').addEventListener('click', () => {
      this.weekOffset -= 1;
      this.renderAll();
    });

    document.getElementById('next-week').addEventListener('click', () => {
      this.weekOffset += 1;
      this.renderAll();
    });

    document.getElementById('open-builder-btn').addEventListener('click', () => this.openBuilder());
    document.getElementById('close-modal-btn').addEventListener('click', () => this.closeBuilder());
    document.getElementById('cancel-builder-btn').addEventListener('click', () => this.closeBuilder());
    document.getElementById('back-to-day-select').addEventListener('click', () => {
      document.getElementById('builder-editor').style.display = 'none';
    });

    document.getElementById('modal-backdrop').addEventListener('click', (event) => {
      if (event.target === event.currentTarget) this.closeBuilder();
    });

    document.getElementById('builder-day-grid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-builder-day]');
      if (!button) return;
      this.builderDay = Number(button.dataset.builderDay);
      this.builderLessons = this.getLessons(this.builderDay).map((lesson) => ({ ...lesson }));
      if (!this.builderLessons.length) this.builderLessons = [this.makeLesson(0)];
      this.renderBuilderDays();
      this.renderBuilder();
    });

    document.getElementById('add-lesson-row-btn').addEventListener('click', () => {
      this.builderLessons.push(this.makeLesson(this.builderLessons.length));
      this.renderBuilder();
    });

    document.getElementById('builder-lessons-list').addEventListener('input', (event) => {
      const field = event.target.dataset.field;
      const index = Number(event.target.dataset.index);
      if (!field || Number.isNaN(index)) return;
      this.builderLessons[index][field] = event.target.value;
    });

    document.getElementById('builder-lessons-list').addEventListener('click', (event) => {
      const up = event.target.closest('[data-move-up]');
      const down = event.target.closest('[data-move-down]');
      const remove = event.target.closest('[data-remove-builder]');

      if (up) {
        const index = Number(up.dataset.moveUp);
        if (index > 0) {
          [this.builderLessons[index - 1], this.builderLessons[index]] = [this.builderLessons[index], this.builderLessons[index - 1]];
          this.renderBuilder();
        }
      }

      if (down) {
        const index = Number(down.dataset.moveDown);
        if (index < this.builderLessons.length - 1) {
          [this.builderLessons[index + 1], this.builderLessons[index]] = [this.builderLessons[index], this.builderLessons[index + 1]];
          this.renderBuilder();
        }
      }

      if (remove) {
        const index = Number(remove.dataset.removeBuilder);
        this.builderLessons.splice(index, 1);
        if (!this.builderLessons.length) this.builderLessons = [this.makeLesson(0)];
        this.renderBuilder();
      }
    });

    document.getElementById('save-builder-btn').addEventListener('click', () => {
      const lessons = this.builderLessons
        .map((lesson) => ({
          ...lesson,
          subject: (lesson.subject || '').trim(),
          teacher: (lesson.teacher || '').trim(),
          room: (lesson.room || '').trim(),
          notes: (lesson.notes || '').trim(),
          materials: (lesson.materials || '').trim(),
        }))
        .filter((lesson) => lesson.subject || lesson.start || lesson.end || lesson.teacher || lesson.notes);

      this.setLessons(this.builderDay, lessons);
      this.selectedDay = this.builderDay;
      this.closeBuilder();
      this.renderAll();
    });

    document.getElementById('lessons-list').addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete]');
      if (!button) return;
      const index = Number(button.dataset.delete);
      const lessons = this.getLessons(this.selectedDay).slice();
      lessons.splice(index, 1);
      this.setLessons(this.selectedDay, lessons);
      this.renderAll();
    });
  }

  renderAll() {
    this.renderWeekHeader();
    this.renderDayButtons();
    this.renderSummary();
    this.renderLessons();
    this.renderBuilderDays();
  }

  init() {
    this.renderAll();
    this.bindEvents();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScheduleWorkspace();
});

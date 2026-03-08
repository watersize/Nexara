// ===== Schedule Data =====
// Keys: 0=Пн, 1=Вт, 2=Ср, 3=Чт, 4=Пт, 5=Сб, 6=Вс
const scheduleData = {
  0: [
    { name: 'Математика', time: '08:00', endTime: '08:45', teacher: 'Иванова А.П.', room: '301', color: '59, 130, 246' },
    { name: 'Русский язык', time: '09:00', endTime: '09:45', teacher: 'Петрова М.С.', room: '205', color: '16, 185, 129' },
    { name: 'Физика', time: '10:00', endTime: '10:45', teacher: 'Сидоров К.Н.', room: '312', color: '168, 85, 247' },
    { name: 'История', time: '11:00', endTime: '11:45', teacher: 'Козлова Е.В.', room: '208', color: '245, 158, 11' },
    { name: 'Английский язык', time: '12:00', endTime: '12:45', teacher: 'Смирнова О.Д.', room: '104', color: '236, 72, 153' },
    { name: 'Физкультура', time: '13:00', endTime: '13:45', teacher: 'Волков Д.А.', room: 'Спортзал', color: '239, 68, 68' },
  ],
  1: [
    { name: 'Литература', time: '08:00', endTime: '08:45', teacher: 'Петрова М.С.', room: '205', color: '16, 185, 129' },
    { name: 'Алгебра', time: '09:00', endTime: '09:45', teacher: 'Иванова А.П.', room: '301', color: '59, 130, 246' },
    { name: 'География', time: '10:00', endTime: '10:45', teacher: 'Новикова Л.М.', room: '210', color: '20, 184, 166' },
    { name: 'Биология', time: '11:00', endTime: '11:45', teacher: 'Белова Н.Г.', room: '315', color: '34, 197, 94' },
    { name: 'Химия', time: '12:00', endTime: '12:45', teacher: 'Орлов В.П.', room: '318', color: '249, 115, 22' },
  ],
  2: [
    { name: 'Геометрия', time: '08:00', endTime: '08:45', teacher: 'Иванова А.П.', room: '301', color: '59, 130, 246' },
    { name: 'Информатика', time: '09:00', endTime: '09:45', teacher: 'Морозов И.С.', room: '401', color: '99, 102, 241' },
    { name: 'Обществознание', time: '10:00', endTime: '10:45', teacher: 'Козлова Е.В.', room: '208', color: '245, 158, 11' },
    { name: 'Русский язык', time: '11:00', endTime: '11:45', teacher: 'Петрова М.С.', room: '205', color: '16, 185, 129' },
    { name: 'ОБЖ', time: '12:00', endTime: '12:45', teacher: 'Соколов Р.Т.', room: '102', color: '107, 114, 128' },
    { name: 'Технология', time: '13:00', endTime: '13:45', teacher: 'Кузнецов А.М.', room: 'Мастерская', color: '168, 85, 247' },
  ],
  3: [
    { name: 'Физика', time: '08:00', endTime: '08:45', teacher: 'Сидоров К.Н.', room: '312', color: '168, 85, 247' },
    { name: 'Английский язык', time: '09:00', endTime: '09:45', teacher: 'Смирнова О.Д.', room: '104', color: '236, 72, 153' },
    { name: 'Математика', time: '10:00', endTime: '10:45', teacher: 'Иванова А.П.', room: '301', color: '59, 130, 246' },
    { name: 'История', time: '11:00', endTime: '11:45', teacher: 'Козлова Е.В.', room: '208', color: '245, 158, 11' },
    { name: 'Музыка', time: '12:00', endTime: '12:45', teacher: 'Лебедева С.Ю.', room: '109', color: '236, 72, 153' },
  ],
  4: [
    { name: 'Алгебра', time: '08:00', endTime: '08:45', teacher: 'Иванова А.П.', room: '301', color: '59, 130, 246' },
    { name: 'Литература', time: '09:00', endTime: '09:45', teacher: 'Петрова М.С.', room: '205', color: '16, 185, 129' },
    { name: 'Химия', time: '10:00', endTime: '10:45', teacher: 'Орлов В.П.', room: '318', color: '249, 115, 22' },
    { name: 'Физкультура', time: '11:00', endTime: '11:45', teacher: 'Волков Д.А.', room: 'Спортзал', color: '239, 68, 68' },
  ],
  5: [], // Суббота — выходной
  6: [], // Воскресенье — выходной
};

// Allow local edits stored in localStorage
const SCHEDULE_KEY = 'nexara-schedule';

function loadSchedule() {
  try {
    const raw = localStorage.getItem(SCHEDULE_KEY);
    return raw ? JSON.parse(raw) : scheduleData;
  } catch {
    return scheduleData;
  }
}

function saveSchedule(data) {
  localStorage.setItem(SCHEDULE_KEY, JSON.stringify(data));
}

// ===== Schedule App =====
class ScheduleApp {
  constructor() {
    this.data = loadSchedule();
    this.currentDate = new Date();
    // JS getDay(): 0=Вс, 1=Пн ... 6=Сб. Our index: 0=Пн ... 6=Вс
    const jsDay = this.currentDate.getDay();
    this.selectedDay = jsDay === 0 ? 6 : jsDay - 1; // convert
    this.weekOffset = 0;
    this.editingLesson = null;
    this.init();
  }

  getWeekDates() {
    const date = new Date(this.currentDate);
    date.setDate(date.getDate() + this.weekOffset * 7);
    const week = [];
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date);
    monday.setDate(diff);
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      week.push(d);
    }
    return week;
  }

  updateWeekLabel() {
    const el = document.getElementById('week-label');
    if (!el) return;
    const weekDates = this.getWeekDates();
    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
    const first = weekDates[0];
    const last = weekDates[6];
    if (first.getMonth() === last.getMonth()) {
      el.textContent = `${first.getDate()} – ${last.getDate()} ${months[first.getMonth()]} ${first.getFullYear()}`;
    } else {
      el.textContent = `${first.getDate()} ${months[first.getMonth()]} – ${last.getDate()} ${months[last.getMonth()]}`;
    }
  }

  renderDaySelector() {
    const container = document.getElementById('day-selector');
    if (!container) return;
    const weekDates = this.getWeekDates();
    const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
    const todayStr = new Date().toDateString();

    container.innerHTML = weekDates.map((date, i) => {
      const isActive = this.selectedDay === i;
      const isToday = date.toDateString() === todayStr;
      return `
        <button class="day-btn ${isActive ? 'active' : ''} ${isToday && !isActive ? 'today' : ''}" data-day="${i}">
          <span class="day-name">${days[i]}</span>
          <span class="day-number">${date.getDate()}</span>
        </button>
      `;
    }).join('');
  }

  renderLessons() {
    const container = document.getElementById('lessons-list');
    const dayInfo = document.getElementById('day-info');
    const lessonsCount = document.getElementById('lessons-count');
    const timeRange = document.getElementById('time-range');
    if (!container) return;

    const lessons = this.data[this.selectedDay] || [];
    const dayNames = ['понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];

    if (lessons.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" stroke-width="1.5"/><path d="M16 2V6M8 2V6M3 10H21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          <p class="empty-state-title">Выходной день</p>
          <p class="empty-state-text">Уроков на ${dayNames[this.selectedDay]} нет. Отдыхай!</p>
        </div>
      `;
      if (dayInfo) dayInfo.style.display = 'none';
      return;
    }

    if (dayInfo) dayInfo.style.display = 'flex';
    if (lessonsCount) lessonsCount.textContent = lessons.length;
    if (timeRange) timeRange.textContent = `${lessons[0].time} — ${lessons[lessons.length - 1].endTime}`;

    container.innerHTML = lessons.map((lesson, idx) => `
      <div class="lesson-card" style="--lesson-color: ${lesson.color};" data-day="${this.selectedDay}" data-idx="${idx}">
        <div class="lesson-time">
          <div class="lesson-time-start">${lesson.time}</div>
          <div class="lesson-time-end">${lesson.endTime}</div>
        </div>
        <div class="lesson-content">
          <div class="lesson-name">${lesson.name}</div>
          <div class="lesson-meta">
            <span class="lesson-meta-item">
              <svg viewBox="0 0 24 24" fill="none"><path d="M20 21V19C20 16.79 18.21 15 16 15H8C5.79 15 4 16.79 4 19V21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="12" cy="7" r="4" stroke="currentColor" stroke-width="1.5"/></svg>
              ${lesson.teacher}
            </span>
            <span class="lesson-meta-item">
              <svg viewBox="0 0 24 24" fill="none"><path d="M21 10C21 17 12 23 12 23C12 23 3 17 3 10C3 5.03 7.03 1 12 1C16.97 1 21 5.03 21 10Z" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.5"/></svg>
              ${lesson.room}
            </span>
          </div>
        </div>
        <div class="lesson-actions">
          <button class="lesson-action-btn" data-edit="${idx}" title="Редактировать">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M11 4H4C3.45 4 3 4.45 3 5V20C3 20.55 3.45 21 4 21H19C19.55 21 20 20.55 20 19V12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M18.5 2.5C18.76 2.24 19.12 2.09 19.5 2.09C19.88 2.09 20.24 2.24 20.5 2.5C20.76 2.76 20.91 3.12 20.91 3.5C20.91 3.88 20.76 4.24 20.5 4.5L12 13L9 14L10 11L18.5 2.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </div>
    `).join('');
  }

  openAddModal(editIdx = null) {
    const modal = document.getElementById('modal-backdrop');
    const title = document.getElementById('modal-title');
    if (!modal) return;
    this.editingLesson = editIdx;

    if (editIdx !== null) {
      const lesson = this.data[this.selectedDay][editIdx];
      document.getElementById('lesson-name-input').value = lesson.name;
      document.getElementById('lesson-time-input').value = lesson.time;
      document.getElementById('lesson-endtime-input').value = lesson.endTime;
      document.getElementById('lesson-teacher-input').value = lesson.teacher;
      document.getElementById('lesson-room-input').value = lesson.room;
      if (title) title.textContent = 'Редактировать урок';
    } else {
      document.getElementById('lesson-name-input').value = '';
      document.getElementById('lesson-teacher-input').value = '';
      document.getElementById('lesson-room-input').value = '';
      document.getElementById('lesson-time-input').value = '08:00';
      document.getElementById('lesson-endtime-input').value = '08:45';
      if (title) title.textContent = 'Добавить урок';
    }

    modal.classList.add('open');
    document.getElementById('lesson-name-input')?.focus();
  }

  closeModal() {
    document.getElementById('modal-backdrop')?.classList.remove('open');
    this.editingLesson = null;
  }

  saveLesson() {
    const name = document.getElementById('lesson-name-input')?.value?.trim();
    if (!name) { document.getElementById('lesson-name-input')?.focus(); return; }

    const lesson = {
      name,
      time: document.getElementById('lesson-time-input')?.value || '08:00',
      endTime: document.getElementById('lesson-endtime-input')?.value || '08:45',
      teacher: document.getElementById('lesson-teacher-input')?.value || '',
      room: document.getElementById('lesson-room-input')?.value || '',
      color: '59, 130, 246',
    };

    if (!this.data[this.selectedDay]) this.data[this.selectedDay] = [];

    if (this.editingLesson !== null) {
      this.data[this.selectedDay][this.editingLesson] = lesson;
    } else {
      this.data[this.selectedDay].push(lesson);
      this.data[this.selectedDay].sort((a, b) => a.time.localeCompare(b.time));
    }

    saveSchedule(this.data);
    this.renderLessons();
    this.closeModal();
  }

  bindEvents() {
    document.getElementById('day-selector')?.addEventListener('click', (e) => {
      const btn = e.target.closest('.day-btn');
      if (!btn) return;
      this.selectedDay = parseInt(btn.dataset.day, 10);
      this.renderDaySelector();
      this.renderLessons();
    });

    document.getElementById('prev-week')?.addEventListener('click', () => {
      this.weekOffset--;
      this.updateWeekLabel();
      this.renderDaySelector();
    });

    document.getElementById('next-week')?.addEventListener('click', () => {
      this.weekOffset++;
      this.updateWeekLabel();
      this.renderDaySelector();
    });

    document.getElementById('add-lesson-btn')?.addEventListener('click', () => this.openAddModal());
    document.querySelector('.fab')?.addEventListener('click', () => this.openAddModal());

    document.getElementById('modal-backdrop')?.addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.closeModal();
    });

    document.getElementById('save-lesson-btn')?.addEventListener('click', () => this.saveLesson());

    document.getElementById('lessons-list')?.addEventListener('click', (e) => {
      const editBtn = e.target.closest('[data-edit]');
      if (editBtn) {
        this.openAddModal(parseInt(editBtn.dataset.edit, 10));
      }
    });
  }

  init() {
    this.updateWeekLabel();
    this.renderDaySelector();
    this.renderLessons();
    this.bindEvents();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ScheduleApp();
});

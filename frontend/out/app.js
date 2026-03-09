// Theme management
(function initTheme() {
  const savedTheme = localStorage.getItem('nexara-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = savedTheme || (prefersDark ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);
})();

document.addEventListener('DOMContentLoaded', () => {
  const headerToggle = document.getElementById('theme-toggle');
  const sidebarToggle = document.getElementById('theme-toggle-sidebar');

  const toggleTheme = () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('nexara-theme', next);
  };

  headerToggle?.addEventListener('click', toggleTheme);
  sidebarToggle?.addEventListener('click', toggleTheme);
});

function formatDate(date, format = 'short') {
  const months = [
    'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
    'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
  ];
  const monthsShort = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const days = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

  if (format === 'short') {
    return `${date.getDate()} ${monthsShort[date.getMonth()]}`;
  }
  if (format === 'full') {
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }
  if (format === 'weekday') {
    return days[date.getDay()];
  }
  return date.toLocaleDateString('ru-RU');
}

function getWeekDates(date) {
  const week = [];
  const first = new Date(date);
  const day = first.getDay();
  const diff = first.getDate() - day + (day === 0 ? -6 : 1);
  first.setDate(diff);

  for (let i = 0; i < 7; i++) {
    const current = new Date(first);
    current.setDate(first.getDate() + i);
    week.push(current);
  }

  return week;
}

window.NexaraUtils = {
  formatDate,
  getWeekDates,
};

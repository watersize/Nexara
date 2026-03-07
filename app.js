const tauriApi = window.__TAURI__ || {};
const invoke = tauriApi.core?.invoke
  ? (command, args) => tauriApi.core.invoke(command, args)
  : async (command, args) => mockInvoke(command, args);
const BACKEND_BASE_URL = (document.querySelector('meta[name="nexara-backend-url"]')?.content || "").trim().replace(/\/+$/, "");
const TELEGRAM_BOT_USERNAME = (document.querySelector('meta[name="nexara-telegram-bot"]')?.content || "nexarapush_bot").trim();

const state = {
  days: [],
  subjects: [],
  authSession: null,
  settings: {
    theme: "theme-light",
    hints_enabled: true,
    enable_3d: true,
    reminder_hours: 18,
    telegram_enabled: false,
    telegram_bot_token: "",
    telegram_chat_id: "",
  },
  selectedWeekNumber: 1,
  selectedWeekday: 1,
  selectedDayLabel: "Понедельник",
  selectedSubject: "",
  schedule: [],
  textbooks: [],
  scheduleFile: null,
  chatMessages: [
    { role: "assistant", text: "Спроси про тему, домашнее задание или загруженный учебник." },
  ],
  hints: [
    {
      title: "Умный импорт",
      text: "Вставь обычный текст, фото или PDF с расписанием. Nexara извлечет предметы, кабинеты и время.",
    },
    {
      title: "Учебники в базе",
      text: "Загружай PDF-учебники. Одинаковые файлы хранятся один раз и используются для AI-ответов.",
    },
    {
      title: "AI-чат",
      text: "Чат отвечает через Groq и опирается на расписание, твои материалы и текущий учебный день.",
    },
  ],
  hintIndex: 0,
};

const loadingState = {
  depth: 0,
  watchdog: null,
};

document.addEventListener("DOMContentLoaded", async () => {
  bindUi();
  renderChat();
  cycleHint(false);
  await bootstrap();
});

function bindUi() {
  document.getElementById("openScheduleModalBtn")?.addEventListener("click", () => openModal("scheduleModal"));
  document.getElementById("saveScheduleBtn")?.addEventListener("click", saveSchedule);
  document.getElementById("refreshDayBtn")?.addEventListener("click", () => loadSchedule(state.selectedWeekday));
  document.getElementById("subjectFilter")?.addEventListener("change", (event) => {
    state.selectedSubject = event.target.value;
    renderSchedule();
    updateSummary();
  });
  document.getElementById("loginBtn")?.addEventListener("click", login);
  document.getElementById("registerBtn")?.addEventListener("click", register);
  document.getElementById("recoverPasswordBtn")?.addEventListener("click", recoverPassword);
  document.getElementById("switchToRegisterBtn")?.addEventListener("click", () => switchAuthTab("register"));
  document.getElementById("switchToLoginBtn")?.addEventListener("click", () => switchAuthTab("login"));
  document.getElementById("logoutBtn")?.addEventListener("click", logout);
  document.getElementById("openChatBtn")?.addEventListener("click", openChat);
  document.getElementById("closeChatBtn")?.addEventListener("click", closeChat);
  document.getElementById("clearChatBtn")?.addEventListener("click", clearChat);
  document.getElementById("generatePlanBtn")?.addEventListener("click", generatePlan);
  document.getElementById("chatForm")?.addEventListener("submit", submitChat);
  document.getElementById("uploadTextbookBtn")?.addEventListener("click", () => document.getElementById("textbookFileInput")?.click());
  document.getElementById("textbookFileInput")?.addEventListener("change", handleTextbookPick);
  document.getElementById("pickScheduleFileBtn")?.addEventListener("click", () => document.getElementById("scheduleFileInput")?.click());
  document.getElementById("scheduleFileInput")?.addEventListener("change", handleScheduleFilePick);
  document.getElementById("openSettingsBtn")?.addEventListener("click", () => openModal("settingsModal"));
  document.getElementById("saveSettingsBtn")?.addEventListener("click", saveSettings);
  document.getElementById("deleteScheduleFileBtn")?.addEventListener("click", clearScheduleFile);
  document.getElementById("previousWeekBtn")?.addEventListener("click", () => changeWeek(-1));
  document.getElementById("nextWeekBtn")?.addEventListener("click", () => changeWeek(1));
  document.getElementById("weekNumberSelect")?.addEventListener("change", async (event) => {
    state.selectedWeekNumber = Number(event.target.value || 1);
    renderWeekControls();
    await loadSchedule(state.selectedWeekday);
  });
  document.getElementById("cloneQuarterBtn")?.addEventListener("click", cloneQuarter);
  document.getElementById("bindTelegramBtn")?.addEventListener("click", bindTelegram);
  document.getElementById("deleteAccountBtn")?.addEventListener("click", deleteAccount);
  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });
  document.querySelectorAll("[data-auth-tab]").forEach((button) => {
    button.addEventListener("click", () => switchAuthTab(button.dataset.authTab));
  });
}

async function bootstrap() {
  try {
    showLoading("Загрузка пространства...");
    const data = await invokeWithTimeout("bootstrap_app");
    state.days = data.days || [];
    state.subjects = data.subjects || [];
    state.authSession = data.auth_session || null;
    state.settings = { ...state.settings, ...(data.settings || {}) };
    state.textbooks = Array.isArray(data.textbooks) ? data.textbooks : [];
    state.selectedWeekNumber = data.default_week_number || 1;
    state.selectedWeekday = data.default_weekday || 1;
    state.selectedDayLabel = labelForWeekday(state.selectedWeekday);
    fillSubjectSelect();
    fillWeekdaySelect();
    renderWeekControls();
    applySettingsToUi();
    renderDays();
    renderTextbooks();
    applyAuthState();
    if (state.authSession?.access_token) {
      await loadSchedule(state.selectedWeekday);
      await bootstrapCloudState();
    } else {
      state.schedule = [];
      renderSchedule();
      updateSummary();
    }
  } catch (error) {
    console.error("bootstrap failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function login() {
  const email = document.getElementById("loginEmail").value.trim();
  const password = document.getElementById("loginPassword").value.trim();
  try {
    showLoading("Вход...");
    const response = await invokeWithTimeout("login_user", { email, password });
    if (!response.ok || !response.session) {
      throw new Error(response.message || "Не удалось войти");
    }
    state.authSession = response.session;
    applyAuthState();
    applySettingsToUi();
    await refreshTextbooks();
    await loadSchedule(state.selectedWeekday);
    await syncProfileToCloud();
    await bootstrapCloudState();
    showToast(response.message || "Вход выполнен");
  } catch (error) {
    console.error("login failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function register() {
  const email = document.getElementById("registerEmail").value.trim();
  const password = document.getElementById("registerPassword").value.trim();
  try {
    showLoading("Создание аккаунта...");
    const response = await invokeWithTimeout("register_user", { email, password });
    if (!response.ok) {
      throw new Error(response.message || "Не удалось создать аккаунт");
    }
    if (response.session) {
      state.authSession = response.session;
      applyAuthState();
      applySettingsToUi();
      await refreshTextbooks();
      await loadSchedule(state.selectedWeekday);
      await syncProfileToCloud();
      await bootstrapCloudState();
    } else {
      switchAuthTab("login");
    }
    showToast(response.message || "Аккаунт создан");
  } catch (error) {
    console.error("register failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function recoverPassword() {
  const email =
    document.getElementById("loginEmail").value.trim() ||
    document.getElementById("registerEmail").value.trim();
  if (!email) {
    showToast("Сначала укажи email.");
    return;
  }
  try {
    showLoading("Отправка письма...");
    const result = await invokeWithTimeout("recover_password", { email });
    showToast(result.message || "Письмо отправлено");
  } catch (error) {
    console.error("recoverPassword failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function logout() {
  try {
    showLoading("Выход...");
    await invokeWithTimeout("logout_user");
    state.authSession = null;
    state.schedule = [];
    state.textbooks = [];
    applyAuthState();
    applySettingsToUi();
    renderTextbooks();
    renderSchedule();
    updateSummary();
  } catch (error) {
    console.error("logout failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function deleteAccount() {
  if (!window.confirm("Удалить аккаунт и локальные данные на этом устройстве?")) {
    return;
  }
  try {
    showLoading("Удаление аккаунта...");
    const result = await invokeWithTimeout("delete_account");
    state.authSession = null;
    state.schedule = [];
    state.textbooks = [];
    applyAuthState();
    applySettingsToUi();
    renderSchedule();
    renderTextbooks();
    updateSummary();
    closeModal("settingsModal");
    showToast(result.message || "Аккаунт удалён");
  } catch (error) {
    console.error("deleteAccount failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function deleteLesson(lesson) {
  try {
    showLoading("Удаление урока...");
    const result = await invokeWithTimeout("delete_schedule_lesson", {
      payload: {
        week_number: state.selectedWeekNumber,
        weekday: state.selectedWeekday,
        lesson,
      },
    });
    state.schedule = state.schedule.filter((item) => !sameLesson(item, lesson));
    renderSchedule();
    updateSummary();
    showToast(result.message || "Урок удалён");
  } catch (error) {
    console.error("deleteLesson failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function saveSettings() {
  const settings = {
    theme: document.getElementById("themeSelect").value,
    reminder_hours: Number(document.getElementById("reminderHoursInput").value || 18),
    hints_enabled: document.getElementById("hintsEnabledInput").checked,
    enable_3d: document.getElementById("enable3dInput").checked,
    telegram_enabled: document.getElementById("telegramEnabledInput").checked,
    telegram_bot_token: document.getElementById("telegramBotTokenInput").value.trim(),
    telegram_chat_id: document.getElementById("telegramChatIdInput").value.trim(),
  };
  try {
    showLoading("Сохранение настроек...");
    const result = await invokeWithTimeout("save_settings", { settings });
    state.settings = settings;
    applySettingsToUi();
    await syncProfileToCloud();
    closeModal("settingsModal");
    showToast(result.message || "Настройки сохранены");
  } catch (error) {
    console.error("saveSettings failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

function bindTelegram() {
  bindTelegramSession().catch((error) => {
    console.error("bindTelegram failed", error);
    showToast(normalizeError(error));
  });
}

async function loadSchedule(weekday) {
  try {
    showLoading("Синхронизация...");
    const lessons = await invokeWithTimeout("get_schedule_for_weekday", {
      weekNumber: state.selectedWeekNumber,
      weekday,
    });
    state.schedule = Array.isArray(lessons) ? lessons : [];
    renderSchedule();
    updateSummary();
  } catch (error) {
    console.error("loadSchedule failed", error);
    state.schedule = [];
    renderSchedule();
    updateSummary();
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function saveSchedule() {
  const text = document.getElementById("scheduleInput").value.trim();
  const detailsText = document.getElementById("scheduleDetailsInput").value.trim();
  if (!text && !state.scheduleFile && !detailsText) {
    showToast("Добавь текст, файл или уточнения по предметам.");
    return;
  }
  try {
    showLoading("Анализ расписания...");
    const payload = {
      week_number: state.selectedWeekNumber,
      weekday: Number(document.getElementById("scheduleWeekdaySelect").value),
      text,
      details_text: detailsText,
      file_name: state.scheduleFile?.name || "",
      file_base64: state.scheduleFile ? await readFileAsDataUrl(state.scheduleFile) : "",
      mime_type: state.scheduleFile?.type || "",
    };
    const result = await invokeWithTimeout("save_schedule", { payload }, 45000);
    resetScheduleImport();
    closeModal("scheduleModal");
    state.selectedWeekday = payload.weekday;
    state.selectedDayLabel = labelForWeekday(payload.weekday);
    renderDays();
    fillWeekdaySelect();
    await loadSchedule(payload.weekday);
    await syncScheduleToCloud(payload.weekday);
    showToast(result.message || "Расписание обновлено");
  } catch (error) {
    console.error("saveSchedule failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function handleTextbookPick(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    showLoading("Загрузка учебника...");
    const fileBase64 = await readFileAsDataUrl(file);
    const payload = {
      file_name: file.name,
      file_base64: fileBase64,
      mime_type: file.type || "application/pdf",
    };
    const result = await invokeWithTimeout("upload_textbook", { payload }, 60000);
    await refreshTextbooks();
    showToast(result.message || "Учебник добавлен");
  } catch (error) {
    console.error("handleTextbookPick failed", error);
    showToast(normalizeError(error));
  } finally {
    event.target.value = "";
    hideLoading();
  }
}

function handleScheduleFilePick(event) {
  const file = event.target.files?.[0];
  state.scheduleFile = file || null;
  document.getElementById("scheduleFileName").textContent = file ? file.name : "Файл не выбран.";
}

function clearScheduleFile() {
  state.scheduleFile = null;
  document.getElementById("scheduleFileInput").value = "";
  document.getElementById("scheduleFileName").textContent = "Файл не выбран.";
}

async function refreshTextbooks() {
  try {
    const textbooks = await invokeWithTimeout("list_textbooks_command");
    state.textbooks = Array.isArray(textbooks) ? textbooks : [];
    renderTextbooks();
    updateSummary();
  } catch (error) {
    console.error("refreshTextbooks failed", error);
  }
}

async function generatePlan() {
  try {
    showLoading("Генерация плана...");
    const result = await invokeWithTimeout(
      "generate_study_plan",
      { weekNumber: state.selectedWeekNumber, weekday: state.selectedWeekday },
      45000,
    );
    document.getElementById("plannerOutput").textContent = result.plan || "План пока пуст.";
  } catch (error) {
    console.error("generatePlan failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function submitChat(event) {
  event.preventDefault();
  const question = document.getElementById("chatInput").value.trim();
  if (!question) return;
  document.getElementById("chatInput").value = "";
  state.chatMessages.push({ role: "user", text: question });
  renderChat();
  try {
    showLoading("Nexara думает...");
    const result = await invokeWithTimeout("ask_ai", { question }, 60000);
    const sources = Array.isArray(result.sources) && result.sources.length ? `\n\nИсточники: ${result.sources.join(", ")}` : "";
    state.chatMessages.push({ role: "assistant", text: `${result.answer || "Ответ пуст."}${sources}` });
    renderChat();
  } catch (error) {
    console.error("submitChat failed", error);
    const message = normalizeError(error);
    state.chatMessages.push({ role: "assistant", text: message });
    renderChat();
    showToast(message);
  } finally {
    hideLoading();
  }
}

function clearChat() {
  state.chatMessages = [{ role: "assistant", text: "История очищена. Можешь задать новый вопрос." }];
  renderChat();
}

function fillSubjectSelect() {
  const select = document.getElementById("subjectFilter");
  select.innerHTML = '<option value="">Все предметы</option>';
  (state.subjects.length ? state.subjects : []).forEach((subject) => {
    const option = document.createElement("option");
    option.value = subject;
    option.textContent = subject;
    select.appendChild(option);
  });
}

function fillWeekdaySelect() {
  const select = document.getElementById("scheduleWeekdaySelect");
  select.innerHTML = state.days.map((day) => `<option value="${day.value}">${escapeHtml(day.label)}</option>`).join("");
  select.value = String(state.selectedWeekday);
  document.getElementById("selectedDayLabel").textContent = state.selectedDayLabel;
  document.getElementById("summaryDay").textContent = `${state.selectedDayLabel}, неделя ${state.selectedWeekNumber}`;
}

function renderDays() {
  const bar = document.getElementById("daysBar");
  bar.innerHTML = "";
  state.days.forEach((day) => {
    const button = document.createElement("button");
    button.className = `day-btn${day.value === state.selectedWeekday ? " is-active" : ""}`;
    button.textContent = day.label;
    button.addEventListener("click", async () => {
      state.selectedWeekday = day.value;
      state.selectedDayLabel = day.label;
      fillWeekdaySelect();
      renderWeekControls();
      renderDays();
      await loadSchedule(day.value);
    });
    bar.appendChild(button);
  });
}

function renderSchedule() {
  const list = document.getElementById("scheduleList");
  list.innerHTML = "";
  const visible = state.selectedSubject
    ? state.schedule.filter((lesson) => lesson.subject === state.selectedSubject)
    : state.schedule;
  if (!visible.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = state.authSession
      ? "На этот день пока нет расписания. Добавь его текстом, скриншотом или файлом."
      : "Войди в аккаунт, чтобы увидеть своё расписание.";
    list.appendChild(empty);
    return;
  }
  visible.forEach((lesson) => {
    const card = document.createElement("article");
    card.className = "lesson-card";
    const materials = Array.isArray(lesson.materials) ? lesson.materials : [];
    card.innerHTML = `
      <div class="lesson-card__time">${escapeHtml(lesson.start_time)} - ${escapeHtml(lesson.end_time)}</div>
      <div>
        <div class="lesson-card__topline">
          <h4>${escapeHtml(lesson.subject)}</h4>
          <span class="pill">${lesson.room ? `Каб. ${escapeHtml(lesson.room)}` : "Кабинет не указан"}</span>
        </div>
        <p class="lesson-card__teacher">${lesson.teacher ? escapeHtml(lesson.teacher) : "Учитель не указан"}</p>
        <p class="lesson-card__notes">${lesson.notes ? escapeHtml(lesson.notes) : "Без заметок"}</p>
        ${materials.length ? `<p class="lesson-card__notes">Материалы: ${escapeHtml(materials.join(", "))}</p>` : ""}
      </div>
    `;
    const actions = document.createElement("div");
    actions.className = "lesson-card__actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-btn lesson-card__delete";
    deleteButton.textContent = "Удалить";
    deleteButton.addEventListener("click", () => deleteLesson(lesson));
    actions.appendChild(deleteButton);
    card.appendChild(actions);
    list.appendChild(card);
  });
}

function renderTextbooks() {
  const list = document.getElementById("textbookList");
  list.innerHTML = "";
  if (!state.textbooks.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state empty-state--compact";
    empty.textContent = "Пока нет загруженных PDF-учебников.";
    list.appendChild(empty);
    return;
  }
  state.textbooks.forEach((book) => {
    const node = document.createElement("article");
    node.className = "textbook-item";
    node.innerHTML = `
      <strong>${escapeHtml(book.file_name)}</strong>
      <span>${escapeHtml(book.mime_type)}</span>
      <small>${escapeHtml(book.hash.slice(0, 12))}</small>
    `;
    const actions = document.createElement("div");
    actions.className = "textbook-item__actions";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "ghost-btn";
    deleteButton.textContent = "Удалить учебник";
    deleteButton.addEventListener("click", () => deleteTextbook(book));
    actions.appendChild(deleteButton);
    node.appendChild(actions);
    list.appendChild(node);
  });
}

function renderChat() {
  const container = document.getElementById("chatMessages");
  container.innerHTML = "";
  state.chatMessages.forEach((message) => {
    const node = document.createElement("article");
    node.className = `message message--${message.role}`;
    node.textContent = message.text;
    container.appendChild(node);
  });
  container.scrollTop = container.scrollHeight;
}

function updateSummary() {
  const visible = state.selectedSubject
    ? state.schedule.filter((lesson) => lesson.subject === state.selectedSubject)
    : state.schedule;
  document.getElementById("summaryDay").textContent = `${state.selectedDayLabel}, неделя ${state.selectedWeekNumber}`;
  document.getElementById("summaryLessonCount").textContent = String(visible.length);
  document.getElementById("summaryMaterials").textContent = String(state.textbooks.length);
  document.getElementById("summaryNextLesson").textContent = visible[0]
    ? `${visible[0].start_time} · ${visible[0].subject}`
    : "Свободное окно";
}

function applyAuthState() {
  const isAuthed = Boolean(state.authSession?.access_token);
  document.getElementById("authModal").classList.toggle("is-open", !isAuthed);
  document.getElementById("userName").textContent = state.authSession?.display_name || "Гость";
  document.getElementById("userEmail").textContent = state.authSession?.email || "Вход не выполнен";
}

function applySettingsToUi() {
  document.body.classList.remove("theme-light", "theme-dark", "theme-contrast");
  document.body.classList.add(state.settings.theme || "theme-light");
  document.body.classList.toggle("with-3d", Boolean(state.settings.enable_3d));
  document.getElementById("themeSelect").value = state.settings.theme || "theme-light";
  document.getElementById("reminderHoursInput").value = state.settings.reminder_hours ?? 18;
  document.getElementById("hintsEnabledInput").checked = Boolean(state.settings.hints_enabled);
  document.getElementById("enable3dInput").checked = Boolean(state.settings.enable_3d);
  document.getElementById("telegramEnabledInput").checked = Boolean(state.settings.telegram_enabled);
  document.getElementById("telegramBotTokenInput").value = state.settings.telegram_bot_token || "";
  document.getElementById("telegramChatIdInput").value = state.settings.telegram_chat_id || "";
  const telegramStatus = document.getElementById("telegramStatusText");
  if (telegramStatus) {
    telegramStatus.textContent = state.settings.telegram_chat_id ? "Telegram подключен" : "Telegram не подключен";
  }
  const telegramBindButton = document.getElementById("bindTelegramBtn");
  if (telegramBindButton) {
    telegramBindButton.disabled = !state.authSession?.user_id;
  }
  document.getElementById("hintCard").style.display = state.settings.hints_enabled ? "" : "none";
}

function cycleHint(showToastOnHidden = true) {
  if (!state.settings.hints_enabled && showToastOnHidden) {
    showToast("Хинты выключены в настройках.");
    return;
  }
  const hint = state.hints[state.hintIndex % state.hints.length];
  document.getElementById("hintTitle").textContent = hint.title;
  document.getElementById("hintText").textContent = hint.text;
  state.hintIndex += 1;
}

function resetScheduleImport() {
  clearScheduleFile();
  document.getElementById("scheduleInput").value = "";
  document.getElementById("scheduleDetailsInput").value = "";
}

function renderWeekControls() {
  const select = document.getElementById("weekNumberSelect");
  if (select && !select.options.length) {
    select.innerHTML = Array.from({ length: 52 }, (_, index) => {
      const week = index + 1;
      return `<option value="${week}">?????? ${week}</option>`;
    }).join("");
  }
  if (select) {
    select.value = String(state.selectedWeekNumber);
  }
  const label = document.getElementById("weekBadge");
  if (label) {
    label.textContent = `?????? ${state.selectedWeekNumber} ? ${formatWeekRange(state.selectedWeekNumber)}`;
  }
  const previousLabel = document.getElementById("previousWeekLabel");
  const nextLabel = document.getElementById("nextWeekLabel");
  if (previousLabel) previousLabel.textContent = state.selectedWeekNumber > 1 ? formatWeekRange(state.selectedWeekNumber - 1) : "";
  if (nextLabel) nextLabel.textContent = state.selectedWeekNumber < 52 ? formatWeekRange(state.selectedWeekNumber + 1) : "";
}

async function changeWeek(delta) {
  const next = Math.min(52, Math.max(1, state.selectedWeekNumber + delta));
  if (next === state.selectedWeekNumber) {
    return;
  }
  state.selectedWeekNumber = next;
  renderWeekControls();
  fillWeekdaySelect();
  await loadSchedule(state.selectedWeekday);
}

async function cloneQuarter() {
  const targetStart = Number(prompt("С какой недели начать клонирование?", String(state.selectedWeekNumber + 1)) || 0);
  const targetEnd = Number(prompt("По какую неделю клонировать?", String(Math.min(52, state.selectedWeekNumber + 12))) || 0);
  if (!targetStart || !targetEnd) {
    return;
  }
  try {
    showLoading("Клонирование четверти...");
    const result = await invokeWithTimeout("clone_schedule_quarter", {
      payload: {
        source_week_number: state.selectedWeekNumber,
        target_start_week: targetStart,
        target_end_week: targetEnd,
      },
    });
    showToast(result.message || "Расписание расклонировано.");
  } catch (error) {
    console.error("cloneQuarter failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

function openModal(id) {
  document.getElementById(id)?.classList.add("is-open");
}

function closeModal(id) {
  document.getElementById(id)?.classList.remove("is-open");
}

function openChat() {
  document.getElementById("chatDrawer").classList.add("is-open");
}

function closeChat() {
  document.getElementById("chatDrawer").classList.remove("is-open");
}


function formatWeekRange(weekNumber) {
  const now = new Date();
  const year = now.getFullYear();
  const jan4 = new Date(year, 0, 4);
  const jan4Day = jan4.getDay() || 7;
  const monday = new Date(jan4);
  monday.setDate(jan4.getDate() - (jan4Day - 1) + ((weekNumber - 1) * 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return `${formatDayMonth(monday)} - ${formatDayMonth(sunday)}`;
}

function formatDayMonth(date) {
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
}

function switchAuthTab(tab) {
  document
    .querySelectorAll("[data-auth-tab]")
    .forEach((button) => button.classList.toggle("is-active", button.dataset.authTab === tab));
  document
    .querySelectorAll("[data-auth-panel]")
    .forEach((panel) => panel.classList.toggle("is-active", panel.dataset.authPanel === tab));
}

function labelForWeekday(value) {
  return state.days.find((day) => day.value === value)?.label || "Понедельник";
}

function sameLesson(left, right) {
  return left.subject === right.subject
    && left.teacher === right.teacher
    && left.room === right.room
    && left.start_time === right.start_time
    && left.end_time === right.end_time
    && left.notes === right.notes;
}

function showLoading(text = "Загрузка...") {
  const overlay = document.getElementById("loadingOverlay");
  const label = document.getElementById("loadingText");
  loadingState.depth += 1;
  clearTimeout(loadingState.watchdog);
  loadingState.watchdog = setTimeout(() => {
    console.error("loading timeout");
    loadingState.depth = 0;
    hideLoading(true);
    showToast("Превышено время ожидания");
  }, 10000);
  if (label) label.textContent = text;
  overlay.hidden = false;
  setSyncStatus(text);
}

function hideLoading(force = false) {
  const overlay = document.getElementById("loadingOverlay");
  if (force) {
    loadingState.depth = 0;
  } else if (loadingState.depth > 0) {
    loadingState.depth -= 1;
  }
  if (loadingState.depth <= 0) {
    loadingState.depth = 0;
    clearTimeout(loadingState.watchdog);
    loadingState.watchdog = null;
    overlay.hidden = true;
    setSyncStatus("Готово");
  }
}

function setSyncStatus(text) {
  document.getElementById("syncStatus").textContent = text;
}

async function invokeWithTimeout(command, args = {}, timeoutMs = 15000) {
  let timer = null;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Превышено время ожидания")), timeoutMs);
  });
  try {
    return await Promise.race([invoke(command, args), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        Accept: "application/json; charset=utf-8",
        ...(options.headers || {}),
      },
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : {};
    if (!response.ok) {
      throw new Error(data.message || text || `HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Превышено время ожидания");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function hasCloudBackend() {
  return /^https?:\/\//i.test(BACKEND_BASE_URL);
}

async function syncProfileToCloud() {
  if (!hasCloudBackend() || !state.authSession?.user_id || !state.authSession?.email) {
    return null;
  }
  try {
    return await fetchJsonWithTimeout(`${BACKEND_BASE_URL}/sync/profile`, {
      method: "POST",
      body: JSON.stringify({
        user_id: state.authSession.user_id,
        email: state.authSession.email,
        telegram_chat_id: state.settings.telegram_chat_id ? Number(state.settings.telegram_chat_id) : null,
        notes: {},
      }),
    });
  } catch (error) {
    console.warn("syncProfileToCloud failed", error);
    return null;
  }
}

async function syncScheduleToCloud(weekday) {
  if (!hasCloudBackend() || !state.authSession?.user_id) {
    return null;
  }
  try {
    return await fetchJsonWithTimeout(`${BACKEND_BASE_URL}/sync/schedule`, {
      method: "POST",
      body: JSON.stringify({
        user_id: state.authSession.user_id,
        week_number: state.selectedWeekNumber,
        weekday,
        lessons: state.schedule,
      }),
    });
  } catch (error) {
    console.warn("syncScheduleToCloud failed", error);
    return null;
  }
}

async function bootstrapCloudState() {
  if (!hasCloudBackend() || !state.authSession?.user_id) {
    return null;
  }
  try {
    const data = await fetchJsonWithTimeout(
      `${BACKEND_BASE_URL}/sync/bootstrap?user_id=${encodeURIComponent(state.authSession.user_id)}`,
      { method: "GET" },
    );
    if (data && data.telegram_chat_id) {
      state.settings.telegram_chat_id = String(data.telegram_chat_id);
      applySettingsToUi();
    }
    if (Array.isArray(data?.schedules)) {
      const current = data.schedules.find(
        (item) =>
          Number(item.weekday) === Number(state.selectedWeekday)
          && Number(item.week_number || 1) === Number(state.selectedWeekNumber),
      );
      if (current && Array.isArray(current.lessons) && !state.schedule.length) {
        state.schedule = current.lessons;
        renderSchedule();
        updateSummary();
      }
    }
    return data;
  } catch (error) {
    console.warn("bootstrapCloudState failed", error);
    return null;
  }
}

async function bindTelegramSession() {
  if (!state.authSession?.user_id) {
    throw new Error("Сначала войди в аккаунт.");
  }
  if (!TELEGRAM_BOT_USERNAME) {
    throw new Error("Не указан username Telegram-бота.");
  }
  let token = state.authSession.user_id;
  if (hasCloudBackend()) {
    const response = await fetchJsonWithTimeout(`${BACKEND_BASE_URL}/telegram/session`, {
      method: "POST",
      body: JSON.stringify({
        user_id: state.authSession.user_id,
        email: state.authSession.email,
      }),
    });
    token = response.token || token;
  }
  window.open(
    `tg://resolve?domain=${encodeURIComponent(TELEGRAM_BOT_USERNAME)}&start=${encodeURIComponent(token)}`,
    "_blank",
  );
}

async function deleteTextbook(book) {
  if (!confirm(`Удалить учебник ${book.file_name}?`)) {
    return;
  }
  try {
    showLoading("Удаление учебника...");
    const result = await invokeWithTimeout("delete_textbook", { payload: { hash: book.hash } }, 45000);
    state.textbooks = state.textbooks.filter((item) => item.hash !== book.hash);
    renderTextbooks();
    updateSummary();
    if (hasCloudBackend() && state.authSession?.user_id) {
      await fetchJsonWithTimeout(`${BACKEND_BASE_URL}/sync/file`, {
        method: "DELETE",
        body: JSON.stringify({ user_id: state.authSession.user_id, hash: book.hash }),
      });
    }
    showToast(result.message || "Учебник удалён.");
  } catch (error) {
    console.error("deleteTextbook failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function normalizeError(error) {
  const raw = typeof error === "string" ? error : error?.message || "Неизвестная ошибка";
  const compact = String(raw).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const lower = compact.toLowerCase();
  if (lower.includes("timeout") || lower.includes("превышено время ожидания")) {
    return "Превышено время ожидания";
  }
  if (lower.includes("python") && lower.includes("запуска")) {
    return "Не удалось запустить Python-движок. Проверь установку зависимостей.";
  }
  if (lower.includes("failed to fetch") || lower.includes("network")) {
    return "Не удалось связаться с сервисом";
  }
  return compact || "Неизвестная ошибка";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

async function mockInvoke(command, args = {}) {
  if (command === "bootstrap_app") {
    return {
      days: [
        { value: 1, label: "Понедельник" },
        { value: 2, label: "Вторник" },
        { value: 3, label: "Среда" },
        { value: 4, label: "Четверг" },
        { value: 5, label: "Пятница" },
        { value: 6, label: "Суббота" },
        { value: 7, label: "Воскресенье" },
      ],
      subjects: [
        "Алгебра", "Геометрия", "Вероятность и статистика", "Русский язык", "Физика", "Химия",
        "Биология", "Физическая культура", "География", "Информатика", "История",
        "Обществознание", "Английский язык", "Литература", "Технология", "Классный час", "ОБЖ",
      ],
      default_weekday: 1,
      default_week_number: 12,
      auth_session: null,
      settings: state.settings,
      textbooks: [],
    };
  }
  if (command === "register_user" || command === "login_user") {
    return {
      ok: true,
      message: "Готово",
      session: {
        user_id: "demo-user",
        email: args.email || "demo@nexara.app",
        display_name: (args.email || "demo").split("@")[0],
        access_token: "demo-token",
        refresh_token: "demo-refresh",
      },
    };
  }
  if (command === "recover_password" || command === "logout_user" || command === "save_settings" || command === "save_schedule" || command === "upload_textbook" || command === "notify_status" || command === "delete_account" || command === "clone_schedule_quarter" || command === "delete_textbook") {
    return { ok: true, message: "Готово" };
  }
  if (command === "list_textbooks_command") {
    return [{ hash: "abc123", file_name: "Алгебра.pdf", mime_type: "application/pdf", stored_path: "", created_at: "" }];
  }
  if (command === "get_schedule_for_weekday") {
    return [{ subject: "Алгебра", teacher: "Смирнов Д.А.", room: "214", start_time: "08:30", end_time: "09:15", notes: "Решить №145-146", materials: ["alg.pdf"] }];
  }
  if (command === "generate_study_plan") {
    return { plan: "До школы\nПроверь первый урок.\n\nПосле уроков\nСделай домашнее задание.\n\nВечером\nПовтори сложные темы." };
  }
  if (command === "ask_ai") {
    return { answer: "1. Короткий вывод\nНачни с алгебры.\n\n2. Объяснение простыми словами\nПовтори формулы и реши 2-3 задания.\n\n3. Что запомнить\n- Формулы\n- Ошибки из домашки", sources: ["Алгебра.pdf"] };
  }
  throw new Error(`Неизвестная команда: ${command}`);
}

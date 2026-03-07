const tauriApi = window.__TAURI__ || {};
const invoke = tauriApi.core?.invoke
  ? (command, args) => tauriApi.core.invoke(command, args)
  : async (command, args) => mockInvoke(command, args);

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
    state.selectedWeekday = data.default_weekday || 1;
    state.selectedDayLabel = labelForWeekday(state.selectedWeekday);
    fillSubjectSelect();
    fillWeekdaySelect();
    applySettingsToUi();
    renderDays();
    renderTextbooks();
    applyAuthState();
    if (state.authSession?.access_token) {
      await loadSchedule(state.selectedWeekday);
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
    await refreshTextbooks();
    await loadSchedule(state.selectedWeekday);
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
      await refreshTextbooks();
      await loadSchedule(state.selectedWeekday);
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

async function deleteLesson(lesson) {
  try {
    showLoading("Удаление урока...");
    const result = await invokeWithTimeout("delete_schedule_lesson", {
      payload: {
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
    closeModal("settingsModal");
    showToast(result.message || "Настройки сохранены");
  } catch (error) {
    console.error("saveSettings failed", error);
    showToast(normalizeError(error));
  } finally {
    hideLoading();
  }
}

async function loadSchedule(weekday) {
  try {
    showLoading("Синхронизация...");
    const lessons = await invokeWithTimeout("get_schedule_for_weekday", { weekday });
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
  if (!text && !state.scheduleFile) {
    showToast("Добавь текст или файл с расписанием.");
    return;
  }
  try {
    showLoading("Анализ расписания...");
    const payload = {
      weekday: Number(document.getElementById("scheduleWeekdaySelect").value),
      text,
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
    const result = await invokeWithTimeout("generate_study_plan", { weekday: state.selectedWeekday }, 45000);
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
  document.getElementById("summaryDay").textContent = state.selectedDayLabel;
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
  document.getElementById("summaryDay").textContent = state.selectedDayLabel;
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
  state.scheduleFile = null;
  document.getElementById("scheduleInput").value = "";
  document.getElementById("scheduleFileInput").value = "";
  document.getElementById("scheduleFileName").textContent = "Файл не выбран.";
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
  }, 15000);
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
  if (command === "recover_password" || command === "logout_user" || command === "save_settings" || command === "save_schedule" || command === "upload_textbook" || command === "notify_status") {
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

// ===== Chat App =====
// Integrates with veyo.ai's Python AI backend (GROQ / Llama 3.3)
// In standalone HTML mode, uses a simulated response when no backend is available.

const CHAT_KEY = 'nexara-chat-history';
const AI_ENDPOINT = 'http://localhost:8000/chat'; // Python AI backend

const SIMULATED_RESPONSES = [
  "Конечно! Давай разберём этот вопрос подробнее. Основная идея здесь в том, что нужно понять базовые принципы и применить их последовательно.",
  "Отличный вопрос! В школьной программе это одна из ключевых тем. Рекомендую начать с понимания определений, а затем перейти к практике.",
  "Для решения таких задач используй следующий алгоритм: сначала запиши условие, выдели неизвестные, составь уравнение и реши его.",
  "По этой теме есть несколько важных моментов, которые стоит запомнить. Давай разберём их по порядку...",
  "Чтобы лучше подготовиться, советую повторить формулы и решить несколько задач из учебника. Практика — лучший способ закрепить материал.",
];

class ChatApp {
  constructor() {
    this.messages = this.loadHistory();
    this.isLoading = false;
    this.init();
  }

  loadHistory() {
    try {
      const raw = localStorage.getItem(CHAT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveHistory() {
    // Keep last 50 messages
    const toSave = this.messages.slice(-50);
    localStorage.setItem(CHAT_KEY, JSON.stringify(toSave));
  }

  clearHistory() {
    this.messages = [];
    localStorage.removeItem(CHAT_KEY);
    const container = document.getElementById('chat-messages');
    if (container) {
      // Remove all messages except welcome
      const msgs = container.querySelectorAll('.chat-message:not(#welcome-msg)');
      msgs.forEach(m => m.remove());
    }
  }

  addMessage(role, text) {
    this.messages.push({ role, text, ts: Date.now() });
    this.saveHistory();
    this.renderMessage(role, text);
  }

  renderMessage(role, text, typing = false) {
    const container = document.getElementById('chat-messages');
    if (!container) return;

    const div = document.createElement('div');
    div.className = `chat-message ${role}`;

    const initials = role === 'ai' ? 'N' : 'Я';
    div.innerHTML = `
      <div class="msg-avatar ${role}">${initials}</div>
      <div class="msg-bubble">
        ${typing ? `<div class="chat-typing"><span></span><span></span><span></span></div>` : this.formatText(text)}
      </div>
    `;

    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
    return div;
  }

  formatText(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  async sendMessage(text) {
    if (!text.trim() || this.isLoading) return;
    this.isLoading = true;

    // Add user message
    this.addMessage('user', text);

    // Show typing indicator
    const typingEl = this.renderMessage('ai', '', true);

    // Clear input
    const inputEl = document.getElementById('chat-input');
    if (inputEl) { inputEl.value = ''; inputEl.style.height = 'auto'; }

    try {
      // Try connecting to veyo.ai Python AI backend
      const response = await fetch(AI_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history: this.messages.slice(-10) }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        const aiText = data.response || data.message || 'Ответ получен.';
        typingEl?.remove();
        this.addMessage('ai', aiText);
      } else {
        throw new Error('Backend unavailable');
      }
    } catch {
      // Simulate response when backend not running
      await new Promise(r => setTimeout(r, 1200 + Math.random() * 800));
      const simulated = SIMULATED_RESPONSES[Math.floor(Math.random() * SIMULATED_RESPONSES.length)];
      typingEl?.remove();
      this.addMessage('ai', simulated + '\n\n_Это демо-ответ. Подключи Python-бэкенд veyo.ai для полного AI._');
    }

    this.isLoading = false;
  }

  init() {
    // Restore history (limit display)
    if (this.messages.length > 0) {
      const recent = this.messages.slice(-20);
      recent.forEach(m => this.renderMessage(m.role, m.text));
    }

    // Send button
    document.getElementById('send-btn')?.addEventListener('click', () => {
      const input = document.getElementById('chat-input');
      if (input) this.sendMessage(input.value);
    });

    // Enter key (Shift+Enter = newline)
    document.getElementById('chat-input')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const input = document.getElementById('chat-input');
        if (input) this.sendMessage(input.value);
      }
    });

    // Auto-resize textarea
    document.getElementById('chat-input')?.addEventListener('input', (e) => {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    });

    // Quick chip buttons
    document.getElementById('chat-messages')?.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-prompt]');
      if (chip) this.sendMessage(chip.dataset.prompt);
    });

    // Clear chat
    document.getElementById('clear-chat-btn')?.addEventListener('click', () => {
      if (confirm('Очистить историю чата?')) this.clearHistory();
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new ChatApp();
});

import argparse
import base64
import hashlib
import json
import os
import re
import sys
import time
import zipfile
from pathlib import Path
from typing import Dict, List
from xml.etree import ElementTree as ET

import numpy as np
import requests
from PyPDF2 import PdfReader

try:
    import telebot
except Exception:
    telebot = None

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile")
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "llama-3.2-90b-vision-preview")

try:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

class Chunk:
    def __init__(self, title: str, text: str, source: str) -> None:
        self.title = title
        self.text = text
        self.source = source


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "telegram-bot":
        run_telegram_bot()
        return

    raw = sys.stdin.read()
    if not raw.strip():
        fail("Empty input payload")
    envelope = json.loads(raw)
    action = envelope.get("action")
    payload = envelope.get("payload", {})

    if action == "parse_schedule":
        result = parse_schedule(payload["weekday"], payload.get("text", ""), payload.get("subjects", []))
    elif action == "parse_schedule_from_files":
        result = parse_schedule_from_files(payload["weekday"], payload.get("file_paths", []), payload.get("subjects", []))
    elif action == "index_pdfs":
        result = index_pdfs(payload.get("file_paths", []), payload.get("storage_dir", ""))
    elif action == "ask_ai":
        result = ask_ai(payload.get("question", ""), payload.get("storage_dir", ""))
    elif action == "generate_plan":
        result = generate_plan(payload.get("weekday"), payload.get("day_label", ""), payload.get("lessons", []))
    elif action == "send_telegram_message":
        result = send_telegram_message(payload.get("bot_token", ""), payload.get("chat_id", ""), payload.get("text", ""))
    else:
        fail(f"Unsupported action: {action}")
        return

    sys.stdout.write(json.dumps(result, ensure_ascii=False))


def fail(message: str) -> None:
    sys.stderr.write(message)
    sys.exit(1)


def call_groq(model: str, messages: List[Dict], temperature: float = 0.2) -> str | None:
    response = requests.post(
        GROQ_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"},
        json={"model": model, "messages": messages, "temperature": temperature},
        timeout=120,
    )
    if not response.ok:
        return None
    data = response.json()
    return data["choices"][0]["message"]["content"]


def parse_schedule(weekday: int, text: str, subjects: List[str]) -> Dict:
    if not text.strip():
        raise ValueError("Пустой текст расписания")
    system = (
        "Распознай школьное расписание. Выдели предметы, время, кабинеты, учителя и заметки. "
        f"Используй только предметы из списка: {', '.join(subjects)}. "
        "Если указан только старт и длительность, посчитай конец урока. Верни только JSON {\"lessons\":[...]}"
    )
    raw = call_groq(TEXT_MODEL, [{"role": "system", "content": system}, {"role": "user", "content": text}], 0.1)
    if raw:
        try:
            parsed = json.loads(extract_json(raw))
            return {"lessons": normalize_lessons(parsed.get("lessons", []), subjects)}
        except Exception:
            pass
    return {"lessons": fallback_parse(text, subjects)}


def parse_schedule_from_files(weekday: int, file_paths: List[str], subjects: List[str]) -> Dict:
    extracted = []
    for file_path in file_paths:
        path = Path(file_path)
        if not path.exists():
            continue
        extracted.append(extract_text_from_file(path))
    text = "\n".join(part for part in extracted if part.strip())
    if not text.strip():
        raise ValueError("Не удалось извлечь текст из файлов")
    return parse_schedule(weekday, text, subjects)


def extract_text_from_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        return ocr_with_vision(path)
    if ext == ".pdf":
        return "\n".join(pdf_to_chunks(path))
    if ext == ".docx":
        return docx_text(path)
    return path.read_text(encoding="utf-8", errors="ignore")


def ocr_with_vision(path: Path) -> str:
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": "Распознай текст на изображении/файле, выдели предметы, время и кабинеты. Сопоставь их с днями недели. Если данные неполные, подгони их под стандартную школьную сетку. Верни только распознанный текст."},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}},
        ],
    }]
    return call_groq(VISION_MODEL, messages, 0.1) or ""


def docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            root = ET.fromstring(archive.read("word/document.xml"))
    except Exception:
        return ""
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    lines = []
    for paragraph in root.findall(".//w:p", namespace):
        parts = [node.text or "" for node in paragraph.findall(".//w:t", namespace)]
        line = "".join(parts).strip()
        if line:
            lines.append(line)
    return "\n".join(lines)


def pdf_to_chunks(path: Path) -> List[str]:
    reader = PdfReader(str(path))
    parts = []
    for page in reader.pages:
        parts.append(page.extract_text() or "")
    return [part.strip() for part in parts if part.strip()]


def fallback_parse(text: str, subjects: List[str]) -> List[Dict]:
    lessons = []
    for line in [part.strip() for part in re.split(r"\n+|;", text) if part.strip()]:
        subject = next((item for item in subjects if item.lower() in line.lower()), "Классный час")
        start = re.search(r"(\d{1,2}:\d{2})", line)
        end = re.search(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})", line)
        start_time = start.group(1) if start else "08:30"
        end_time = end.group(2) if end else add_minutes(start_time, int(re.search(r"(\d{2,3})\s*мин", line, re.I).group(1)) if re.search(r"(\d{2,3})\s*мин", line, re.I) else 45)
        room = re.search(r"(?:каб(?:инет)?|аудитория)\s*([0-9A-Za-zА-Яа-я-]+)", line, re.I)
        lessons.append({
            "subject": subject,
            "teacher": "",
            "room": room.group(1) if room else "",
            "start_time": start_time,
            "end_time": end_time,
            "notes": line,
            "materials": extract_materials(line),
        })
    if not lessons:
        raise ValueError("Не удалось распознать расписание")
    return lessons


def normalize_lessons(lessons: List[Dict], subjects: List[str]) -> List[Dict]:
    normalized = []
    for lesson in lessons:
        subject = next((item for item in subjects if item.lower() == str(lesson.get("subject", "")).strip().lower()), None)
        if subject is None:
            subject = next((item for item in subjects if item.lower() in str(lesson.get("subject", "")).lower()), "Классный час")
        normalized.append({
            "subject": subject,
            "teacher": str(lesson.get("teacher", "")).strip(),
            "room": str(lesson.get("room", "")).strip(),
            "start_time": normalize_time(str(lesson.get("start_time", "08:30"))),
            "end_time": normalize_time(str(lesson.get("end_time", "09:15"))),
            "notes": str(lesson.get("notes", "")).strip(),
            "materials": [str(item).strip() for item in lesson.get("materials", []) if str(item).strip()],
        })
    return normalized


def normalize_time(value: str) -> str:
    match = re.search(r"(\d{1,2}):(\d{2})", value)
    if not match:
        return "08:30"
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def add_minutes(start: str, minutes: int) -> str:
    hour, minute = [int(part) for part in start.split(":")]
    total = hour * 60 + minute + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def extract_materials(text: str) -> List[str]:
    return re.findall(r"[\w-]+\.(?:pdf|docx|pptx|txt)", text, re.I)


def index_pdfs(file_paths: List[str], storage_dir: str) -> Dict:
    chunks = []
    for file_path in file_paths:
        path = Path(file_path)
        for index, text in enumerate(pdf_to_chunks(path)):
            chunks.append({
                "title": path.name,
                "source": str(path),
                "text": text,
                "embedding": embed_text(text).tolist(),
                "id": hashlib.sha1(f"{path}:{index}".encode()).hexdigest(),
            })
    target = Path(storage_dir)
    target.mkdir(parents=True, exist_ok=True)
    (target / "index.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "message": "indexed"}


def ask_ai(question: str, storage_dir: str) -> Dict:
    context_chunks = retrieve_chunks(question, storage_dir)
    context = "\n\n".join(f"[{chunk.title}] {chunk.text}" for chunk in context_chunks)
    sources = [chunk.title for chunk in context_chunks]
    messages = [{"role": "system", "content": "Ты школьный AI-помощник. Отвечай просто, структурированно, по делу."}]
    if context:
        messages.append({"role": "user", "content": f"Вопрос ученика: {question}\n\nКонтекст из учебников:\n{context}\n\nФормат: 1. Короткий вывод 2. Объяснение простыми словами 3. Что запомнить"})
    else:
        messages.append({"role": "user", "content": f"Вопрос ученика: {question}\n\nОтветь полезно даже без PDF. Формат: 1. Короткий вывод 2. Объяснение простыми словами 3. Что запомнить"})
    answer = call_groq(TEXT_MODEL, messages, 0.3)
    if not answer:
        answer = "1. Короткий вывод\nНе удалось получить ответ от модели.\n\n2. Объяснение простыми словами\nПроверь подключение и повтори запрос.\n\n3. Что запомнить\n- Переформулируй вопрос.\n- Убедись, что Groq доступен."
    return {"answer": answer, "sources": sources}


def generate_plan(weekday: int, day_label: str, lessons: List[Dict]) -> Dict:
    compact = "\n".join(f"{item['start_time']}-{item['end_time']} {item['subject']}: {item.get('notes', '')}" for item in lessons)
    answer = call_groq(TEXT_MODEL, [
        {"role": "system", "content": "Ты помогаешь школьнику распределять нагрузку без перегруза."},
        {"role": "user", "content": f"Составь план подготовки на {day_label}. Уроки:\n{compact}\n\nФормат: До школы / После уроков / Вечером."},
    ], 0.3)
    return {"plan": answer or "До школы\nПроверь первый урок и собери материалы.\n\nПосле уроков\nСделай короткие задания сразу.\n\nВечером\nЗакрой 1-2 сложных предмета и подготовь вещи на завтра."}


def send_telegram_message(bot_token: str, chat_id: str, text: str) -> Dict:
    if not bot_token.strip() or not chat_id.strip() or not text.strip():
        return {"ok": False, "message": "telegram disabled"}
    response = requests.post(f"https://api.telegram.org/bot{bot_token}/sendMessage", data={"chat_id": chat_id, "text": text}, timeout=30)
    return {"ok": response.ok, "message": "sent" if response.ok else response.text}


def embed_text(text: str) -> np.ndarray:
    values = np.zeros(256, dtype=np.float32)
    for token in re.findall(r"\w+", text.lower()):
        values[hash(token) % 256] += 1.0
    norm = np.linalg.norm(values)
    return values if norm == 0 else values / norm


def retrieve_chunks(question: str, storage_dir: str) -> List[Chunk]:
    index_path = Path(storage_dir) / "index.json"
    if not index_path.exists():
        return []
    raw = json.loads(index_path.read_text(encoding="utf-8"))
    query = embed_text(question)
    scored = []
    for item in raw:
        vector = np.array(item.get("embedding", []), dtype=np.float32)
        if vector.size == 0:
            continue
        score = float(np.dot(query, vector))
        scored.append((score, Chunk(item.get("title", "Материал"), item.get("text", ""), item.get("source", ""))))
    scored.sort(key=lambda item: item[0], reverse=True)
    return [chunk for _, chunk in scored[:4]]


def extract_json(raw: str) -> str:
    start = raw.find("{")
    end = raw.rfind("}")
    return raw[start:end + 1] if start >= 0 and end >= 0 else raw


def run_telegram_bot() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", required=True)
    parser.add_argument("--storage-dir", required=True)
    parser.add_argument("--bot-token", required=True)
    parser.add_argument("--chat-id", required=True)
    args = parser.parse_args(sys.argv[2:])

    if telebot is None:
        fail("telebot is not installed")

    bot = telebot.TeleBot(args.bot_token, parse_mode=None)
    target_chat_id = str(args.chat_id)

    @bot.message_handler(commands=["start", "today", "ask"])
    def handle_commands(message):
        if str(message.chat.id) != target_chat_id:
            return
        if message.text == "/today":
            bot.send_message(message.chat.id, "Nexara bot активен. Открой приложение, чтобы увидеть расписание и напоминания.")
        elif message.text == "/ask":
            bot.send_message(message.chat.id, "Просто отправь вопрос следующим сообщением, и я попробую помочь.")
        else:
            bot.send_message(message.chat.id, "Nexara bot на связи, пока приложение открыто.")

    @bot.message_handler(func=lambda _: True)
    def handle_question(message):
        if str(message.chat.id) != target_chat_id:
            return
        reply = ask_ai(message.text, args.storage_dir)
        bot.send_message(message.chat.id, reply["answer"][:3500])

    while True:
        try:
            bot.infinity_polling(timeout=30, long_polling_timeout=30)
        except Exception:
            time.sleep(5)


if __name__ == "__main__":
    main()

import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import sys
import time
import zipfile
from pathlib import Path
from typing import Dict, List, Tuple
from xml.etree import ElementTree as ET

import numpy as np
import requests
from PyPDF2 import PdfReader

try:
    import telebot
except Exception:  # noqa: BLE001
    telebot = None


EMBED_DIM = 256
GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile")
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "llama-3.2-90b-vision-preview")

try:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


class ChunkRecord:
    def __init__(self, file_path: str, title: str, chunk_text: str) -> None:
        self.file_path = file_path
        self.title = title
        self.chunk_text = chunk_text


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "telegram-bot":
        run_telegram_bot_cli(sys.argv[2:])
        return

    raw = sys.stdin.read()
    if not raw.strip():
        fail("Empty input payload")

    try:
        envelope = json.loads(raw)
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON: {exc}")
        return

    action = envelope.get("action")
    payload = envelope.get("payload", {})

    try:
        if action == "parse_schedule":
            result = parse_schedule(payload.get("weekday"), payload.get("text", ""), payload.get("subjects", []))
        elif action == "parse_schedule_from_files":
            result = parse_schedule_from_files(payload.get("weekday"), payload.get("file_paths", []), payload.get("subjects", []))
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
    except Exception as exc:  # noqa: BLE001
        fail(str(exc))
        return

    sys.stdout.write(json.dumps(result, ensure_ascii=False))


def fail(message: str) -> None:
    sys.stderr.write(message)
    sys.exit(1)


def parse_schedule(weekday: int | None, text: str, subjects: List[str]) -> Dict:
    if weekday is None or weekday not in range(1, 8):
        raise ValueError("Некорректный день недели")
    if not text.strip():
        raise ValueError("Пустой текст расписания")

    parsed = try_groq_schedule_parse(text.strip(), subjects)
    if parsed:
        return {"lessons": parsed}
    return {"lessons": fallback_schedule_parse(text.strip(), subjects)}


def parse_schedule_from_files(weekday: int | None, file_paths: List[str], subjects: List[str]) -> Dict:
    if weekday is None or weekday not in range(1, 8):
        raise ValueError("Некорректный день недели")
    if not file_paths:
        raise ValueError("Не переданы файлы для импорта")

    collected_text: List[str] = []
    for file_path in file_paths:
        path = Path(file_path)
        if not path.exists():
            continue
        extracted = extract_text_from_file(path)
        if extracted.strip():
            collected_text.append(extracted.strip())

    if not collected_text:
        raise ValueError("Не удалось извлечь текст из файлов")

    return parse_schedule(weekday, "\n".join(collected_text), subjects)


def extract_text_from_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        return ocr_image_with_groq(path)
    if ext == ".pdf":
        return "\n".join(pdf_to_chunks(path))
    if ext == ".docx":
        return extract_docx_text(path)
    if ext in {".txt", ".md", ".csv", ".json"}:
        return path.read_text(encoding="utf-8", errors="ignore")
    return path.read_text(encoding="utf-8", errors="ignore")


def extract_docx_text(path: Path) -> str:
    try:
        with zipfile.ZipFile(path) as archive:
            xml_bytes = archive.read("word/document.xml")
    except Exception:
        return ""

    try:
        root = ET.fromstring(xml_bytes)
    except ET.ParseError:
        return ""

    paragraphs = []
    namespace = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
    for paragraph in root.findall(".//w:p", namespace):
        parts = [node.text or "" for node in paragraph.findall('.//w:t', namespace)]
        line = "".join(parts).strip()
        if line:
            paragraphs.append(line)
    return "\n".join(paragraphs)


def ocr_image_with_groq(path: Path) -> str:
    if not GROQ_API_KEY:
        return ""
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    encoded = base64.b64encode(path.read_bytes()).decode("utf-8")
    payload = {
        "model": VISION_MODEL,
        "temperature": 0.1,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Извлеки текст школьного расписания с изображения. Верни только распознанный текст."},
                    {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}},
                ],
            }
        ],
    }
    response = requests.post(
        GROQ_BASE_URL,
        headers={
            "Authorization": f"Bearer {GROQ_API_KEY}",
            "Content-Type": "application/json",
        },
        json=payload,
        timeout=90,
    )
    if response.ok:
        data = response.json()
        return data["choices"][0]["message"]["content"]
    return ""


def try_groq_schedule_parse(text: str, subjects: List[str]) -> List[Dict] | None:
    if not GROQ_API_KEY:
        return None
    subject_text = ", ".join(subjects)
    system_prompt = (
        "Ты преобразуешь школьное расписание в JSON-массив уроков. "
        f"Используй только предметы из списка: {subject_text}. "
        "Текст может быть свободным, разговорным, с разным порядком слов, длительностью урока, номерами кабинета, учителем, домашним заданием. "
        "Если есть только время начала и длительность, сам вычисли время окончания. Если кабинет или учитель не указаны, оставь пустую строку. "
        "Верни только JSON вида {\"lessons\":[{\"subject\":\"Алгебра\",\"teacher\":\"\",\"room\":\"\",\"start_time\":\"08:30\",\"end_time\":\"09:15\",\"notes\":\"\",\"materials\":[\"\"]}]}."
    )
    response = call_groq(TEXT_MODEL, system_prompt, text, 0.1)
    if not response:
        return None
    parsed = extract_json_object(response)
    lessons = parsed.get("lessons", [])
    if not isinstance(lessons, list):
        return None
    normalized = []
    for lesson in lessons:
        normalized.append(
            {
                "subject": normalize_subject(lesson.get("subject", ""), subjects),
                "teacher": str(lesson.get("teacher", "")).strip(),
                "room": str(lesson.get("room", "")).strip(),
                "start_time": normalize_time(str(lesson.get("start_time", "08:30"))),
                "end_time": normalize_time(str(lesson.get("end_time", "09:15"))),
                "notes": str(lesson.get("notes", "")).strip(),
                "materials": [str(item).strip() for item in lesson.get("materials", []) if str(item).strip()],
            }
        )
    return normalized


def fallback_schedule_parse(text: str, subjects: List[str]) -> List[Dict]:
    lessons: List[Dict] = []
    chunks = split_schedule_chunks(text)
    for raw_line in chunks:
        line = raw_line.strip(" -\t")
        if not line:
            continue

        subject = extract_subject_from_text(line, subjects)
        time_match = re.search(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})", line)
        start_time = "08:30"
        end_time = "09:15"
        if time_match:
            start_time = normalize_time(time_match.group(1))
            end_time = normalize_time(time_match.group(2))
            line = line.replace(time_match.group(0), "").strip(" |")
        else:
            start_match = re.search(r"(?:в|на|с)?\s*(\d{1,2}:\d{2})", line, flags=re.IGNORECASE)
            if start_match:
                start_time = normalize_time(start_match.group(1))
            duration_match = re.search(r"(\d{2,3})\s*мин", line, flags=re.IGNORECASE)
            duration_minutes = int(duration_match.group(1)) if duration_match else 45
            end_time = add_minutes(start_time, duration_minutes)

        parts = [part.strip() for part in re.split(r"[|;]", line) if part.strip()]
        room_match = re.search(r"(?:каб(?:инет)?|ауд(?:итория)?)\s*\.?\s*([0-9A-Za-zА-Яа-я-]+)", line, flags=re.IGNORECASE)
        room = room_match.group(1).strip() if room_match else ""
        teacher = extract_teacher_from_text(line, subjects, subject)
        notes = build_notes_from_line(line, subject, teacher, room)

        lessons.append(
            {
                "subject": subject,
                "teacher": teacher or (parts[1] if len(parts) > 1 else ""),
                "room": room or (parts[2] if len(parts) > 2 else ""),
                "start_time": start_time,
                "end_time": end_time,
                "notes": notes or (parts[3] if len(parts) > 3 else ""),
                "materials": [item.strip() for item in parts[4:]] if len(parts) > 4 else extract_materials_from_line(line),
            }
        )
    if not lessons:
        raise ValueError("Не удалось распознать расписание")
    return lessons


def split_schedule_chunks(text: str) -> List[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) > 1:
        return lines
    return [chunk.strip() for chunk in re.split(r"(?<=[.!?])\s+|\s*;\s*", text) if chunk.strip()]


def extract_subject_from_text(text: str, subjects: List[str]) -> str:
    lowered = text.lower()
    for subject in subjects:
        subject_lower = subject.lower()
        if subject_lower in lowered:
            return subject
    return normalize_subject(text, subjects)


def extract_teacher_from_text(text: str, subjects: List[str], subject: str) -> str:
    cleaned = text
    for item in subjects:
        cleaned = re.sub(re.escape(item), "", cleaned, flags=re.IGNORECASE)
    if subject:
        cleaned = re.sub(re.escape(subject), "", cleaned, flags=re.IGNORECASE)
    match = re.search(r"([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.[А-ЯЁ]\.)?)", cleaned)
    return match.group(1).strip() if match else ""


def build_notes_from_line(text: str, subject: str, teacher: str, room: str) -> str:
    note = text
    for value in [subject, teacher]:
        if value:
            note = re.sub(re.escape(value), "", note, flags=re.IGNORECASE)
    if room:
        note = re.sub(rf"(?:каб(?:инет)?|ауд(?:итория)?)\s*\.?\s*{re.escape(room)}", "", note, flags=re.IGNORECASE)
    note = re.sub(r"\d{1,2}:\d{2}\s*[-–]\s*\d{1,2}:\d{2}", "", note)
    note = re.sub(r"(?:в|на|с)?\s*\d{1,2}:\d{2}", "", note, flags=re.IGNORECASE)
    note = re.sub(r"\d{2,3}\s*мин(?:ут[аы]?)?", "", note, flags=re.IGNORECASE)
    note = re.sub(r"\s+", " ", note).strip(" ,.-")
    return note


def extract_materials_from_line(text: str) -> List[str]:
    return [item for item in re.findall(r"[\w-]+\.(?:pdf|docx|pptx|txt)", text, flags=re.IGNORECASE)]


def add_minutes(start_time: str, minutes: int) -> str:
    hour, minute = map(int, start_time.split(":"))
    total = hour * 60 + minute + minutes
    total %= 24 * 60
    return f"{total // 60:02d}:{total % 60:02d}"


def normalize_subject(raw_subject: str, subjects: List[str]) -> str:
    value = raw_subject.strip().lower()
    if not value:
        return "Классный час"
    for subject in subjects:
        if subject.lower() == value or value in subject.lower() or subject.lower() in value:
            return subject
    return "Классный час"


def normalize_time(value: str) -> str:
    match = re.search(r"(\d{1,2}):(\d{2})", value)
    if not match:
        return "08:30"
    return f"{max(0, min(int(match.group(1)), 23)):02d}:{max(0, min(int(match.group(2)), 59)):02d}"


def index_pdfs(file_paths: List[str], storage_dir: str) -> Dict:
    storage_path = Path(storage_dir)
    storage_path.mkdir(parents=True, exist_ok=True)
    metadata_path = storage_path / "metadata.json"
    vectors_path = storage_path / "vectors.npy"

    metadata: List[Dict] = []
    existing_vectors = np.zeros((0, EMBED_DIM), dtype=np.float32)
    if metadata_path.exists() and vectors_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        existing_vectors = np.load(vectors_path)

    metadata_by_file: Dict[str, List[Dict]] = {}
    vectors_by_file: Dict[str, List[np.ndarray]] = {}
    for meta, vector in zip(metadata, existing_vectors):
        metadata_by_file.setdefault(meta["file_path"], []).append(meta)
        vectors_by_file.setdefault(meta["file_path"], []).append(vector)

    indexed = []
    for file_path in file_paths:
        pdf_path = Path(file_path)
        if not pdf_path.exists():
            continue
        chunks = pdf_to_chunks(pdf_path)
        metadata_by_file[str(pdf_path)] = [
            {"file_path": str(pdf_path), "title": pdf_path.name, "chunk_text": chunk} for chunk in chunks
        ]
        vectors_by_file[str(pdf_path)] = [embed_text(chunk) for chunk in chunks]
        indexed.append({"title": pdf_path.name, "file_path": str(pdf_path), "chunk_count": len(chunks)})

    flat_metadata: List[Dict] = []
    flat_vectors: List[np.ndarray] = []
    for file_path, file_metadata in metadata_by_file.items():
        for meta, vector in zip(file_metadata, vectors_by_file.get(file_path, [])):
            flat_metadata.append(meta)
            flat_vectors.append(vector)

    matrix = np.vstack(flat_vectors) if flat_vectors else np.zeros((0, EMBED_DIM), dtype=np.float32)
    np.save(vectors_path, matrix)
    metadata_path.write_text(json.dumps(flat_metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"indexed_files": indexed}


def pdf_to_chunks(pdf_path: Path) -> List[str]:
    reader = PdfReader(str(pdf_path))
    text = []
    for page in reader.pages:
        extracted = page.extract_text() or ""
        compact = re.sub(r"\s+", " ", extracted).strip()
        if compact:
            text.append(compact)
    full_text = "\n".join(text)
    if not full_text:
        return [f"Файл {pdf_path.name} пуст или текст не извлечен."]
    chunks: List[str] = []
    start = 0
    while start < len(full_text):
        end = min(start + 900, len(full_text))
        chunks.append(full_text[start:end])
        start = end - 150 if end < len(full_text) else end
    return chunks


def ask_ai(question: str, storage_dir: str) -> Dict:
    if not question.strip():
        raise ValueError("Пустой вопрос")
    chunks = retrieve_relevant_chunks(question, storage_dir, 4)
    context = "\n\n".join(f"[{chunk.title}] {chunk.chunk_text}" for chunk in chunks)
    sources = [chunk.title for chunk in chunks]

    if GROQ_API_KEY:
        if context:
            prompt = (
                f"Вопрос ученика: {question}\n\n"
                f"Контекст из учебников:\n{context}\n\n"
                "Формат: 1. Короткий вывод 2. Объяснение простыми словами 3. Что запомнить"
            )
            answer = call_groq(
                TEXT_MODEL,
                "Ты школьный AI-помощник. Отвечай строго по учебному контексту, но простым языком.",
                prompt,
                0.3,
            )
            if answer:
                return {"answer": answer, "sources": sources}
        else:
            prompt = (
                f"Вопрос ученика: {question}\n\n"
                "Дай полезный ответ даже без загруженных PDF. Если вопрос учебный, объясни тему просто и структурированно. "
                "Формат: 1. Короткий вывод 2. Объяснение простыми словами 3. Что запомнить"
            )
            answer = call_groq(
                TEXT_MODEL,
                "Ты школьный AI-помощник. Отвечай понятно, кратко и по делу.",
                prompt,
                0.3,
            )
            if answer:
                return {"answer": answer, "sources": []}

    if context:
        return {
            "answer": (
                "1. Короткий вывод\n"
                f"{first_sentence(summarize_context(context, 220))}\n\n"
                "2. Объяснение простыми словами\n"
                f"{summarize_context(context, 420)}\n\n"
                "3. Что запомнить\n- Назови тему.\n- Приведи 2 факта.\n- Сделай вывод."
            ),
            "sources": sources,
        }
    return {
        "answer": (
            "1. Короткий вывод\nЯ могу ответить и без PDF, но с учебниками ответ будет точнее.\n\n"
            "2. Объяснение простыми словами\nЗагрузи PDF-учебники, если хочешь ответы с опорой на конкретный параграф.\n\n"
            "3. Что запомнить\n- Можешь задать обычный вопрос прямо сейчас.\n- Для RAG сначала добавь материалы."
        ),
        "sources": [],
    }


def generate_plan(weekday: int, day_label: str, lessons: List[Dict]) -> Dict:
    if not lessons:
        return {"plan": "На выбранный день уроков пока нет. Сначала добавь расписание."}
    compact = "\n".join(
        f"{lesson['start_time']}-{lesson['end_time']} {lesson['subject']}: {lesson.get('notes', '')}" for lesson in lessons
    )
    if GROQ_API_KEY:
        prompt = (
            f"Составь школьнику умный план подготовки на {day_label}.\n"
            f"Уроки:\n{compact}\n\n"
            "Формат: блоки 'До школы', 'После уроков', 'Вечером'."
        )
        answer = call_groq(TEXT_MODEL, "Ты помогаешь школьнику планировать подготовку.", prompt, 0.3)
        if answer:
            return {"plan": answer}
    return {
        "plan": (
            f"До школы\nПроверь материалы на {day_label.lower()} и повтори первый урок.\n\n"
            "После уроков\nСразу закрой короткие задания и отметь сложные темы.\n\n"
            "Вечером\nСделай 1-2 самых важных предмета и подготовь вещи на завтра."
        )
    }


def send_telegram_message(bot_token: str, chat_id: str, text: str) -> Dict:
    if not bot_token.strip() or not chat_id.strip() or not text.strip():
        return {"ok": False}
    response = requests.post(
        f"https://api.telegram.org/bot{bot_token}/sendMessage",
        data={"chat_id": chat_id, "text": text},
        timeout=30,
    )
    return {"ok": response.ok}


def call_groq(model: str, system_prompt: str, user_prompt: str, temperature: float) -> str | None:
    api_key = GROQ_API_KEY
    if not api_key:
        return None
    payload = {
        "model": model,
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    response = requests.post(
        GROQ_BASE_URL,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=payload,
        timeout=90,
    )
    if response.ok:
        data = response.json()
        return data["choices"][0]["message"]["content"]
    return None


def retrieve_relevant_chunks(question: str, storage_dir: str, limit: int) -> List[ChunkRecord]:
    storage_path = Path(storage_dir)
    metadata_path = storage_path / "metadata.json"
    vectors_path = storage_path / "vectors.npy"
    if not metadata_path.exists() or not vectors_path.exists():
        return []
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    matrix = np.load(vectors_path)
    if len(metadata) == 0 or matrix.shape[0] == 0:
        return []
    query = embed_text(question)
    scored: List[Tuple[float, int]] = []
    for idx, vector in enumerate(matrix):
        scored.append((cosine_similarity(query, vector), idx))
    scored.sort(reverse=True, key=lambda item: item[0])
    return [
        ChunkRecord(
            file_path=metadata[idx]["file_path"],
            title=metadata[idx]["title"],
            chunk_text=metadata[idx]["chunk_text"],
        )
        for _, idx in scored[:limit]
    ]


def embed_text(text: str) -> np.ndarray:
    tokens = re.findall(r"[a-zA-Zа-яА-Я0-9]{2,}", text.lower())
    vector = np.zeros(EMBED_DIM, dtype=np.float32)
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        index = int.from_bytes(digest[:2], "big") % EMBED_DIM
        sign = 1.0 if digest[2] % 2 == 0 else -1.0
        vector[index] += sign
    norm = np.linalg.norm(vector)
    if norm > 0:
        vector /= norm
    return vector


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    denom = np.linalg.norm(a) * np.linalg.norm(b)
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


def extract_json_object(text: str) -> Dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("JSON object not found in model response")
    return json.loads(text[start : end + 1])


def summarize_context(text: str, max_len: int) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:max_len] + ("..." if len(compact) > max_len else "")


def first_sentence(text: str) -> str:
    compact = text.strip()
    if not compact:
        return "Найден материал, но его нужно уточнить."
    return re.split(r"(?<=[.!?])\s+", compact, maxsplit=1)[0]


def run_telegram_bot_cli(args: List[str]) -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db-path", required=True)
    parser.add_argument("--storage-dir", required=True)
    parser.add_argument("--bot-token", required=True)
    parser.add_argument("--chat-id", required=True)
    options = parser.parse_args(args)

    if telebot is None:
        raise RuntimeError("pyTelegramBotAPI не установлена")

    bot = telebot.TeleBot(options.bot_token, parse_mode=None)

    @bot.message_handler(commands=["start"])
    def handle_start(message):
        bot.send_message(message.chat.id, "SchoolMate bot активен. Доступны /today, /plan и обычные вопросы к ИИ.")

    @bot.message_handler(commands=["today"])
    def handle_today(message):
        bot.send_message(message.chat.id, build_today_summary(options.db_path))

    @bot.message_handler(commands=["plan"])
    def handle_plan(message):
        weekday = time.localtime().tm_wday + 1
        summary = build_schedule_for_day(options.db_path, weekday)
        response = generate_plan(weekday, day_label(weekday), summary)
        bot.send_message(message.chat.id, response["plan"])

    @bot.message_handler(func=lambda _: True)
    def handle_ai(message):
        response = ask_ai(message.text, options.storage_dir)
        bot.send_message(message.chat.id, response["answer"])

    while True:
        try:
            bot.infinity_polling(timeout=20, long_polling_timeout=20)
        except Exception:
            time.sleep(3)


def build_today_summary(db_path: str) -> str:
    weekday = time.localtime().tm_wday + 1
    lessons = build_schedule_for_day(db_path, weekday)
    if not lessons:
        return "На сегодня уроков в расписании нет."
    lines = [f"Сегодня: {day_label(weekday)}"]
    for lesson in lessons:
        lines.append(f"{lesson['start_time']}-{lesson['end_time']} {lesson['subject']} • {lesson['teacher']} • каб. {lesson['room']}")
    return "\n".join(lines)


def build_schedule_for_day(db_path: str, weekday: int) -> List[Dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT subject, teacher, room, start_time, end_time, notes FROM schedule_lessons WHERE weekday = ? ORDER BY start_time ASC",
        [weekday],
    ).fetchall()
    conn.close()
    return [dict(row) for row in rows]


def day_label(weekday: int) -> str:
    return {
        1: "Понедельник",
        2: "Вторник",
        3: "Среда",
        4: "Четверг",
        5: "Пятница",
        6: "Суббота",
        7: "Воскресенье",
    }.get(weekday, "День")


if __name__ == "__main__":
    main()


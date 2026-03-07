import hashlib
import json
import os
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

import numpy as np
import requests
from PyPDF2 import PdfReader


EMBED_DIM = 256
GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = "llama3-8b-8192"


class ChunkRecord:
    def __init__(self, file_path: str, title: str, chunk_text: str) -> None:
        self.file_path = file_path
        self.title = title
        self.chunk_text = chunk_text


def main() -> None:
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
            result = parse_schedule(
                weekday=payload.get("weekday"),
                text=payload.get("text", ""),
                subjects=payload.get("subjects", []),
            )
        elif action == "ask_ai":
            result = ask_ai(payload.get("question", ""), payload.get("storage_dir", ""))
        elif action == "index_pdfs":
            result = index_pdfs(payload.get("file_paths", []), payload.get("storage_dir", ""))
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


def parse_schedule(weekday: int | None, text: str, subjects: List[str]) -> Dict[str, List[Dict]]:
    if weekday is None or weekday not in range(1, 8):
        raise ValueError("Некорректный день недели")
    if not text.strip():
        raise ValueError("Пустой текст расписания")
    if not subjects:
        raise ValueError("Не передан список предметов")

    llm_result = try_groq_schedule_parse(weekday, text.strip(), subjects)
    if llm_result:
        return llm_result

    return {"lessons": parse_schedule_fallback(text.strip(), subjects)}


def try_groq_schedule_parse(weekday: int, text: str, subjects: List[str]) -> Dict | None:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return None

    subjects_text = ", ".join(subjects)
    system_prompt = (
        "Ты преобразуешь школьное расписание на один выбранный день в JSON. "
        "Разрешенные предметы: "
        f"{subjects_text}. "
        "Возвращай только JSON-объект формата "
        '{"lessons":[{"subject":"Алгебра","teacher":"","room":"","start_time":"08:30","end_time":"09:15","notes":"","materials":[""]}]}. '
        "Используй только предметы из списка. Если предмет в тексте написан неидеально, выбери ближайший из списка. "
        "Не добавляй weekday в ответ. Никаких пояснений вокруг JSON."
    )
    user_prompt = (
        f"День недели: {weekday}\n"
        f"Текст расписания:\n{text}\n\n"
        "Нужно выделить отдельные уроки, время, учителя, кабинет, заметки и материалы."
    )

    response_text = call_groq(system_prompt, user_prompt, temperature=0.1)
    if not response_text:
        return None

    parsed = extract_json_object(response_text)
    lessons = parsed.get("lessons", [])
    if not isinstance(lessons, list) or not lessons:
        raise ValueError("Groq не вернул уроки")

    for lesson in lessons:
        lesson["subject"] = normalize_subject(lesson.get("subject", ""), subjects)
        lesson["teacher"] = str(lesson.get("teacher", "")).strip()
        lesson["room"] = str(lesson.get("room", "")).strip()
        lesson["start_time"] = normalize_time(lesson.get("start_time", "08:30"))
        lesson["end_time"] = normalize_time(lesson.get("end_time", "09:15"))
        lesson["notes"] = str(lesson.get("notes", "")).strip()
        lesson["materials"] = [str(item).strip() for item in lesson.get("materials", []) if str(item).strip()]

    return {"lessons": lessons}


def parse_schedule_fallback(text: str, subjects: List[str]) -> List[Dict]:
    lessons: List[Dict] = []
    for raw_line in text.splitlines():
        line = raw_line.strip(" -\t")
        if not line:
            continue

        time_match = re.search(r"(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})", line)
        start_time, end_time = ("08:30", "09:15")
        if time_match:
            start_time = normalize_time(time_match.group(1))
            end_time = normalize_time(time_match.group(2))
            line = line.replace(time_match.group(0), "").strip(" |")

        parts = [part.strip() for part in line.split("|")]
        subject = normalize_subject(parts[0] if parts else "", subjects)
        teacher = parts[1] if len(parts) > 1 else ""
        room = parts[2] if len(parts) > 2 else ""
        notes = parts[3] if len(parts) > 3 else ""
        materials = [item.strip() for item in parts[4:]] if len(parts) > 4 else []

        lessons.append(
            {
                "subject": subject,
                "teacher": teacher,
                "room": room,
                "start_time": start_time,
                "end_time": end_time,
                "notes": notes,
                "materials": materials,
            }
        )

    if not lessons:
        raise ValueError("Не удалось распознать уроки из текста")

    return lessons


def normalize_subject(raw_subject: str, subjects: List[str]) -> str:
    value = raw_subject.strip().lower()
    if not value:
        return "Классный час"

    for subject in subjects:
        if subject.lower() == value:
            return subject

    for subject in subjects:
        if value in subject.lower() or subject.lower() in value:
            return subject

    return "Классный час"


def normalize_time(value: str) -> str:
    match = re.search(r"(\d{1,2}):(\d{2})", str(value))
    if not match:
        return "08:30"
    hour = int(match.group(1))
    minute = int(match.group(2))
    return f"{max(0, min(hour, 23)):02d}:{max(0, min(minute, 59)):02d}"


def ask_ai(question: str, storage_dir: str) -> Dict:
    if not question.strip():
        raise ValueError("Пустой вопрос")

    chunks = retrieve_relevant_chunks(question, storage_dir, limit=4)
    sources = [chunk.title for chunk in chunks]
    context = "\n\n".join(f"[{chunk.title}] {chunk.chunk_text}" for chunk in chunks)

    answer = generate_context_answer(question, context, sources) if context else generate_general_answer(question)
    return {"answer": answer, "sources": sources}


def generate_context_answer(question: str, context: str, sources: List[str]) -> str:
    if os.getenv("GROQ_API_KEY"):
        system_prompt = (
            "Ты школьный AI-помощник. Отвечай структурированно, коротко и понятно. "
            "Опирайся только на переданный контекст."
        )
        user_prompt = (
            f"Вопрос: {question}\n\n"
            f"Контекст:\n{context}\n\n"
            "Формат:\n1. Короткий вывод\n2. Объяснение простыми словами\n3. Что запомнить"
        )
        response = call_groq(system_prompt, user_prompt, temperature=0.3)
        if response:
            return response

    short_context = summarize_context(context, 420)
    unique_sources = ", ".join(dict.fromkeys(sources)) if sources else "локальная база"
    return (
        "1. Короткий вывод\n"
        f"{first_sentence(short_context)}\n\n"
        "2. Объяснение простыми словами\n"
        f"{short_context}\n\n"
        "3. Что запомнить\n"
        "- Назови основную идею темы.\n"
        "- Приведи 2-3 ключевых факта.\n"
        "- Сделай короткий вывод.\n\n"
        f"Источники: {unique_sources}"
    )


def generate_general_answer(question: str) -> str:
    if os.getenv("GROQ_API_KEY"):
        system_prompt = (
            "Ты школьный AI-помощник. Отвечай доброжелательно, структурированно и по делу. "
            "Если учебников в контексте нет, просто объясни тему своими словами."
        )
        user_prompt = (
            f"Вопрос ученика: {question}\n\n"
            "Формат:\n1. Короткий вывод\n2. Объяснение простыми словами\n3. Что запомнить"
        )
        response = call_groq(system_prompt, user_prompt, temperature=0.35)
        if response:
            return response

    return (
        "1. Короткий вывод\n"
        "Локальный индекс учебников пока пуст, поэтому ответ дан без опоры на материалы.\n\n"
        "2. Объяснение простыми словами\n"
        "Загрузи PDF-учебники, и я смогу отвечать точнее и с опорой на твои материалы.\n\n"
        "3. Что запомнить\n"
        "- Сформулируй вопрос короче.\n"
        "- Добавь учебник или конспект.\n"
        "- Повтори запрос после индексации."
    )


def call_groq(system_prompt: str, user_prompt: str, temperature: float = 0.2) -> str | None:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        return None

    payload = {
        "model": os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL),
        "temperature": temperature,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    headers = {
        "Authorization": f"Bearer {groq_key}",
        "Content-Type": "application/json",
    }
    response = requests.post(GROQ_BASE_URL, headers=headers, json=payload, timeout=60)
    if response.ok:
        data = response.json()
        return data["choices"][0]["message"]["content"]
    return None


def index_pdfs(file_paths: List[str], storage_dir: str) -> Dict:
    if not storage_dir:
        raise ValueError("Не передана директория для RAG-хранилища")

    storage_path = Path(storage_dir)
    storage_path.mkdir(parents=True, exist_ok=True)
    metadata_path = storage_path / "metadata.json"
    vectors_path = storage_path / "vectors.npy"

    metadata: List[Dict] = []
    existing_vectors = np.zeros((0, EMBED_DIM), dtype=np.float32)
    indexed_files: List[Dict] = []

    if metadata_path.exists() and vectors_path.exists():
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        existing_vectors = np.load(vectors_path)

    metadata_by_file: Dict[str, List[Dict]] = {}
    vectors_by_file: Dict[str, List[np.ndarray]] = {}
    for meta, vector in zip(metadata, existing_vectors):
        metadata_by_file.setdefault(meta["file_path"], []).append(meta)
        vectors_by_file.setdefault(meta["file_path"], []).append(vector)

    for file_path in file_paths:
        pdf_path = Path(file_path)
        if not pdf_path.exists():
            continue

        try:
            chunks = pdf_to_chunks(pdf_path)
        except Exception as exc:  # noqa: BLE001
            chunks = [f"Ошибка чтения {pdf_path.name}: {exc}"]

        metadata_by_file[str(pdf_path)] = [
            {"file_path": str(pdf_path), "title": pdf_path.name, "chunk_text": chunk} for chunk in chunks
        ]
        vectors_by_file[str(pdf_path)] = [embed_text(chunk) for chunk in chunks]
        indexed_files.append(
            {
                "title": pdf_path.name,
                "file_path": str(pdf_path),
                "chunk_count": len(chunks),
            }
        )

    flat_metadata: List[Dict] = []
    flat_vectors: List[np.ndarray] = []
    for file_path, file_metadata in metadata_by_file.items():
        file_vectors = vectors_by_file.get(file_path, [])
        for meta, vector in zip(file_metadata, file_vectors):
            flat_metadata.append(meta)
            flat_vectors.append(vector)

    matrix = np.vstack(flat_vectors) if flat_vectors else np.zeros((0, EMBED_DIM), dtype=np.float32)
    np.save(vectors_path, matrix)
    metadata_path.write_text(json.dumps(flat_metadata, ensure_ascii=False, indent=2), encoding="utf-8")

    return {"indexed_files": indexed_files}


def pdf_to_chunks(pdf_path: Path) -> List[str]:
    reader = PdfReader(str(pdf_path))
    pages_text: List[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        compact = re.sub(r"\s+", " ", text).strip()
        if compact:
            pages_text.append(compact)

    full_text = "\n".join(pages_text)
    if not full_text:
        return [f"Файл {pdf_path.name} пуст или текст не извлечен."]

    max_chars = 900
    overlap = 150
    chunks = []
    start = 0
    while start < len(full_text):
        end = min(start + max_chars, len(full_text))
        chunks.append(full_text[start:end])
        start = end - overlap if end < len(full_text) else end
    return chunks


def retrieve_relevant_chunks(question: str, storage_dir: str, limit: int = 4) -> List[ChunkRecord]:
    storage_path = Path(storage_dir)
    metadata_path = storage_path / "metadata.json"
    vectors_path = storage_path / "vectors.npy"
    if not metadata_path.exists() or not vectors_path.exists():
        return []

    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    matrix = np.load(vectors_path)
    if len(metadata) == 0 or matrix.shape[0] == 0:
        return []

    query_vector = embed_text(question)
    scores: List[Tuple[float, int]] = []
    for idx, vector in enumerate(matrix):
        scores.append((cosine_similarity(query_vector, vector), idx))

    scores.sort(reverse=True, key=lambda item: item[0])
    selected = scores[:limit]
    return [
        ChunkRecord(
            file_path=metadata[idx]["file_path"],
            title=metadata[idx]["title"],
            chunk_text=metadata[idx]["chunk_text"],
        )
        for _, idx in selected
    ]


def extract_json_object(text: str) -> Dict:
    start = text.find("{")
    end = text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("JSON object not found in model response")
    return json.loads(text[start : end + 1])


def first_sentence(text: str) -> str:
    compact = text.strip()
    if not compact:
        return "Найден материал, но его нужно уточнить."
    return re.split(r"(?<=[.!?])\s+", compact, maxsplit=1)[0]


def summarize_context(text: str, max_len: int) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    return compact[:max_len] + ("..." if len(compact) > max_len else "")


def embed_text(text: str) -> np.ndarray:
    tokens = re.findall(r"[a-zA-Zа-яА-Я0-9]{2,}", text.lower())
    vector = np.zeros(EMBED_DIM, dtype=np.float32)
    if not tokens:
        return vector

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


if __name__ == "__main__":
    main()

import argparse
import base64
import io
import json
import os
import re
import sys
import warnings
import zipfile
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List
from xml.etree import ElementTree as ET

import numpy as np
import requests
from PyPDF2 import PdfReader

warnings.filterwarnings("ignore", message="Unable to find acceptable character detection dependency.*")
try:
    from requests.exceptions import RequestsDependencyWarning
    warnings.simplefilter("ignore", RequestsDependencyWarning)
except Exception:
    pass

try:
    from fastapi import FastAPI, HTTPException
    from pydantic import BaseModel
except Exception:
    FastAPI = None
    HTTPException = RuntimeError
    BaseModel = object

try:
    from rapidocr_onnxruntime import RapidOCR
except Exception:
    RapidOCR = None

try:
    from PIL import Image
except Exception:
    Image = None

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
TEXT_MODEL = os.getenv("GROQ_TEXT_MODEL", "llama-3.3-70b-versatile")
VISION_MODEL = os.getenv("GROQ_VISION_MODEL", "llama-3.2-90b-vision-preview")
OCR_ENGINE = None
OCR_INIT_ATTEMPTED = False
CHUNK_SIZE = 900
CHUNK_OVERLAP = 180

try:
    sys.stdin.reconfigure(encoding="utf-8")
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass


class Chunk:
    def __init__(self, title: str, text: str, source: str, page: int = 0) -> None:
        self.title = title
        self.text = text
        self.source = source
        self.page = page


class PdfIndexPayload(BaseModel):
    file_paths: List[str]
    storage_dir: str


class AskPayload(BaseModel):
    question: str
    storage_dir: str


def main() -> None:
    if len(sys.argv) > 1 and sys.argv[1] == "serve":
        run_api()
        return

    raw = sys.stdin.read()
    if not raw.strip():
        fail("Empty input payload")
    envelope = json.loads(raw)
    action = envelope.get("action")
    payload = envelope.get("payload", {})

    handlers = {
        "parse_schedule": lambda: parse_schedule(payload.get("weekday", 1), payload.get("text", ""), payload.get("subjects", [])),
        "parse_schedule_from_files": lambda: parse_schedule_from_files(payload.get("weekday", 1), payload.get("file_paths", []), payload.get("subjects", [])),
        "index_pdfs": lambda: index_pdfs(payload.get("file_paths", []), payload.get("storage_dir", "")),
        "ask_ai": lambda: ask_ai(payload.get("question", ""), payload.get("storage_dir", "")),
        "generate_plan": lambda: generate_plan(payload.get("weekday"), payload.get("day_label", ""), payload.get("lessons", [])),
    }
    if action not in handlers:
        fail(f"Unsupported action: {action}")
    result = handlers[action]()
    sys.stdout.write(json.dumps(result, ensure_ascii=False))


def run_api() -> None:
    if FastAPI is None:
        fail("FastAPI is not installed")
    import uvicorn

    app = FastAPI(title="Nexara AI", version="0.3.0")

    @app.get("/health")
    async def health() -> Dict[str, Any]:
        return {"ok": True, "service": "nexara-python-ai"}

    @app.post("/index-pdfs")
    async def api_index_pdfs(payload: PdfIndexPayload) -> Dict[str, Any]:
        return index_pdfs(payload.file_paths, payload.storage_dir)

    @app.post("/ask")
    async def api_ask(payload: AskPayload) -> Dict[str, Any]:
        return ask_ai(payload.question, payload.storage_dir)

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8000")))


def fail(message: str) -> None:
    sys.stderr.write(message)
    sys.exit(1)


def call_groq(model: str, messages: List[Dict[str, Any]], temperature: float = 0.2) -> str | None:
    if not GROQ_API_KEY.strip():
        return None
    try:
        response = requests.post(
            GROQ_URL,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json; charset=utf-8",
            },
            json={"model": model, "messages": messages, "temperature": temperature},
            timeout=120,
        )
        if not response.ok:
            return None
        data = response.json()
        return data["choices"][0]["message"]["content"]
    except requests.RequestException:
        return None


def parse_schedule(weekday: int, text: str, subjects: List[str]) -> Dict[str, Any]:
    if not text.strip():
        raise ValueError("Schedule text is empty")
    text = normalize_ocr_text(text)
    try:
        fallback_lessons = fallback_parse(text, subjects)
    except Exception:
        fallback_lessons = coarse_parse(text, subjects)
    system = (
        "Ты извлекаешь школьное расписание из текста или OCR. "
        "Тебе дан список допустимых предметов. Исправляй опечатки и выбирай ближайший предмет только из списка. "
        "Жестко сопоставляй каждому уроку subject, room, start_time, end_time, teacher, notes. "
        "Если в строке есть кабинет, не теряй его. Если указано только время начала и длительность, вычисли время окончания. "
        "Если видишь пары значений времени, обязательно привязывай их к соответствующему предмету по порядку. "
        f"Список предметов: {', '.join(subjects)}. "
        'Верни только JSON вида {"lessons":[...]} без пояснений.'
    )
    raw = call_groq(TEXT_MODEL, [{"role": "system", "content": system}, {"role": "user", "content": text}], 0.1)
    if raw:
        try:
            parsed = json.loads(extract_json(raw))
            normalized = normalize_lessons(parsed.get("lessons", []), subjects)
            if fallback_lessons:
                normalized = merge_times_from_fallback(normalized, fallback_lessons)
            return {"lessons": normalized}
        except Exception:
            pass
    if not fallback_lessons:
        raise ValueError("Не удалось распознать расписание на изображении. Попробуй более чёткий скрин или допиши 1-2 урока текстом.")
    return {"lessons": fallback_lessons}


def parse_schedule_from_files(weekday: int, file_paths: List[str], subjects: List[str]) -> Dict[str, Any]:
    direct_lessons = []
    extracted = []
    for file_path in file_paths:
        path = Path(file_path)
        if not path.exists():
            continue
        if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
            direct = parse_schedule_cards_from_image(path, subjects)
            if direct:
                direct_lessons.extend(direct)
                continue
        try:
            extracted.append(extract_text_from_file(path))
        except Exception:
            continue
    if direct_lessons:
        return {"lessons": normalize_lessons(direct_lessons, subjects)}
    text = "\n".join(part.strip() for part in extracted if part.strip())
    if not text:
        raise ValueError("Не удалось распознать текст из файла или изображения.")
    return parse_schedule(weekday, text, subjects)


def extract_text_from_file(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp"}:
        return ocr_with_vision(path)
    if ext == ".pdf":
        return "\n".join(read_pdf_pages(path))
    if ext == ".docx":
        return docx_text(path)
    return path.read_text(encoding="utf-8", errors="ignore")


def get_ocr_engine():
    global OCR_ENGINE, OCR_INIT_ATTEMPTED
    if OCR_INIT_ATTEMPTED:
        return OCR_ENGINE
    OCR_INIT_ATTEMPTED = True
    if RapidOCR is None:
        return None
    try:
        OCR_ENGINE = RapidOCR()
    except Exception:
        OCR_ENGINE = None
    return OCR_ENGINE


def local_ocr_text(path: Path) -> str:
    engine = get_ocr_engine()
    if engine is None:
        return ""
    try:
        result, _ = engine(str(path))
    except Exception:
        return ""
    parts = []
    for item in result or []:
        if len(item) >= 2 and item[1]:
            parts.append(str(item[1]))
    return "\n".join(parts).strip()


def prepare_image_for_vision(path: Path) -> tuple[str, str]:
    if Image is None:
        mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
        return mime, base64.b64encode(path.read_bytes()).decode("utf-8")

    with Image.open(path) as image:
        image = image.convert("RGB")
        max_side = 1600
        if max(image.size) > max_side:
            image.thumbnail((max_side, max_side))
        buffer = io.BytesIO()
        image.save(buffer, format="JPEG", quality=92, optimize=True)
    return "image/jpeg", base64.b64encode(buffer.getvalue()).decode("utf-8")


def ocr_with_vision(path: Path) -> str:
    local_text = local_ocr_text(path)
    try:
        mime, encoded = prepare_image_for_vision(path)
    except Exception:
        return normalize_ocr_text(local_text)
    prompt = (
        "This is a screenshot or photo of a school schedule. "
        "Detect the language automatically and transcribe only schedule-related text. "
        "Ignore homework blocks, links, icons, avatars, status bars and bottom navigation. "
        "Keep each lesson as one compact block with lesson number, time range, subject and room when visible. "
        "Fix obvious OCR mistakes in times and subject names. "
        "Return plain text only, no JSON and no comments."
    )
    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}},
        ],
    }]
    try:
        vision_text = normalize_ocr_text(call_groq(VISION_MODEL, messages, 0.1) or "")
    except Exception:
        vision_text = ""
    local_text = normalize_ocr_text(local_text)
    return vision_text if len(vision_text.strip()) >= len(local_text.strip()) else local_text


def parse_schedule_cards_from_image(path: Path, subjects: List[str]) -> List[Dict[str, Any]]:
    if not GROQ_API_KEY.strip():
        return []
    try:
        mime, encoded = prepare_image_for_vision(path)
    except Exception:
        return []
    prompt = (
        "Extract lessons from this Russian school diary screenshot. "
        "Return only JSON in the form {\"lessons\":[...]}. "
        "Each lesson card starts with a header like '1 урок 08:30 - 09:15 каб. № 2'. "
        "Ignore break rows, homework blocks, status badges, and navigation. "
        "Do not merge repeated adjacent lessons. "
        "Normalize subjects only to this list: " + ", ".join(subjects) + ". "
        "Map 'Иностранный (английский) язык' to 'Английский язык'. "
        "Map 'Основы безопасности и защиты Родины' to 'ОБЖ'. "
        "Map 'Россия - мои горизонты', 'Разговоры о важном' and similar homeroom activities to 'Классный час'. "
        "Teacher must be empty unless a real teacher name is clearly visible. "
        "Keep room and exact lesson order."
    )
    messages = [{
        "role": "user",
        "content": [
            {"type": "text", "text": prompt},
            {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{encoded}"}},
        ],
    }]
    raw = call_groq(VISION_MODEL, messages, 0.0)
    if not raw:
        return []
    try:
        parsed = json.loads(extract_json(raw))
        return normalize_lessons(parsed.get("lessons", []), subjects)
    except Exception:
        return []


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


def read_pdf_pages(path: Path) -> List[str]:
    reader = PdfReader(str(path))
    pages = []
    for page in reader.pages:
        pages.append((page.extract_text() or "").strip())
    return [page for page in pages if page]


def split_text_chunks(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    normalized = re.sub(r"\s+", " ", text).strip()
    if not normalized:
        return []
    chunks = []
    start = 0
    while start < len(normalized):
        end = min(len(normalized), start + size)
        if end < len(normalized):
            cut = normalized.rfind(" ", start, end)
            if cut > start + 200:
                end = cut
        chunks.append(normalized[start:end].strip())
        if end >= len(normalized):
            break
        start = max(start + 1, end - overlap)
    return [chunk for chunk in chunks if chunk]


def fallback_parse(text: str, subjects: List[str]) -> List[Dict[str, Any]]:
    lessons = []
    lesson_duration = extract_minutes(text, r"(?:каждый урок|урок|lesson)\s*(?:идет|по|lasts)?\s*(\d{2,3})\s*(?:мин|min)") or 45
    break_duration = extract_minutes(text, r"(?:перемен[аы]|break)\s*(\d{1,3})\s*(?:мин|min)") or 10
    previous_end_time = ""
    base_start_time = extract_first_time(text) or "08:30"
    blocks = build_schedule_blocks(text)
    if not blocks:
        blocks = [[line] for line in split_schedule_segments(text)]
    for index, block in enumerate(blocks):
        line = " ".join(block).strip(" .;,\n\t")
        if not line:
            continue
        subject = detect_subject(block, subjects)
        if not subject:
            continue
        time_range = re.search(r"(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})", line)
        single_time = re.search(r"(\d{1,2}[:.]\d{2})", line)
        duration = extract_minutes(line, r"(\d{2,3})\s*(?:мин|min)") or lesson_duration
        if time_range:
            start_time = normalize_time(time_range.group(1))
            end_time = normalize_time(time_range.group(2))
        elif single_time:
            start_time = normalize_time(single_time.group(1))
            end_time = add_minutes(start_time, duration)
        elif previous_end_time:
            start_time = add_minutes(previous_end_time, break_duration)
            end_time = add_minutes(start_time, duration)
        else:
            start_time = base_start_time if index == 0 else add_minutes(base_start_time, index * (lesson_duration + break_duration))
            end_time = add_minutes(start_time, duration)
        room = re.search(r"(?:каб(?:инет)?|аудитория|room)\.?\s*([0-9A-Za-zА-Яа-я/-]+)", line, re.I)
        previous_end_time = end_time
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
        raise ValueError("Could not parse schedule")
    return lessons


def coarse_parse(text: str, subjects: List[str]) -> List[Dict[str, Any]]:
    lines = [normalize_schedule_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line and not is_ignored_schedule_line(line) and not is_break_line(line)]
    lessons: List[Dict[str, Any]] = []
    start_time = extract_first_time(text) or "08:30"
    lesson_duration = 45
    break_duration = 10
    for line in lines:
        subject = normalize_subject_label(line, subjects)
        if not subject:
            continue
        room_match = re.search(r"(?:каб(?:инет)?|аудитория|room)\.?\s*([0-9A-Za-zА-Яа-я/-]+)", line, re.I)
        range_match = re.search(r"(\d{1,2}[:.]\d{2})\s*[-–—]\s*(\d{1,2}[:.]\d{2})", line)
        if range_match:
            lesson_start = normalize_time(range_match.group(1))
            lesson_end = normalize_time(range_match.group(2))
            start_time = add_minutes(lesson_end, break_duration)
        else:
            lesson_start = start_time
            lesson_end = add_minutes(lesson_start, lesson_duration)
            start_time = add_minutes(lesson_end, break_duration)
        lessons.append({
            "subject": subject,
            "teacher": "",
            "room": room_match.group(1) if room_match else "",
            "start_time": lesson_start,
            "end_time": lesson_end,
            "notes": line,
            "materials": [],
        })
    return lessons


def split_schedule_segments(text: str) -> List[str]:
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if len(lines) > 1:
        return lines
    normalized = re.sub(r"\s+", " ", text.replace("\r", " ")).strip()
    ordinal_pattern = re.compile(r"(?i)(?:^|[;,]\s*|\.\s*)(?:\d{1,2}\s*(?:урок)?|первый|второй|третий|четвертый|пятый|шестой|седьмой|восьмой)\s*[-:?]?")
    positions = [match.start() for match in ordinal_pattern.finditer(normalized)]
    if positions:
        positions.append(len(normalized))
        chunks = []
        for index in range(len(positions) - 1):
            chunk = normalized[positions[index]:positions[index + 1]].strip(" ,.;")
            if chunk:
                chunks.append(chunk)
        if chunks:
            return chunks
    return [part.strip() for part in re.split(r"\n+|;", text) if part.strip()]


def build_schedule_blocks(text: str) -> List[List[str]]:
    lines = [normalize_schedule_line(line) for line in text.splitlines()]
    lines = [line for line in lines if line and not is_ignored_schedule_line(line)]
    blocks: List[List[str]] = []
    current: List[str] = []
    for line in lines:
        if is_break_line(line):
            continue
        if is_lesson_header(line):
            if current:
                blocks.append(current)
            current = [line]
            continue
        if current:
            current.append(line)
        else:
            current = [line]
    if current:
        blocks.append(current)
    return blocks


def normalize_ocr_text(text: str) -> str:
    cleaned = text.replace("\r", "\n")
    cleaned = cleaned.replace("–", "-").replace("—", "-").replace("−", "-")
    cleaned = re.sub(r"(?<=\d)[.](?=\d{2}\b)", ":", cleaned)
    cleaned = re.sub(r"[ \t]+", " ", cleaned)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def normalize_schedule_line(line: str) -> str:
    line = normalize_ocr_text(line).strip(" |")
    line = re.sub(r"\s+", " ", line)
    return line.strip()


def is_lesson_header(line: str) -> bool:
    return bool(
        re.search(r"\b\d{1,2}\s*(?:урок|lesson)\b", line, re.I)
        or re.search(r"\d{1,2}[:.]\d{2}\s*[-–—]\s*\d{1,2}[:.]\d{2}", line)
    )


def is_break_line(line: str) -> bool:
    return bool(re.search(r"\b(перемена|break)\b", line, re.I))


def is_ignored_schedule_line(line: str) -> bool:
    lowered = line.lower()
    ignored_fragments = [
        "домашнее задание",
        "homework",
        "gosuslugi",
        "http://",
        "https://",
        "оценки",
        "задания",
        "школа",
        "профиль",
        "ученик",
    ]
    if any(fragment in lowered for fragment in ignored_fragments):
        return True
    if re.fullmatch(r"[пвсч]\w{0,2}", lowered):
        return True
    if re.fullmatch(r"\d{1,2}", lowered):
        return True
    return False


def detect_subject(block: List[str], subjects: List[str]) -> str:
    for line in block:
        subject = normalize_subject_label(line, subjects)
        if subject:
            return subject
    best_subject = ""
    best_score = 0.0
    for line in block:
        subject = best_subject_match(line, subjects)
        if not subject:
            continue
        score = SequenceMatcher(None, line.lower(), subject.lower()).ratio()
        if subject.lower() in line.lower():
            score += 1.0
        if score > best_score:
            best_score = score
            best_subject = subject
    return best_subject


def normalize_subject_label(text: str, subjects: List[str]) -> str:
    lowered = normalize_ocr_text(text).lower()
    alias_map = [
        (["иностранный (английский) язык", "иностранный английский язык", "иностранный язык", "английский язык"], "Английский язык"),
        (["основы безопасности и защиты родины", "обж", "осзр"], "ОБЖ"),
        (["россия - мои горизонты", "разговоры о важном", "мои горизонты", "классный час"], "Классный час"),
        (["вероятность и статистика"], "Вероятность и статистика"),
        (["физическая культура"], "Физическая культура"),
    ]
    for aliases, canonical in alias_map:
        if any(alias in lowered for alias in aliases):
            return canonical
    return best_subject_match(text, subjects)


def best_subject_match(text: str, subjects: List[str]) -> str:
    lowered = text.lower()
    for subject in subjects:
        if subject.lower() in lowered:
            return subject
    normalized = re.sub(r"[^a-zа-я0-9]+", "", lowered, flags=re.I)
    best_subject = ""
    best_score = 0.0
    for subject in subjects:
        candidate = re.sub(r"[^a-zа-я0-9]+", "", subject.lower(), flags=re.I)
        score = SequenceMatcher(None, normalized, candidate).ratio()
        if score > best_score:
            best_score = score
            best_subject = subject
    return best_subject if best_score >= 0.55 else ""


def extract_minutes(text: str, pattern: str) -> int | None:
    match = re.search(pattern, text, re.I)
    if not match:
        return None
    try:
        return int(match.group(1))
    except ValueError:
        return None


def extract_first_time(text: str) -> str | None:
    match = re.search(r"(\d{1,2}:\d{2})", text)
    return normalize_time(match.group(1)) if match else None


def normalize_lessons(lessons: List[Dict[str, Any]], subjects: List[str]) -> List[Dict[str, Any]]:
    normalized = []
    next_start = "08:30"
    for lesson in lessons:
        subject_raw = str(lesson.get("subject", "")).strip()
        subject = next((item for item in subjects if item.lower() == subject_raw.lower()), None)
        if subject is None:
            subject = normalize_subject_label(subject_raw, subjects)
        if not subject:
            subject = next((item for item in subjects if item.lower() in subject_raw.lower() or subject_raw.lower() in item.lower()), "Классный час")
        start_time = normalize_time(str(lesson.get("start_time", next_start)))
        end_time = normalize_time(str(lesson.get("end_time", add_minutes(start_time, 45))))
        teacher = str(lesson.get("teacher", "")).strip()
        if teacher and not looks_like_teacher_name(teacher):
            teacher = ""
        normalized.append({
            "subject": subject,
            "teacher": teacher,
            "room": str(lesson.get("room", "")).strip(),
            "start_time": start_time,
            "end_time": end_time,
            "notes": str(lesson.get("notes", "")).strip(),
            "materials": [str(item).strip() for item in lesson.get("materials", []) if str(item).strip()],
        })
        next_start = add_minutes(end_time, 10)
    return normalized


def merge_times_from_fallback(primary: List[Dict[str, Any]], fallback: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not primary or not fallback or len(primary) != len(fallback):
        return primary
    primary_unique = {f"{item.get('start_time', '')}-{item.get('end_time', '')}" for item in primary}
    if len(primary_unique) > 1:
        return primary
    merged = []
    for index, lesson in enumerate(primary):
        fallback_lesson = fallback[index]
        merged.append({**lesson, "start_time": fallback_lesson["start_time"], "end_time": fallback_lesson["end_time"]})
    return merged


def looks_like_teacher_name(value: str) -> bool:
    cleaned = value.strip()
    if len(cleaned) < 6:
        return False
    if re.search(r"\b(домашнее|контрольная|не задано|внеурочная|дополнительное)\b", cleaned, re.I):
        return False
    return bool(
        re.search(r"[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+){1,2}", cleaned)
        or re.search(r"[А-ЯЁ][а-яё]+\s+[А-ЯЁ]\.[А-ЯЁ]\.", cleaned)
    )


def normalize_time(value: str) -> str:
    match = re.search(r"(\d{1,2})[:.](\d{2})", value)
    if not match:
        return "08:30"
    return f"{int(match.group(1)):02d}:{match.group(2)}"


def add_minutes(start: str, minutes: int) -> str:
    hour, minute = [int(part) for part in start.split(":")]
    total = hour * 60 + minute + minutes
    return f"{(total // 60) % 24:02d}:{total % 60:02d}"


def extract_materials(text: str) -> List[str]:
    return re.findall(r"[\w-]+\.(?:pdf|docx|pptx|txt)", text, re.I)


def index_pdfs(file_paths: List[str], storage_dir: str) -> Dict[str, Any]:
    chunks: List[Dict[str, Any]] = []
    for file_path in file_paths:
        path = Path(file_path)
        if not path.exists():
            continue
        for page_number, page_text in enumerate(read_pdf_pages(path), start=1):
            for chunk_index, chunk_text in enumerate(split_text_chunks(page_text)):
                chunks.append({
                    "title": path.name,
                    "source": str(path),
                    "page": page_number,
                    "text": chunk_text,
                    "embedding": embed_text(chunk_text).tolist(),
                    "chunk_id": f"{path.name}:{page_number}:{chunk_index}",
                })
    target = Path(storage_dir)
    target.mkdir(parents=True, exist_ok=True)
    (target / "index.json").write_text(json.dumps(chunks, ensure_ascii=False), encoding="utf-8")
    return {"ok": True, "chunks": len(chunks)}


def ask_ai(question: str, storage_dir: str) -> Dict[str, Any]:
    context_chunks = retrieve_chunks(question, storage_dir)
    sources = list(dict.fromkeys(chunk.title for chunk in context_chunks))
    context_lines = [
        f"[{chunk.title}, стр. {chunk.page}] {chunk.text}"
        for chunk in context_chunks
    ]
    found_phrase = ""
    if context_chunks:
        preview = context_chunks[0].text[:220].strip()
        found_phrase = f"Найдено в учебнике [{context_chunks[0].title}]: {preview}"
    messages = [{
        "role": "system",
        "content": (
            "Ты AI-помощник ученика. Если дан контекст из учебника, опирайся только на него. "
            "Сначала кратко укажи, что найдено в учебнике, затем решай или объясняй задание. "
            "Если контекста нет, честно скажи, что точного фрагмента не найдено."
        ),
    }]
    if context_lines:
        messages.append({
            "role": "user",
            "content": (
                f"Вопрос: {question}\n\n"
                f"Фрагменты из учебников:\n{chr(10).join(context_lines)}\n\n"
                "Ответ начни фразой 'Найдено в учебнике [Название]: ...', затем дай решение."
            ),
        })
    else:
        messages.append({
            "role": "user",
            "content": f"Вопрос: {question}\n\nТочного фрагмента в учебниках не найдено. Дай честный полезный ответ.",
        })
    answer = call_groq(TEXT_MODEL, messages, 0.25)
    if not answer:
        answer = (
            f"{found_phrase or 'Найдено в учебнике [не найдено]: точного фрагмента нет.'}\n\n"
            "Не удалось получить ответ от модели. Проверь подключение и повтори запрос."
        )
    elif context_chunks and "Найдено в учебнике" not in answer:
        answer = f"{found_phrase}\n\n{answer}"
    return {"answer": answer, "sources": sources}


def generate_plan(weekday: int, day_label: str, lessons: List[Dict[str, Any]]) -> Dict[str, Any]:
    compact = "\n".join(f"{item['start_time']}-{item['end_time']} {item['subject']}: {item.get('notes', '')}" for item in lessons)
    answer = call_groq(TEXT_MODEL, [
        {"role": "system", "content": "Ты помогаешь школьнику распределять нагрузку без перегруза."},
        {"role": "user", "content": f"Составь план подготовки на {day_label}. Уроки:\n{compact}\n\nФормат: До школы / После уроков / Вечером."},
    ], 0.3)
    return {"plan": answer or "До школы\nПроверь первый урок и собери материалы.\n\nПосле уроков\nСделай короткие задания сразу.\n\nВечером\nЗакрой 1-2 сложных предмета и подготовь вещи на завтра."}


def embed_text(text: str) -> np.ndarray:
    vector = np.zeros(384, dtype=np.float32)
    for token in re.findall(r"[\w№-]+", text.lower()):
        bucket = int.from_bytes(token.encode("utf-8"), "little", signed=False) % 384
        vector[bucket] += 1.0
    norm = np.linalg.norm(vector)
    return vector if norm == 0 else vector / norm


def retrieve_chunks(question: str, storage_dir: str) -> List[Chunk]:
    index_path = Path(storage_dir) / "index.json"
    if not index_path.exists():
        return []
    raw = json.loads(index_path.read_text(encoding="utf-8"))
    query = embed_text(question)
    question_lower = question.lower()
    question_tokens = set(re.findall(r"[\w№-]+", question_lower))
    task_numbers = set(re.findall(r"(?:№\s*|\bномер\s*)(\d{1,4})", question_lower))
    scored = []
    for item in raw:
        text = str(item.get("text", ""))
        text_lower = text.lower()
        text_tokens = set(re.findall(r"[\w№-]+", text_lower))
        lexical_bonus = float(len(question_tokens & text_tokens)) * 0.45
        number_bonus = 0.0
        for number in task_numbers:
            if re.search(rf"(?:№\s*{re.escape(number)}|\b{re.escape(number)}\b)", text_lower):
                number_bonus += 2.5
        score = float(np.dot(query, np.array(item.get("embedding", embed_text(text).tolist()), dtype=np.float32)))
        score += lexical_bonus + number_bonus
        scored.append((score, Chunk(item.get("title", "Материал"), text, item.get("source", ""), int(item.get("page", 0)))))
    scored.sort(key=lambda value: value[0], reverse=True)
    return [chunk for score, chunk in scored[:5] if score > 0]


def extract_json(raw: str) -> str:
    start = raw.find("{")
    end = raw.rfind("}")
    return raw[start:end + 1] if start >= 0 and end >= 0 else raw


if __name__ == "__main__":
    main()

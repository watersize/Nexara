from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import httpx
import os
import json

router = APIRouter()

class Lesson(BaseModel):
    subject: str
    teacher: str
    room: str
    start_time: str
    end_time: str
    notes: str
    materials: List[str]

class PlanRequest(BaseModel):
    weekday: int
    day_label: str
    lessons: List[Lesson]

@router.post("/plan")
async def generate_plan(req: PlanRequest):
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")
        
    schedule_text = f"Расписание на {req.day_label}:\n"
    for l in req.lessons:
        schedule_text += f"- {l.start_time}-{l.end_time}: {l.subject} (каб. {l.room})\n"
        if l.notes:
            schedule_text += f"  Заметки: {l.notes}\n"

    prompt = f"""
    Ты креативный и полезный ИИ-помощник для школьника.
    Твоя задача — составить краткий и мотивирующий план на день на основе расписания.
    Сформируй вывод в формате Markdown:
    - До школы (что подготовить/проверить)
    - В школе (на чем сфокусироваться)
    - После уроков (какие домашки сделать)
    Будь краток, обращайся на "ты". Максимум 10-15 строк.

    Вот расписание на сегодня:
    {schedule_text}
    """

    payload = {
        "model": "llama-3.1-70b-versatile",
        "messages": [
            {"role": "system", "content": "You are a helpful, organized student assistant."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.7
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers={
            "Authorization": f"Bearer {GROQ_API_KEY}"
        })
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Groq API error")
        
        reply = resp.json()["choices"][0]["message"]["content"].strip()
        return {"plan": reply}

class ChatRequest(BaseModel):
    question: str
    context: str

@router.post("/ask")
async def ask_ai(req: ChatRequest):
    GROQ_API_KEY = os.getenv("GROQ_API_KEY")
    if not GROQ_API_KEY:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY is not configured")

    prompt = f"""
    Ты умный школьный помощник. Ответь на вопрос ученика используя предоставленный контекст из учебников (если он есть).
    Если контекст релевантен, обязательно используй его. Если нет - отвечай, опираясь на свои знания, но будь краток.

    Контекст:
    {req.context}

    Вопрос:
    {req.question}
    """

    payload = {
        "model": "llama-3.1-70b-versatile",
        "messages": [
            {"role": "system", "content": "Ты дружелюбный ИИ-помощник, помогающий с учебой. Пиши на русском."},
            {"role": "user", "content": prompt}
        ],
        "temperature": 0.5
    }

    async with httpx.AsyncClient(timeout=45.0) as client:
        resp = await client.post("https://api.groq.com/openai/v1/chat/completions", json=payload, headers={
            "Authorization": f"Bearer {GROQ_API_KEY}"
        })
        if resp.status_code != 200:
            raise HTTPException(status_code=500, detail="Groq API error")
        
        reply = resp.json()["choices"][0]["message"]["content"].strip()
        return {"answer": reply}

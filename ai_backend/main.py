from fastapi import FastAPI
from dotenv import load_dotenv

import os

load_dotenv()

from routers import ocr, rag, telegram_bot, chat

app = FastAPI(title="Nexara AI Backend")

app.include_router(ocr.router, prefix="/api/ocr", tags=["ocr"])
app.include_router(rag.router, prefix="/api/rag", tags=["rag"])
app.include_router(telegram_bot.router, prefix="/api/telegram", tags=["telegram"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])

@app.get("/")
def read_root():
    return {"status": "ok", "app": "Nexara AI FastAPI Backend"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

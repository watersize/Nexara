from fastapi import APIRouter, HTTPException, Request
from supabase import create_client, Client
import telebot
import os

router = APIRouter()
bot = None
supabase: Client = None

@router.on_event("startup")
def init_bot():
    global bot, supabase
    tg_token = os.getenv("TG_BOT_TOKEN")
    if tg_token:
        bot = telebot.TeleBot(tg_token)
    
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_KEY")
    if supabase_url and supabase_key:
        supabase = create_client(supabase_url, supabase_key)

# Webhook endpoint if you host the bot
@router.post("/webhook")
async def process_webhook(request: Request):
    if bot is None:
        raise HTTPException(status_code=500, detail="Bot is not initialized.")
    json_str = await request.body()
    update = telebot.types.Update.de_json(json_str.decode('utf-8'))
    bot.process_new_updates([update])
    return {"status": "ok"}

# Simple notification endpoint for Go Backend or Client to trigger a telegram message
@router.post("/notify")
async def send_notification(chat_id: str, message: str):
    if bot is None:
        raise HTTPException(status_code=500, detail="Bot is not initialized.")
    bot.send_message(chat_id, message)
    return {"status": "ok"}

# The bot handler function for /start
def handle_start(message):
    text = message.text.split()
    if len(text) > 1:
        sync_code = text[1]  # /start <SYNC_CODE>
        # Update supabase with telegram chat id.
        # User needs to request a sync code from Nexara.
        if supabase:
            res = supabase.table('users').update({
                "tg_chat_id": str(message.chat.id)
            }).eq("sync_code", sync_code).execute()
        bot.reply_to(message, "Аккаунт Nexara успешно привязан! Теперь сюда будут приходить уведомления о расписании.")
    else:
        bot.reply_to(message, "Добро пожаловать в Nexara Bot. Чтобы привязать аккаунт, введите свой код синхронизации из приложения или перейдите по ссылке из приложения.")

# Normally, you would register handlers if bot is using long polling.
# If using webhooks, you register once.
if bot:
    bot.message_handler(commands=['start'])(handle_start)
    

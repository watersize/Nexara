package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	supabaseURL = os.Getenv("SUPABASE_URL")
	supabaseKey = os.Getenv("SUPABASE_ANON_KEY")
	groqAPIKey  = os.Getenv("GROQ_API_KEY")
	dbPool      *pgxpool.Pool
)

// Middleware для UTF-8 и CORS
func utf8Handler(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		h(w, r)
	}
}

func main() {
	// Подключение к БД
	dbURL := os.Getenv("SUPABASE_DB_URL")
	if dbURL != "" {
		pool, err := pgxpool.New(context.Background(), dbURL)
		if err == nil {
			dbPool = pool
			log.Println("DB Connected")
		}
	}

	http.HandleFunc("/health", utf8Handler(func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"ok": true, "time": time.Now().Format(time.RFC3339)})
	}))

	http.HandleFunc("/auth/login", utf8Handler(handleLogin))
	http.HandleFunc("/ai/schedule", utf8Handler(handleAISchedule))
	http.HandleFunc("/sync/file", utf8Handler(handleDeleteFile))
	http.HandleFunc("/telegram/session", utf8Handler(handleTelegramSession))

	log.Println("Server starting on :7860")
	if err := http.ListenAndServe(":7860", nil); err != nil {
		log.Fatal(err)
	}
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	json.NewDecoder(r.Body).Decode(&body)

	authURL := fmt.Sprintf("%s/auth/v1/token?grant_type=password", supabaseURL)
	raw, _ := json.Marshal(map[string]string{"email": body["email"], "password": body["password"]})

	req, _ := http.NewRequest("POST", authURL, bytes.NewBuffer(raw))
	req.Header.Set("apikey", supabaseKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Auth error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	io.Copy(w, resp.Body)
}

func handleAISchedule(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	json.NewDecoder(r.Body).Decode(&body)

	// Твой кастомный промпт для исправления OCR
	prompt := "Strictly use Russian. Do not use 'Классный час' for unknown fields. Use 'Неизвестно'. Time format: HH:MM-HH:MM."

	payload := map[string]any{
		"model": "llama-3.2-90b-vision-preview",
		"messages": []any{
			map[string]string{"role": "system", "content": prompt},
			map[string]string{"role": "user", "content": body["raw_input"]},
		},
	}

	raw, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "https://api.groq.com/openai/v1/chat/completions", bytes.NewBuffer(raw))
	req.Header.Set("Authorization", "Bearer "+groqAPIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		http.Error(w, "Groq error", http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	io.Copy(w, resp.Body)
}

func handleDeleteFile(w http.ResponseWriter, r *http.Request) {
	if r.Method != "DELETE" {
		return
	}
	var req map[string]string
	json.NewDecoder(r.Body).Decode(&req)

	// 1. Удаление из БД
	if dbPool != nil {
		dbPool.Exec(context.Background(), "DELETE FROM public.files WHERE user_id = $1 AND file_hash = $2", req["user_id"], req["hash"])
	}

	// 2. Удаление из Supabase Storage Bucket
	storageURL := fmt.Sprintf("%s/storage/v1/object/textbooks/%s/%s", supabaseURL, req["user_id"], req["hash"])
	sReq, _ := http.NewRequest("DELETE", storageURL, nil)
	sReq.Header.Set("apikey", supabaseKey)
	sReq.Header.Set("Authorization", "Bearer "+supabaseKey)
	http.DefaultClient.Do(sReq)

	json.NewEncoder(w).Encode(map[string]bool{"ok": true})
}

func handleTelegramSession(w http.ResponseWriter, r *http.Request) {
	var body map[string]string
	json.NewDecoder(r.Body).Decode(&body)

	// Добавлена проверка длины user_id, чтобы избежать паники при пустой строке
	userID := body["user_id"]
	shortID := ""
	if len(userID) >= 5 {
		shortID = userID[:5]
	} else {
		shortID = userID
	}

	token := fmt.Sprintf("tg_%d_%s", time.Now().Unix(), shortID)

	if dbPool != nil {
		dbPool.Exec(context.Background(), "INSERT INTO public.telegram_link_tokens (token, user_id, expires_at) VALUES ($1, $2, now() + interval '20 minutes')", token, body["user_id"])
	}

	json.NewEncoder(w).Encode(map[string]string{
		"token": token,
		"link":  fmt.Sprintf("tg://resolve?domain=%s&start=%s", os.Getenv("TELEGRAM_BOT_USERNAME"), token),
	})
}

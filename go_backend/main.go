package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	tgbotapi "github.com/go-telegram-bot-api/telegram-bot-api/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var subjects = []string{
	"Алгебра",
	"Геометрия",
	"Вероятность и статистика",
	"Русский язык",
	"Физика",
	"Химия",
	"Биология",
	"Физическая культура",
	"География",
	"Информатика",
	"История",
	"Обществознание",
	"Английский язык",
	"Литература",
	"Технология",
	"Классный час",
	"ОБЖ",
}

const (
	textModel   = "llama-3.3-70b-versatile"
	visionModel = "llama-3.2-90b-vision-preview"
)

type server struct {
	supabaseURL     string
	supabaseAnonKey string
	groqAPIKey      string
	telegramToken   string
	botUsername     string
	client          *http.Client
	db              *pgxpool.Pool
	bot             *tgbotapi.BotAPI
}

type authRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type scheduleRequest struct {
	RawInput    string `json:"raw_input"`
	ImageBase64 string `json:"image_base64"`
}

type authSession struct {
	UserID       string `json:"user_id"`
	Email        string `json:"email"`
	DisplayName  string `json:"display_name"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
}

type authResponse struct {
	Ok      bool         `json:"ok"`
	Message string       `json:"message"`
	Session *authSession `json:"session,omitempty"`
}

type scheduleLesson struct {
	Subject   string   `json:"subject"`
	Teacher   string   `json:"teacher"`
	Room      string   `json:"room"`
	StartTime string   `json:"start_time"`
	EndTime   string   `json:"end_time"`
	Notes     string   `json:"notes"`
	Materials []string `json:"materials"`
}

type scheduleResponse struct {
	Ok      bool             `json:"ok"`
	Lessons []scheduleLesson `json:"lessons"`
}

type syncProfilePayload struct {
	UserID         string          `json:"user_id"`
	Email          string          `json:"email"`
	TelegramChatID *int64          `json:"telegram_chat_id,omitempty"`
	Notes          json.RawMessage `json:"notes,omitempty"`
}

type syncSchedulePayload struct {
	UserID     string           `json:"user_id" binding:"required"`
	WeekNumber int              `json:"week_number" binding:"required"`
	Weekday    int              `json:"weekday" binding:"required"`
	Lessons    []scheduleLesson `json:"lessons"`
	Revision   string           `json:"revision,omitempty"`
}

type telegramSessionRequest struct {
	UserID string `json:"user_id" binding:"required"`
	Email  string `json:"email"`
}

type telegramSessionResponse struct {
	Ok    bool   `json:"ok"`
	Token string `json:"token"`
}

type deleteFileRequest struct {
	UserID string `json:"user_id" binding:"required"`
	Hash   string `json:"hash" binding:"required"`
}

type notificationRequest struct {
	Message string   `json:"message" binding:"required"`
	Emails  []string `json:"emails,omitempty"`
	UserIDs []string `json:"user_ids,omitempty"`
	ChatIDs []int64  `json:"chat_ids,omitempty"`
	SendAll bool     `json:"send_all,omitempty"`
}

type notificationResponse struct {
	Ok         bool    `json:"ok"`
	Sent       int     `json:"sent"`
	Skipped    int     `json:"skipped"`
	Recipients []int64 `json:"recipients"`
}

type syncScheduleRecord struct {
	UserID     string           `json:"user_id"`
	WeekNumber int              `json:"week_number"`
	Weekday    int              `json:"weekday"`
	Lessons    []scheduleLesson `json:"lessons"`
	UpdatedAt  string           `json:"updated_at"`
}

type syncBootstrapResponse struct {
	Ok             bool                 `json:"ok"`
	TelegramChatID *int64               `json:"telegram_chat_id,omitempty"`
	Schedules      []syncScheduleRecord `json:"schedules"`
}

type supabaseSession struct {
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	User         struct {
		ID    string `json:"id"`
		Email string `json:"email"`
	} `json:"user"`
}

type groqEnvelope struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
}

type groqLessons struct {
	Lessons []scheduleLesson `json:"lessons"`
}

func main() {
	srv, err := newServer()
	if err != nil {
		log.Fatal(err)
	}
	if srv.db != nil && srv.bot != nil {
		go srv.StartBot()
	}

	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(utf8Middleware())
	router.Use(cors.New(cors.Config{
		AllowAllOrigins: true,
		AllowMethods:    []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowHeaders:    []string{"Origin", "Content-Type", "Accept", "Authorization"},
		ExposeHeaders:   []string{"Content-Length"},
		MaxAge:          12 * time.Hour,
	}))

	router.GET("/health", func(c *gin.Context) {
		jsonOK(c, http.StatusOK, gin.H{
			"ok":       true,
			"service":  "nexara-go-backend",
			"encoding": "utf-8",
			"bot":      srv.bot != nil,
		})
	})
	router.POST("/auth/signup", srv.signup)
	router.POST("/auth/login", srv.login)
	router.POST("/ai/schedule", srv.aiSchedule)
	router.POST("/sync/profile", srv.syncProfile)
	router.GET("/sync/bootstrap", srv.syncBootstrap)
	router.POST("/sync/schedule", srv.syncSchedule)
	router.DELETE("/sync/file", srv.deleteFile)
	router.POST("/telegram/session", srv.createTelegramSession)
	router.POST("/send-notification", srv.sendNotification)

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "7860"
	}
	log.Printf("Nexara backend listening on :%s", port)
	if err := router.Run(":" + port); err != nil {
		log.Fatal(err)
	}
}

func newServer() (*server, error) {
	srv := &server{
		supabaseURL:     strings.TrimRight(mustEnv("SUPABASE_URL"), "/"),
		supabaseAnonKey: mustEnv("SUPABASE_ANON_KEY"),
		groqAPIKey:      strings.TrimSpace(os.Getenv("GROQ_API_KEY")),
		telegramToken:   strings.TrimSpace(os.Getenv("TELEGRAM_BOT_TOKEN")),
		botUsername:     strings.TrimSpace(os.Getenv("TELEGRAM_BOT_USERNAME")),
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}

	dbURL := strings.TrimSpace(os.Getenv("SUPABASE_DB_URL"))
	if dbURL != "" {
		pool, err := pgxpool.New(context.Background(), dbURL)
		if err != nil {
			return nil, fmt.Errorf("db connect failed: %w", err)
		}
		srv.db = pool
	}

	if srv.telegramToken != "" {
		bot, err := tgbotapi.NewBotAPI(srv.telegramToken)
		if err != nil {
			return nil, fmt.Errorf("telegram bot init failed: %w", err)
		}
		srv.bot = bot
		if srv.botUsername == "" && bot.Self.UserName != "" {
			srv.botUsername = bot.Self.UserName
		}
	}
	return srv, nil
}

func utf8Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Content-Type", "application/json; charset=utf-8")
		c.Next()
	}
}

func jsonOK(c *gin.Context, status int, payload any) {
	c.Header("Content-Type", "application/json; charset=utf-8")
	c.JSON(status, payload)
}

func jsonError(c *gin.Context, status int, message string) {
	jsonOK(c, status, gin.H{"ok": false, "message": message})
}

func (s *server) signup(c *gin.Context) {
	var payload authRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	reqBody := map[string]any{"email": strings.TrimSpace(payload.Email), "password": payload.Password}
	session, rawMessage, err := s.callSupabaseAuth(c, "/auth/v1/signup", reqBody)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	response := authResponse{Ok: true, Message: "Письмо для подтверждения отправлено на почту."}
	if rawMessage != "" {
		response.Message = rawMessage
	}
	if session != nil && session.AccessToken != "" {
		response.Message = "Аккаунт создан"
		response.Session = mapSession(session)
	}
	jsonOK(c, http.StatusOK, response)
}

func (s *server) login(c *gin.Context) {
	var payload authRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	reqBody := map[string]any{"email": strings.TrimSpace(payload.Email), "password": payload.Password}
	session, _, err := s.callSupabaseAuth(c, "/auth/v1/token?grant_type=password", reqBody)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	if session == nil || session.AccessToken == "" {
		jsonError(c, http.StatusUnauthorized, "Не удалось получить JWT от Supabase")
		return
	}
	jsonOK(c, http.StatusOK, authResponse{
		Ok:      true,
		Message: "Вход выполнен",
		Session: mapSession(session),
	})
}

func (s *server) aiSchedule(c *gin.Context) {
	var payload scheduleRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(payload.RawInput) == "" && strings.TrimSpace(payload.ImageBase64) == "" {
		jsonError(c, http.StatusBadRequest, "Нужен текст или изображение")
		return
	}
	lessons, err := s.analyzeSchedule(c, payload)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	jsonOK(c, http.StatusOK, scheduleResponse{Ok: true, Lessons: lessons})
}

func (s *server) syncProfile(c *gin.Context) {
	if s.db == nil {
		jsonError(c, http.StatusServiceUnavailable, "SUPABASE_DB_URL is not configured")
		return
	}
	var payload syncProfilePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(payload.UserID) == "" || strings.TrimSpace(payload.Email) == "" {
		jsonError(c, http.StatusBadRequest, "user_id and email are required")
		return
	}
	_, err := s.db.Exec(
		c,
		`insert into public.users (id, email, telegram_chat_id, notes)
		 values ($1, $2, $3, coalesce($4, '{}'::jsonb))
		 on conflict (id) do update set
		    email = excluded.email,
		    telegram_chat_id = coalesce(excluded.telegram_chat_id, public.users.telegram_chat_id),
		    notes = coalesce(excluded.notes, public.users.notes)`,
		payload.UserID,
		strings.TrimSpace(strings.ToLower(payload.Email)),
		payload.TelegramChatID,
		payload.Notes,
	)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	jsonOK(c, http.StatusOK, gin.H{"ok": true, "message": "Профиль синхронизирован"})
}

func (s *server) syncBootstrap(c *gin.Context) {
	if s.db == nil {
		jsonError(c, http.StatusServiceUnavailable, "SUPABASE_DB_URL is not configured")
		return
	}
	userID := strings.TrimSpace(c.Query("user_id"))
	if userID == "" {
		jsonError(c, http.StatusBadRequest, "user_id is required")
		return
	}
	rows, err := s.db.Query(c, `select week_number, day_of_week, lessons, updated_at from public.schedules where user_id = $1 order by week_number, day_of_week`, userID)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	defer rows.Close()

	result := syncBootstrapResponse{Ok: true, Schedules: make([]syncScheduleRecord, 0, 7)}
	for rows.Next() {
		var weekNumber int
		var weekday int
		var lessonsRaw []byte
		var updatedAt time.Time
		if err := rows.Scan(&weekNumber, &weekday, &lessonsRaw, &updatedAt); err != nil {
			jsonError(c, http.StatusBadGateway, err.Error())
			return
		}
		var lessons []scheduleLesson
		_ = json.Unmarshal(lessonsRaw, &lessons)
		result.Schedules = append(result.Schedules, syncScheduleRecord{
			UserID:     userID,
			WeekNumber: weekNumber,
			Weekday:    weekday,
			Lessons:    lessons,
			UpdatedAt:  updatedAt.Format(time.RFC3339),
		})
	}
	_ = s.db.QueryRow(c, `select telegram_chat_id from public.users where id = $1`, userID).Scan(&result.TelegramChatID)
	jsonOK(c, http.StatusOK, result)
}

func (s *server) syncSchedule(c *gin.Context) {
	if s.db == nil {
		jsonError(c, http.StatusServiceUnavailable, "SUPABASE_DB_URL is not configured")
		return
	}
	var payload syncSchedulePayload
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	if payload.WeekNumber < 1 || payload.WeekNumber > 52 {
		jsonError(c, http.StatusBadRequest, "week_number must be between 1 and 52")
		return
	}
	if payload.Weekday < 1 || payload.Weekday > 7 {
		jsonError(c, http.StatusBadRequest, "weekday must be between 1 and 7")
		return
	}
	encodedLessons, err := json.Marshal(payload.Lessons)
	if err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	_, err = s.db.Exec(
		c,
		`insert into public.schedules (user_id, week_number, day_of_week, lessons)
		 values ($1, $2, $3, $4::jsonb)
		 on conflict (user_id, week_number, day_of_week) do update set
		    lessons = excluded.lessons,
		    updated_at = now()`,
		payload.UserID,
		payload.WeekNumber,
		payload.Weekday,
		string(encodedLessons),
	)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	jsonOK(c, http.StatusOK, gin.H{"ok": true, "message": "Расписание синхронизировано"})
}

func (s *server) sendNotification(c *gin.Context) {
	if s.bot == nil {
		jsonError(c, http.StatusServiceUnavailable, "Telegram bot is not configured")
		return
	}
	var payload notificationRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	recipients, err := s.resolveRecipients(c, payload)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	sent := 0
	skipped := 0
	for _, chatID := range recipients {
		msg := tgbotapi.NewMessage(chatID, payload.Message)
		if _, err := s.bot.Send(msg); err != nil {
			log.Printf("telegram send failed for %d: %v", chatID, err)
			skipped++
			continue
		}
		sent++
	}
	jsonOK(c, http.StatusOK, notificationResponse{
		Ok:         true,
		Sent:       sent,
		Skipped:    skipped,
		Recipients: recipients,
	})
}

func (s *server) createTelegramSession(c *gin.Context) {
	if s.db == nil {
		jsonError(c, http.StatusServiceUnavailable, "SUPABASE_DB_URL is not configured")
		return
	}
	var payload telegramSessionRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	token := fmt.Sprintf("tg_%d_%s", time.Now().Unix(), strings.ReplaceAll(payload.UserID, "-", ""))
	_, err := s.db.Exec(
		c,
		`insert into public.telegram_link_tokens (token, user_id, email, expires_at)
		 values ($1, $2, nullif($3, ''), now() + interval '20 minutes')
		 on conflict (token) do update set
		    user_id = excluded.user_id,
		    email = excluded.email,
		    expires_at = excluded.expires_at,
		    consumed_at = null`,
		token,
		payload.UserID,
		strings.TrimSpace(strings.ToLower(payload.Email)),
	)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	jsonOK(c, http.StatusOK, telegramSessionResponse{Ok: true, Token: token})
}

func (s *server) deleteFile(c *gin.Context) {
	if s.db == nil {
		jsonError(c, http.StatusServiceUnavailable, "SUPABASE_DB_URL is not configured")
		return
	}
	var payload deleteFileRequest
	if err := c.ShouldBindJSON(&payload); err != nil {
		jsonError(c, http.StatusBadRequest, err.Error())
		return
	}
	_, err := s.db.Exec(c, `delete from public.files where user_id = $1 and file_hash = $2`, payload.UserID, payload.Hash)
	if err != nil {
		jsonError(c, http.StatusBadGateway, err.Error())
		return
	}
	jsonOK(c, http.StatusOK, gin.H{"ok": true, "message": "file deleted"})
}

func (s *server) StartBot() {
	if s.bot == nil || s.db == nil {
		return
	}
	cfg := tgbotapi.NewUpdate(0)
	cfg.Timeout = 30
	updates := s.bot.GetUpdatesChan(cfg)
	for update := range updates {
		if update.Message == nil {
			continue
		}
		if update.Message.IsCommand() && update.Message.Command() == "start" {
			identifier := strings.TrimSpace(update.Message.CommandArguments())
			if identifier == "" {
				reply := tgbotapi.NewMessage(update.Message.Chat.ID, "Открой приложение Nexara и нажми «Привязать Telegram» ещё раз.")
				_, _ = s.bot.Send(reply)
				continue
			}
			if err := s.bindTelegramIdentity(context.Background(), identifier, update.Message.Chat.ID); err != nil {
				reply := tgbotapi.NewMessage(update.Message.Chat.ID, "Не удалось привязать Telegram. Проверь аккаунт и попробуй ещё раз.")
				_, _ = s.bot.Send(reply)
				log.Printf("telegram bind failed: %v", err)
				continue
			}
			reply := tgbotapi.NewMessage(update.Message.Chat.ID, "Telegram подключен к Nexara.")
			_, _ = s.bot.Send(reply)
		}
	}
}

func (s *server) bindTelegramIdentity(ctx context.Context, identifier string, chatID int64) error {
	if err := s.consumeTelegramToken(ctx, identifier, chatID); err == nil {
		return nil
	}
	return s.saveTelegramChatID(ctx, identifier, chatID)
}

func (s *server) consumeTelegramToken(ctx context.Context, token string, chatID int64) error {
	if s.db == nil {
		return errors.New("db is not configured")
	}
	var userID string
	err := s.db.QueryRow(
		ctx,
		`update public.telegram_link_tokens
		 set consumed_at = now()
		 where token = $1 and consumed_at is null and expires_at > now()
		 returning user_id`,
		token,
	).Scan(&userID)
	if err != nil {
		return err
	}
	_, err = s.db.Exec(ctx, `update public.users set telegram_chat_id = $1 where id = $2`, chatID, userID)
	return err
}

func (s *server) saveTelegramChatID(ctx context.Context, identifier string, chatID int64) error {
	if s.db == nil {
		return errors.New("db is not configured")
	}
	tag, err := s.db.Exec(
		ctx,
		`update public.users
		 set telegram_chat_id = $1
		 where id::text = $2 or lower(email) = lower($2)`,
		chatID,
		identifier,
	)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return errors.New("user was not found")
	}
	return nil
}

func (s *server) resolveRecipients(ctx context.Context, payload notificationRequest) ([]int64, error) {
	if len(payload.ChatIDs) > 0 {
		return payload.ChatIDs, nil
	}
	if s.db == nil {
		return nil, errors.New("db is not configured")
	}
	query := `select telegram_chat_id from public.users where telegram_chat_id is not null`
	args := []any{}
	if payload.SendAll {
		rows, err := s.db.Query(ctx, query)
		if err != nil {
			return nil, err
		}
		return scanChatIDs(rows)
	}
	if len(payload.UserIDs) > 0 {
		query += ` and id = any($1)`
		args = append(args, payload.UserIDs)
	} else if len(payload.Emails) > 0 {
		query += ` and lower(email) = any($1)`
		lowered := make([]string, 0, len(payload.Emails))
		for _, email := range payload.Emails {
			lowered = append(lowered, strings.ToLower(strings.TrimSpace(email)))
		}
		args = append(args, lowered)
	} else {
		return nil, errors.New("no recipients were provided")
	}
	rows, err := s.db.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	return scanChatIDs(rows)
}

func scanChatIDs(rows pgxRows) ([]int64, error) {
	defer rows.Close()
	recipients := make([]int64, 0)
	for rows.Next() {
		var chatID int64
		if err := rows.Scan(&chatID); err != nil {
			return nil, err
		}
		recipients = append(recipients, chatID)
	}
	return recipients, rows.Err()
}

type pgxRows interface {
	Next() bool
	Scan(dest ...any) error
	Close()
	Err() error
}

func (s *server) analyzeSchedule(ctx context.Context, payload scheduleRequest) ([]scheduleLesson, error) {
	prompt := fmt.Sprintf(
		"Распознай школьное расписание. Используй только предметы из списка: %s. "+
			"Если у урока указано время начала и длительность, вычисли время окончания. "+
			"Верни только JSON вида {\"lessons\":[...]} с полями subject, teacher, room, start_time, end_time, notes, materials.",
		strings.Join(subjects, ", "),
	)
	var content string
	var err error
	if strings.TrimSpace(payload.ImageBase64) != "" {
		content, err = s.callGroqVision(ctx, prompt, payload.RawInput, payload.ImageBase64)
	} else {
		content, err = s.callGroqText(ctx, prompt, payload.RawInput)
	}
	if err != nil {
		return nil, err
	}
	parsed := extractJSON(content)
	var response groqLessons
	if err := json.Unmarshal([]byte(parsed), &response); err != nil {
		return fallbackLessons(payload.RawInput), nil
	}
	return normalizeLessons(response.Lessons), nil
}

func (s *server) callGroqText(ctx context.Context, systemPrompt string, userPrompt string) (string, error) {
	messages := []map[string]string{
		{"role": "system", "content": systemPrompt},
		{"role": "user", "content": userPrompt},
	}
	return s.callGroq(ctx, textModel, messages)
}

func (s *server) callGroqVision(ctx context.Context, systemPrompt string, userPrompt string, imageBase64 string) (string, error) {
	if s.groqAPIKey == "" {
		return "", errors.New("GROQ_API_KEY is not configured")
	}
	if _, err := base64.StdEncoding.DecodeString(cleanBase64(imageBase64)); err != nil {
		return "", fmt.Errorf("некорректный image_base64: %w", err)
	}
	body := map[string]any{
		"model":       visionModel,
		"temperature": 0.1,
		"messages": []any{
			map[string]any{"role": "system", "content": systemPrompt},
			map[string]any{
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": strings.TrimSpace(userPrompt)},
					map[string]any{"type": "image_url", "image_url": map[string]any{"url": ensureDataURL(imageBase64)}},
				},
			},
		},
	}
	return s.sendGroqRequest(ctx, body)
}

func (s *server) callGroq(ctx context.Context, model string, messages []map[string]string) (string, error) {
	if s.groqAPIKey == "" {
		return "", errors.New("GROQ_API_KEY is not configured")
	}
	body := map[string]any{"model": model, "temperature": 0.1, "messages": messages}
	return s.sendGroqRequest(ctx, body)
}

func (s *server) sendGroqRequest(ctx context.Context, payload map[string]any) (string, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.groq.com/openai/v1/chat/completions", bytes.NewReader(encoded))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Authorization", "Bearer "+s.groqAPIKey)
	resp, err := s.client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("ошибка Groq: %s", string(raw))
	}
	var envelope groqEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		return "", err
	}
	if len(envelope.Choices) == 0 {
		return "", errors.New("Groq вернул пустой ответ")
	}
	return envelope.Choices[0].Message.Content, nil
}

func (s *server) callSupabaseAuth(ctx context.Context, path string, payload map[string]any) (*supabaseSession, string, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, "", err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.supabaseURL+path, bytes.NewReader(raw))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Accept", "application/json; charset=utf-8")
	req.Header.Set("apikey", s.supabaseAnonKey)
	req.Header.Set("Authorization", "Bearer "+s.supabaseAnonKey)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, "", fmt.Errorf("%s", body)
	}
	var session supabaseSession
	if err := json.Unmarshal(body, &session); err != nil {
		return nil, string(body), nil
	}
	return &session, "", nil
}

func mapSession(session *supabaseSession) *authSession {
	if session == nil {
		return nil
	}
	return &authSession{
		UserID:       session.User.ID,
		Email:        session.User.Email,
		DisplayName:  displayNameFromEmail(session.User.Email),
		AccessToken:  session.AccessToken,
		RefreshToken: session.RefreshToken,
	}
}

func fallbackLessons(rawInput string) []scheduleLesson {
	lines := strings.Split(rawInput, "\n")
	lessons := make([]scheduleLesson, 0, len(lines))
	start := "08:30"
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		subject := findSubject(line)
		end := addMinutes(start, 45)
		lessons = append(lessons, scheduleLesson{
			Subject:   subject,
			StartTime: start,
			EndTime:   end,
			Notes:     line,
			Materials: []string{},
		})
		start = addMinutes(end, 10)
	}
	return lessons
}

func normalizeLessons(lessons []scheduleLesson) []scheduleLesson {
	normalized := make([]scheduleLesson, 0, len(lessons))
	start := "08:30"
	for index, lesson := range lessons {
		lesson.Subject = findSubject(lesson.Subject)
		if strings.TrimSpace(lesson.StartTime) == "" {
			lesson.StartTime = start
		}
		if strings.TrimSpace(lesson.EndTime) == "" {
			lesson.EndTime = addMinutes(lesson.StartTime, 45)
		}
		if lesson.Materials == nil {
			lesson.Materials = []string{}
		}
		normalized = append(normalized, lesson)
		start = addMinutes(lesson.EndTime, 10)
		if index == 0 && strings.TrimSpace(lesson.StartTime) != "" {
			start = addMinutes(lesson.EndTime, 10)
		}
	}
	return normalized
}

func findSubject(text string) string {
	lower := strings.ToLower(text)
	for _, subject := range subjects {
		if strings.Contains(lower, strings.ToLower(subject)) {
			return subject
		}
	}
	return "Классный час"
}

func extractJSON(raw string) string {
	start := strings.Index(raw, "{")
	end := strings.LastIndex(raw, "}")
	if start >= 0 && end > start {
		return raw[start : end+1]
	}
	return raw
}

func cleanBase64(raw string) string {
	if parts := strings.SplitN(raw, ",", 2); len(parts) == 2 {
		return parts[1]
	}
	return raw
}

func ensureDataURL(raw string) string {
	if strings.HasPrefix(raw, "data:") {
		return raw
	}
	return "data:image/png;base64," + cleanBase64(raw)
}

func displayNameFromEmail(email string) string {
	if email == "" {
		return "Nexara User"
	}
	return strings.Split(email, "@")[0]
}

func addMinutes(start string, minutes int) string {
	parts := strings.Split(start, ":")
	if len(parts) != 2 {
		return "09:15"
	}
	var hour, minute int
	fmt.Sscanf(parts[0], "%d", &hour)
	fmt.Sscanf(parts[1], "%d", &minute)
	total := hour*60 + minute + minutes
	return fmt.Sprintf("%02d:%02d", (total/60)%24, total%60)
}

func mustEnv(name string) string {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		log.Fatalf("%s is required", name)
	}
	return value
}

func init() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
}

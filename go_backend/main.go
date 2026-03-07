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
    "regexp"
    "strings"
    "time"

    "github.com/gin-contrib/cors"
    "github.com/gin-gonic/gin"
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
    client          *http.Client
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
    srv := &server{
        supabaseURL:     strings.TrimRight(mustEnv("SUPABASE_URL"), "/"),
        supabaseAnonKey: mustEnv("SUPABASE_ANON_KEY"),
        groqAPIKey:      mustEnv("GROQ_API_KEY"),
        client: &http.Client{
            Timeout: 30 * time.Second,
        },
    }

    gin.SetMode(gin.ReleaseMode)
    router := gin.New()
    router.Use(gin.Recovery())
    router.Use(cors.New(cors.Config{
        AllowAllOrigins: true,
        AllowMethods:    []string{"GET", "POST", "OPTIONS"},
        AllowHeaders:    []string{"Origin", "Content-Type", "Accept", "Authorization"},
        ExposeHeaders:   []string{"Content-Length"},
        MaxAge:          12 * time.Hour,
    }))

    router.GET("/health", func(c *gin.Context) {
        c.Header("Content-Type", "application/json; charset=utf-8")
        c.JSON(http.StatusOK, gin.H{"ok": true, "service": "nexara-hf-backend", "encoding": "utf-8"})
    })

    router.POST("/auth/signup", srv.signup)
    router.POST("/auth/login", srv.login)
    router.POST("/ai/schedule", srv.aiSchedule)

    port := strings.TrimSpace(os.Getenv("PORT"))
    if port == "" {
        port = "7860"
    }

    log.Printf("Nexara backend listening on :%s", port)
    if err := router.Run(":" + port); err != nil {
        log.Fatal(err)
    }
}

func (s *server) signup(c *gin.Context) {
    var payload authRequest
    if err := c.ShouldBindJSON(&payload); err != nil {
        jsonError(c, http.StatusBadRequest, err.Error())
        return
    }

    reqBody := map[string]any{
        "email":    strings.TrimSpace(payload.Email),
        "password": payload.Password,
    }

    session, rawMessage, err := s.callSupabaseAuth(c, "/auth/v1/signup", reqBody)
    if err != nil {
        jsonError(c, http.StatusBadGateway, err.Error())
        return
    }

    response := authResponse{
        Ok:      true,
        Message: "Письмо для подтверждения отправлено на почту.",
    }
    if rawMessage != "" {
        response.Message = rawMessage
    }
    if session != nil && session.AccessToken != "" {
        response.Message = "Аккаунт создан"
        response.Session = &authSession{
            UserID:       session.User.ID,
            Email:        session.User.Email,
            DisplayName:  displayNameFromEmail(session.User.Email),
            AccessToken:  session.AccessToken,
            RefreshToken: session.RefreshToken,
        }
    }

    c.Header("Content-Type", "application/json; charset=utf-8")
    c.JSON(http.StatusOK, response)
}

func (s *server) login(c *gin.Context) {
    var payload authRequest
    if err := c.ShouldBindJSON(&payload); err != nil {
        jsonError(c, http.StatusBadRequest, err.Error())
        return
    }

    reqBody := map[string]any{
        "email":    strings.TrimSpace(payload.Email),
        "password": payload.Password,
    }

    session, _, err := s.callSupabaseAuth(c, "/auth/v1/token?grant_type=password", reqBody)
    if err != nil {
        jsonError(c, http.StatusBadGateway, err.Error())
        return
    }
    if session == nil || session.AccessToken == "" {
        jsonError(c, http.StatusUnauthorized, "Не удалось получить JWT от Supabase")
        return
    }

    c.Header("Content-Type", "application/json; charset=utf-8")
    c.JSON(http.StatusOK, authResponse{
        Ok:      true,
        Message: "Вход выполнен",
        Session: &authSession{
            UserID:       session.User.ID,
            Email:        session.User.Email,
            DisplayName:  displayNameFromEmail(session.User.Email),
            AccessToken:  session.AccessToken,
            RefreshToken: session.RefreshToken,
        },
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

    c.Header("Content-Type", "application/json; charset=utf-8")
    c.JSON(http.StatusOK, scheduleResponse{Ok: true, Lessons: lessons})
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
    if _, err := base64.StdEncoding.DecodeString(cleanBase64(imageBase64)); err != nil {
        return "", fmt.Errorf("некорректный image_base64: %w", err)
    }

    body := map[string]any{
        "model":       visionModel,
        "temperature": 0.1,
        "messages": []any{
            map[string]any{
                "role":    "system",
                "content": systemPrompt,
            },
            map[string]any{
                "role": "user",
                "content": []any{
                    map[string]any{"type": "text", "text": strings.TrimSpace(userPrompt)},
                    map[string]any{
                        "type": "image_url",
                        "image_url": map[string]any{
                            "url": ensureDataURL(imageBase64),
                        },
                    },
                },
            },
        },
    }
    return s.sendGroqRequest(ctx, body)
}

func (s *server) callGroq(ctx context.Context, model string, messages []map[string]string) (string, error) {
    body := map[string]any{
        "model":       model,
        "temperature": 0.1,
        "messages":    messages,
    }
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
    req.Header.Set("Content-Type", "application/json")
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
    encoded, err := json.Marshal(payload)
    if err != nil {
        return nil, "", err
    }

    req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.supabaseURL+path, bytes.NewReader(encoded))
    if err != nil {
        return nil, "", err
    }
    req.Header.Set("Content-Type", "application/json")
    req.Header.Set("apikey", s.supabaseAnonKey)
    req.Header.Set("Authorization", "Bearer "+s.supabaseAnonKey)

    resp, err := s.client.Do(req)
    if err != nil {
        return nil, "", err
    }
    defer resp.Body.Close()

    raw, _ := io.ReadAll(resp.Body)
    if resp.StatusCode >= 300 {
        return nil, "", fmt.Errorf("ошибка Supabase Auth: %s", string(raw))
    }

    var session supabaseSession
    if err := json.Unmarshal(raw, &session); err != nil {
        return nil, strings.TrimSpace(string(raw)), nil
    }
    return &session, strings.TrimSpace(string(raw)), nil
}

func normalizeLessons(input []scheduleLesson) []scheduleLesson {
    output := make([]scheduleLesson, 0, len(input))
    for _, lesson := range input {
        start := normalizeTime(lesson.StartTime, extractStart(lesson.Notes))
        end := normalizeTime(lesson.EndTime, addMinutes(start, extractDuration(lesson.Notes)))
        output = append(output, scheduleLesson{
            Subject:   normalizeSubject(lesson.Subject),
            Teacher:   strings.TrimSpace(lesson.Teacher),
            Room:      strings.TrimSpace(lesson.Room),
            StartTime: start,
            EndTime:   end,
            Notes:     strings.TrimSpace(lesson.Notes),
            Materials: compactStrings(lesson.Materials),
        })
    }
    if len(output) == 0 {
        return fallbackLessons("")
    }
    return output
}

func fallbackLessons(raw string) []scheduleLesson {
    lines := regexp.MustCompile(`\n+|;`).Split(raw, -1)
    result := make([]scheduleLesson, 0)
    for _, line := range lines {
        line = strings.TrimSpace(line)
        if line == "" {
            continue
        }
        start := extractStart(line)
        result = append(result, scheduleLesson{
            Subject:   normalizeSubject(line),
            Teacher:   "",
            Room:      extractRoom(line),
            StartTime: start,
            EndTime:   addMinutes(start, extractDuration(line)),
            Notes:     line,
            Materials: []string{},
        })
    }
    if len(result) == 0 {
        result = append(result, scheduleLesson{
            Subject:   "Классный час",
            Teacher:   "",
            Room:      "",
            StartTime: "08:30",
            EndTime:   "09:15",
            Notes:     "Добавь текст или скриншот расписания.",
            Materials: []string{},
        })
    }
    return result
}

func normalizeSubject(raw string) string {
    lowered := strings.ToLower(strings.TrimSpace(raw))
    for _, subject := range subjects {
        subjectLower := strings.ToLower(subject)
        if subjectLower == lowered || strings.Contains(lowered, subjectLower) || strings.Contains(subjectLower, lowered) {
            return subject
        }
    }
    return "Классный час"
}

func normalizeTime(value string, fallback string) string {
    match := regexp.MustCompile(`(\d{1,2}):(\d{2})`).FindStringSubmatch(value)
    if len(match) != 3 {
        return fallback
    }
    return fmt.Sprintf("%02d:%s", atoi(match[1]), match[2])
}

func extractStart(line string) string {
    match := regexp.MustCompile(`(\d{1,2}:\d{2})`).FindStringSubmatch(line)
    if len(match) == 2 {
        return normalizeTime(match[1], "08:30")
    }
    return "08:30"
}

func extractDuration(line string) int {
    match := regexp.MustCompile(`(?i)(\d{2,3})\s*мин`).FindStringSubmatch(line)
    if len(match) == 2 {
        return atoi(match[1])
    }
    return 45
}

func extractRoom(line string) string {
    match := regexp.MustCompile(`(?i)(?:каб(?:инет)?|аудитория)\s*([0-9A-Za-zА-Яа-я-]+)`).FindStringSubmatch(line)
    if len(match) == 2 {
        return match[1]
    }
    return ""
}

func addMinutes(start string, minutes int) string {
    t, err := time.Parse("15:04", start)
    if err != nil {
        t, _ = time.Parse("15:04", "08:30")
    }
    return t.Add(time.Duration(minutes) * time.Minute).Format("15:04")
}

func compactStrings(values []string) []string {
    out := make([]string, 0, len(values))
    for _, value := range values {
        trimmed := strings.TrimSpace(value)
        if trimmed != "" {
            out = append(out, trimmed)
        }
    }
    return out
}

func extractJSON(value string) string {
    start := strings.Index(value, "{")
    end := strings.LastIndex(value, "}")
    if start >= 0 && end > start {
        return value[start : end+1]
    }
    return value
}

func displayNameFromEmail(email string) string {
    parts := strings.Split(email, "@")
    if len(parts) == 0 || strings.TrimSpace(parts[0]) == "" {
        return "Nexara User"
    }
    return parts[0]
}

func ensureDataURL(value string) string {
    trimmed := strings.TrimSpace(value)
    if strings.HasPrefix(trimmed, "data:image") {
        return trimmed
    }
    return "data:image/png;base64," + cleanBase64(trimmed)
}

func cleanBase64(value string) string {
    trimmed := strings.TrimSpace(value)
    if idx := strings.Index(trimmed, ","); idx >= 0 {
        return trimmed[idx+1:]
    }
    return trimmed
}

func jsonError(c *gin.Context, status int, message string) {
    c.Header("Content-Type", "application/json; charset=utf-8")
    c.JSON(status, gin.H{"ok": false, "message": message})
}

func mustEnv(key string) string {
    value := strings.TrimSpace(os.Getenv(key))
    if value == "" {
        log.Fatalf("missing env %s", key)
    }
    return value
}

func atoi(value string) int {
    total := 0
    for _, ch := range value {
        if ch < '0' || ch > '9' {
            continue
        }
        total = total*10 + int(ch-'0')
    }
    return total
}

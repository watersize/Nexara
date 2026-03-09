#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
mod professional_schema;

use std::path::{Path, PathBuf};
use std::collections::{BTreeSet, HashMap};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use chrono::{Datelike, Local};
use reqwest::Client;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;
use tokio::io::AsyncWriteExt;
use tokio::process::{Child, Command};
use professional_schema::PROFESSIONAL_SCHEMA_SQL;

const DEFAULT_SUPABASE_URL: &str = "https://qotqycihhexoflxzavqj.supabase.co";
const DEFAULT_SUPABASE_KEY: &str = "sb_publishable_kG0Pz1veUgqLwzmOh38coA_9Q995YKF";
const DEFAULT_GROQ_KEY: &str = "";
#[derive(Clone)]
struct AppState {
    db_path: PathBuf,
    app_dir: PathBuf,
    imports_dir: PathBuf,
    materials_dir: PathBuf,
    rag_dir: PathBuf,
    python_path: PathBuf,
    python_script: Option<PathBuf>,
    supabase_url: String,
    supabase_key: String,
    groq_key: String,
    client: Client,
    app: AppHandle,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AuthSession {
    user_id: String,
    email: String,
    display_name: String,
    access_token: String,
    refresh_token: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct AppSettings {
    theme: String,
    hints_enabled: bool,
    enable_3d: bool,
    reminder_hours: i64,
    telegram_enabled: bool,
    telegram_bot_token: String,
    telegram_chat_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ScheduleLesson {
    subject: String,
    teacher: String,
    room: String,
    start_time: String,
    end_time: String,
    notes: String,
    materials: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct MaterialRecord {
    hash: String,
    file_name: String,
    mime_type: String,
    stored_path: String,
    created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct TextbookPreviewPayload {
    hash: String,
}

#[derive(Debug, Serialize)]
struct TextbookPreviewResponse {
    kind: String,
    file_name: String,
    mime_type: String,
    content: String,
}

#[derive(Debug, Serialize)]
struct WeekdayOption {
    value: i64,
    label: String,
}

#[derive(Debug, Serialize)]
struct BootstrapPayload {
    days: Vec<WeekdayOption>,
    subjects: Vec<String>,
    default_weekday: i64,
    default_week_number: i64,
    auth_session: Option<AuthSession>,
    settings: AppSettings,
    textbooks: Vec<MaterialRecord>,
}

#[derive(Debug, Serialize, Deserialize)]
struct OperationResult {
    ok: bool,
    message: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct AuthResponse {
    ok: bool,
    message: String,
    session: Option<AuthSession>,
}

#[derive(Debug, Serialize, Deserialize)]
struct ChatResponse {
    answer: String,
    sources: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PlanResponse {
    plan: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SupabaseAuthResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    user: Option<SupabaseUser>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SupabaseUser {
    id: String,
    email: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
struct PythonScheduleResponse {
    lessons: Vec<ScheduleLesson>,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveSchedulePayload {
    week_number: i64,
    weekday: i64,
    text: String,
    details_text: String,
    file_name: String,
    file_base64: String,
    mime_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct UploadTextbookPayload {
    file_name: String,
    file_base64: String,
    mime_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteScheduleLessonPayload {
    week_number: i64,
    weekday: i64,
    lesson: ScheduleLesson,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveScheduleLessonsPayload {
    week_number: i64,
    weekday: i64,
    lessons: Vec<ScheduleLesson>,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteTextbookPayload {
    hash: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UserNote {
    id: String,
    title: String,
    topic: String,
    content: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveNotePayload {
    note: UserNote,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteNotePayload {
    id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct NoteFolder {
    id: String,
    name: String,
    color: String,
    parent_id: String,
    sort_order: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveNoteFolderPayload {
    folder: NoteFolder,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteNoteFolderPayload {
    id: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SearchNotesPayload {
    query: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct SearchNoteResult {
    id: String,
    title: String,
    kind: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct UserTask {
    id: String,
    title: String,
    topic: String,
    due_date: String,
    start_time: String,
    end_time: String,
    duration_minutes: i64,
    details: String,
    bucket: String,
    done: bool,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SaveTaskPayload {
    task: UserTask,
}

#[derive(Debug, Serialize, Deserialize)]
struct DeleteTaskPayload {
    id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct LinkReferencePayload {
    target: String,
    display_text: String,
    range_start: i64,
    range_end: i64,
    edge_type: String,
}

#[derive(Debug, Serialize, Deserialize)]
struct SyncNodeLinksPayload {
    node_id: String,
    kind: String,
    title: String,
    topic: String,
    content: String,
    source_ref: String,
    links: Vec<LinkReferencePayload>,
}

#[derive(Debug, Serialize, Deserialize)]
struct NodeQueryPayload {
    node_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceNode {
    node_id: String,
    kind: String,
    title: String,
    slug: String,
    topic: String,
    content: String,
    source_ref: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct WorkspaceNeighbor {
    node_id: String,
    kind: String,
    title: String,
    slug: String,
    topic: String,
    edge_type: String,
    direction: String,
    weight: i64,
}

#[derive(Debug, Serialize, Deserialize)]
struct NodeGraphSnapshot {
    node: WorkspaceNode,
    neighbors: Vec<WorkspaceNeighbor>,
}

#[derive(Debug, Clone)]
struct SubjectProfile {
    teacher: String,
    room: String,
}

fn default_settings() -> AppSettings {
    AppSettings {
        theme: "theme-dark".to_string(),
        hints_enabled: true,
        enable_3d: true,
        reminder_hours: 18,
        telegram_enabled: false,
        telegram_bot_token: String::new(),
        telegram_chat_id: String::new(),
    }
}

fn initialize_database(path: &Path) -> Result<(), String> {
    let conn = Connection::open(path).map_err(|err| err.to_string())?;
    conn.execute_batch(
        r#"
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS auth_session (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            user_id TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            display_name TEXT NOT NULL DEFAULT '',
            access_token TEXT NOT NULL DEFAULT '',
            refresh_token TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS local_accounts (
            email TEXT PRIMARY KEY,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS app_settings (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            theme TEXT NOT NULL DEFAULT 'theme-dark',
            hints_enabled INTEGER NOT NULL DEFAULT 1,
            enable_3d INTEGER NOT NULL DEFAULT 1,
            reminder_hours INTEGER NOT NULL DEFAULT 18,
            telegram_enabled INTEGER NOT NULL DEFAULT 0,
            telegram_bot_token TEXT NOT NULL DEFAULT '',
            telegram_chat_id TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS schedule_cache (
            user_key TEXT NOT NULL DEFAULT 'guest',
            week_number INTEGER NOT NULL DEFAULT 1,
            weekday INTEGER NOT NULL,
            lessons_json TEXT NOT NULL DEFAULT '[]',
            updated_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, week_number, weekday)
        );
        CREATE TABLE IF NOT EXISTS subject_profiles (
            user_key TEXT NOT NULL,
            subject TEXT NOT NULL,
            teacher TEXT NOT NULL DEFAULT '',
            room TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, subject)
        );
        CREATE TABLE IF NOT EXISTS material_store (
            hash TEXT PRIMARY KEY,
            file_name TEXT NOT NULL,
            mime_type TEXT NOT NULL,
            stored_path TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT ''
        );
        CREATE TABLE IF NOT EXISTS user_materials (
            user_key TEXT NOT NULL,
            material_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, material_hash),
            FOREIGN KEY(material_hash) REFERENCES material_store(hash) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS note_folders (
            user_key TEXT NOT NULL,
            folder_id TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            color TEXT NOT NULL DEFAULT '#3b82f6',
            parent_id TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, folder_id)
        );
        CREATE TABLE IF NOT EXISTS user_notes (
            user_key TEXT NOT NULL,
            note_id TEXT NOT NULL,
            node_id TEXT NOT NULL DEFAULT '',
            folder_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            topic TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, note_id)
        );
        CREATE TABLE IF NOT EXISTS user_tasks (
            user_key TEXT NOT NULL,
            task_id TEXT NOT NULL,
            node_id TEXT NOT NULL DEFAULT '',
            title TEXT NOT NULL DEFAULT '',
            topic TEXT NOT NULL DEFAULT '',
            due_date TEXT NOT NULL DEFAULT '',
            start_time TEXT NOT NULL DEFAULT '',
            end_time TEXT NOT NULL DEFAULT '',
            duration_minutes INTEGER NOT NULL DEFAULT 0,
            details TEXT NOT NULL DEFAULT '',
            bucket TEXT NOT NULL DEFAULT 'today',
            done INTEGER NOT NULL DEFAULT 0,
            updated_at TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, task_id)
        );
        CREATE TABLE IF NOT EXISTS workspace_nodes (
            user_key TEXT NOT NULL,
            node_id TEXT NOT NULL,
            kind TEXT NOT NULL,
            title TEXT NOT NULL DEFAULT '',
            slug TEXT NOT NULL DEFAULT '',
            topic TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            source_ref TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, node_id)
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_nodes_user_kind
            ON workspace_nodes(user_key, kind, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_workspace_nodes_user_slug
            ON workspace_nodes(user_key, slug);
        CREATE TABLE IF NOT EXISTS workspace_edges (
            user_key TEXT NOT NULL,
            edge_id TEXT NOT NULL,
            from_node_id TEXT NOT NULL,
            to_node_id TEXT,
            target_slug TEXT NOT NULL DEFAULT '',
            edge_type TEXT NOT NULL DEFAULT 'wikilink',
            display_text TEXT NOT NULL DEFAULT '',
            range_start INTEGER NOT NULL DEFAULT 0,
            range_end INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT '',
            updated_at TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (user_key, edge_id),
            FOREIGN KEY (user_key, from_node_id) REFERENCES workspace_nodes(user_key, node_id) ON DELETE CASCADE,
            FOREIGN KEY (user_key, to_node_id) REFERENCES workspace_nodes(user_key, node_id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_workspace_edges_from
            ON workspace_edges(user_key, from_node_id);
        CREATE INDEX IF NOT EXISTS idx_workspace_edges_to
            ON workspace_edges(user_key, to_node_id);
        CREATE INDEX IF NOT EXISTS idx_workspace_edges_target_slug
            ON workspace_edges(user_key, target_slug);
        INSERT OR IGNORE INTO auth_session (id, user_id, email, display_name, access_token, refresh_token, updated_at)
        VALUES (1, '', '', '', '', '', '');
        INSERT OR IGNORE INTO app_settings (id, theme, hints_enabled, enable_3d, reminder_hours, telegram_enabled, telegram_bot_token, telegram_chat_id)
        VALUES (1, 'theme-dark', 1, 1, 18, 0, '', '');
        "#,
    )
    .map_err(|err| err.to_string())?;
    let mut stmt = conn
        .prepare("PRAGMA table_info(schedule_cache)")
        .map_err(|err| err.to_string())?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(|err| err.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|err| err.to_string())?;
    if !columns.iter().any(|column| column == "user_key")
        || !columns.iter().any(|column| column == "week_number")
    {
        conn.execute_batch(
            r#"
            DROP TABLE IF EXISTS schedule_cache_legacy;
            ALTER TABLE schedule_cache RENAME TO schedule_cache_legacy;
            CREATE TABLE schedule_cache (
                user_key TEXT NOT NULL DEFAULT 'guest',
                week_number INTEGER NOT NULL DEFAULT 1,
                weekday INTEGER NOT NULL,
                lessons_json TEXT NOT NULL DEFAULT '[]',
                updated_at TEXT NOT NULL DEFAULT '',
                PRIMARY KEY (user_key, week_number, weekday)
            );
            DROP TABLE schedule_cache_legacy;
            "#,
        )
        .map_err(|err| err.to_string())?;
    }
    let note_columns = conn
        .prepare("PRAGMA table_info(user_notes)")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|err| err.to_string())?;
    if !note_columns.iter().any(|column| column == "node_id") {
        conn.execute("ALTER TABLE user_notes ADD COLUMN node_id TEXT NOT NULL DEFAULT ''", [])
            .map_err(|err| err.to_string())?;
    }
    if !note_columns.iter().any(|column| column == "folder_id") {
        conn.execute("ALTER TABLE user_notes ADD COLUMN folder_id TEXT NOT NULL DEFAULT ''", [])
            .map_err(|err| err.to_string())?;
    }
    conn.execute("UPDATE user_notes SET node_id = note_id WHERE TRIM(COALESCE(node_id, '')) = ''", [])
        .map_err(|err| err.to_string())?;

    let task_columns = conn
        .prepare("PRAGMA table_info(user_tasks)")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|err| err.to_string())?;
    if !task_columns.iter().any(|column| column == "node_id") {
        conn.execute("ALTER TABLE user_tasks ADD COLUMN node_id TEXT NOT NULL DEFAULT ''", [])
            .map_err(|err| err.to_string())?;
    }
    if !task_columns.iter().any(|column| column == "start_time") {
        conn.execute("ALTER TABLE user_tasks ADD COLUMN start_time TEXT NOT NULL DEFAULT ''", [])
            .map_err(|err| err.to_string())?;
    }
    if !task_columns.iter().any(|column| column == "end_time") {
        conn.execute("ALTER TABLE user_tasks ADD COLUMN end_time TEXT NOT NULL DEFAULT ''", [])
            .map_err(|err| err.to_string())?;
    }
    if !task_columns.iter().any(|column| column == "duration_minutes") {
        conn.execute("ALTER TABLE user_tasks ADD COLUMN duration_minutes INTEGER NOT NULL DEFAULT 0", [])
            .map_err(|err| err.to_string())?;
    }
    conn.execute("UPDATE user_tasks SET node_id = task_id WHERE TRIM(COALESCE(node_id, '')) = ''", [])
        .map_err(|err| err.to_string())?;
    conn.execute_batch(PROFESSIONAL_SCHEMA_SQL)
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn weekday_label(weekday: i64) -> String {
    match weekday {
        1 => "Понедельник",
        2 => "Вторник",
        3 => "Среда",
        4 => "Четверг",
        5 => "Пятница",
        6 => "Суббота",
        _ => "Воскресенье",
    }
    .to_string()
}

fn normalize_auth_error(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("weak_password") || lower.contains("at least 6 characters") {
        return "Пароль должен быть не короче 6 символов.".to_string();
    }
    if lower.contains("user already registered") {
        return "Этот email уже зарегистрирован.".to_string();
    }
    if lower.contains("invalid login credentials") {
        return "Неверный email или пароль.".to_string();
    }
    if lower.contains("error sending confirmation email")
        || lower.contains("unexpected_failure")
        || lower.contains("confirmation email")
    {
        return "Аккаунт создан. Вход по email и паролю уже доступен внутри приложения.".to_string();
    }
    raw.to_string()
}

fn local_user_key(session: Option<&AuthSession>) -> String {
    session
        .map(|value| {
            if !value.user_id.trim().is_empty() {
                value.user_id.clone()
            } else {
                value.email.clone()
            }
        })
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "guest".to_string())
}

fn password_hash(email: &str, password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(email.trim().to_lowercase().as_bytes());
    hasher.update(b"::");
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn slugify(value: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;
    for ch in value.trim().to_lowercase().chars() {
        if ch.is_alphanumeric() {
            slug.push(ch);
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }
    slug.trim_matches('-').to_string()
}

fn edge_id_for(user_key: &str, from_node_id: &str, target_slug: &str, range_start: i64, range_end: i64) -> String {
    let mut hasher = Sha256::new();
    hasher.update(user_key.as_bytes());
    hasher.update(b"::");
    hasher.update(from_node_id.as_bytes());
    hasher.update(b"::");
    hasher.update(target_slug.as_bytes());
    hasher.update(b"::");
    hasher.update(range_start.to_string().as_bytes());
    hasher.update(b"::");
    hasher.update(range_end.to_string().as_bytes());
    format!("{:x}", hasher.finalize())
}

fn node_content_preview(content: &str) -> String {
    content.split_whitespace().take(120).collect::<Vec<_>>().join(" ")
}

fn extract_markdown_links(content: &str) -> Vec<LinkReferencePayload> {
    let bytes = content.as_bytes();
    let mut index = 0usize;
    let mut links = Vec::new();
    while index + 3 < bytes.len() {
        if bytes[index] == b'[' && bytes[index + 1] == b'[' {
            let start = index;
            index += 2;
            let label_start = index;
            while index + 1 < bytes.len() && !(bytes[index] == b']' && bytes[index + 1] == b']') {
                index += 1;
            }
            if index + 1 >= bytes.len() {
                break;
            }
            let raw = content[label_start..index].trim();
            index += 2;
            if raw.is_empty() {
                continue;
            }
            let (target, display_text) = raw
                .split_once('|')
                .map(|(left, right)| (left.trim(), right.trim()))
                .unwrap_or((raw, raw));
            let target_slug = slugify(target);
            if target_slug.is_empty() {
                continue;
            }
            links.push(LinkReferencePayload {
                target: target_slug,
                display_text: display_text.to_string(),
                range_start: start as i64,
                range_end: index as i64,
                edge_type: "wikilink".to_string(),
            });
        } else {
            index += 1;
        }
    }
    links
}

fn build_local_session(email: &str) -> AuthSession {
    let digest = password_hash(email, "local-session");
    AuthSession {
        user_id: format!("local-{}", &digest[..16]),
        email: email.to_string(),
        display_name: email.split('@').next().unwrap_or("veyo.ai User").to_string(),
        access_token: format!("local-token-{}", &digest[..24]),
        refresh_token: format!("local-refresh-{}", &digest[24..48]),
    }
}

fn extract_base64_payload(input: &str) -> &str {
    input.split_once(',').map(|(_, value)| value).unwrap_or(input)
}

fn extension_for_mime(file_name: &str, mime: &str) -> &'static str {
    let lower_name = file_name.to_lowercase();
    let lower_mime = mime.to_lowercase();
    if lower_name.ends_with(".pdf") || lower_mime.contains("pdf") {
        "pdf"
    } else if lower_name.ends_with(".png") || lower_mime.contains("png") {
        "png"
    } else if lower_name.ends_with(".jpg")
        || lower_name.ends_with(".jpeg")
        || lower_mime.contains("jpeg")
        || lower_mime.contains("jpg")
    {
        "jpg"
    } else if lower_name.ends_with(".webp") || lower_mime.contains("webp") {
        "webp"
    } else if lower_name.ends_with(".docx") || lower_mime.contains("wordprocessingml") {
        "docx"
    } else if lower_name.ends_with(".txt") || lower_mime.contains("text/plain") {
        "txt"
    } else {
        "bin"
    }
}

fn resolve_agent_runtime(app: &AppHandle, workspace: &Path) -> (PathBuf, Option<PathBuf>) {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("agent.exe"));
        candidates.push(resource_dir.join("resources").join("agent.exe"));
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join("agent.exe"));
            candidates.push(parent.join("resources").join("agent.exe"));
        }
    }
    candidates.push(workspace.join("src-tauri").join("resources").join("agent.exe"));
    candidates.push(workspace.join("python_ai").join("dist").join("agent.exe"));

    for candidate in candidates {
        if candidate.exists() {
            return (candidate, None);
        }
    }

    let venv_python = workspace.join(".venv").join("Scripts").join("python.exe");
    if venv_python.exists() {
        return (venv_python, Some(workspace.join("python_ai").join("agent.py")));
    }

    (
        PathBuf::from("python"),
        Some(workspace.join("python_ai").join("agent.py")),
    )
}

fn project_root() -> Result<PathBuf, String> {
    let current = std::env::current_dir().map_err(|err| err.to_string())?;
    if current.ends_with("src-tauri") {
        current
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| "project root not found".to_string())
    } else {
        Ok(current)
    }
}

fn resolve_groq_key(app: &AppHandle, workspace: &Path) -> String {
    let mut candidates = Vec::new();
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("groq.key"));
        candidates.push(resource_dir.join("resources").join("groq.key"));
    }
    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(parent) = current_exe.parent() {
            candidates.push(parent.join("groq.key"));
            candidates.push(parent.join("resources").join("groq.key"));
        }
    }
    candidates.push(workspace.join(".secrets").join("groq_key.txt"));

    for candidate in candidates {
        if let Ok(value) = std::fs::read_to_string(&candidate) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
    }

    std::env::var("GROQ_API_KEY").unwrap_or_else(|_| DEFAULT_GROQ_KEY.to_string())
}

fn ensure_state(app: &AppHandle) -> Result<AppState, String> {
    let app_dir = app.path().app_data_dir().map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&app_dir).map_err(|err| err.to_string())?;
    let imports_dir = app_dir.join("imports");
    let materials_dir = app_dir.join("materials");
    let rag_dir = app_dir.join("rag");
    std::fs::create_dir_all(&imports_dir).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&materials_dir).map_err(|err| err.to_string())?;
    std::fs::create_dir_all(&rag_dir).map_err(|err| err.to_string())?;
    let db_path = app_dir.join("veyo-ai.sqlite");
    initialize_database(&db_path)?;

    let workspace = project_root()?;
    let (python_path, python_script) = resolve_agent_runtime(app, &workspace);

    let supabase_url = std::env::var("SUPABASE_URL")
        .unwrap_or_else(|_| DEFAULT_SUPABASE_URL.to_string())
        .trim_end_matches('/')
        .to_string();
    let supabase_key =
        std::env::var("SUPABASE_ANON_KEY").unwrap_or_else(|_| DEFAULT_SUPABASE_KEY.to_string());
    let groq_key = resolve_groq_key(app, &workspace);

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|err| err.to_string())?;

    Ok(AppState {
        db_path,
        app_dir,
        imports_dir,
        materials_dir,
        rag_dir,
        python_path,
        python_script,
        supabase_url,
        supabase_key,
        groq_key,
        client,
        app: app.clone(),
    })
}

async fn db_run<T, F>(db_path: PathBuf, job: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce(Connection) -> Result<T, String> + Send + 'static,
{
    tokio::task::spawn_blocking(move || {
        let conn = Connection::open(db_path).map_err(|err| err.to_string())?;
        job(conn)
    })
    .await
    .map_err(|err| err.to_string())?
}

async fn load_auth_session(state: &AppState) -> Result<Option<AuthSession>, String> {
    db_run(state.db_path.clone(), |conn| {
        let session = conn
            .query_row(
                "SELECT user_id, email, display_name, access_token, refresh_token FROM auth_session WHERE id = 1",
                [],
                |row| {
                    Ok(AuthSession {
                        user_id: row.get(0)?,
                        email: row.get(1)?,
                        display_name: row.get(2)?,
                        access_token: row.get(3)?,
                        refresh_token: row.get(4)?,
                    })
                },
            )
            .map_err(|err| err.to_string())?;
        if session.access_token.trim().is_empty() {
            Ok(None)
        } else {
            Ok(Some(session))
        }
    })
    .await
}

async fn save_auth_session(state: &AppState, session: Option<AuthSession>) -> Result<(), String> {
    let payload = session.unwrap_or(AuthSession {
        user_id: String::new(),
        email: String::new(),
        display_name: String::new(),
        access_token: String::new(),
        refresh_token: String::new(),
    });
    db_run(state.db_path.clone(), move |conn| {
        conn.execute(
            "UPDATE auth_session SET user_id = ?1, email = ?2, display_name = ?3, access_token = ?4, refresh_token = ?5, updated_at = ?6 WHERE id = 1",
            params![
                payload.user_id,
                payload.email,
                payload.display_name,
                payload.access_token,
                payload.refresh_token,
                Local::now().to_rfc3339(),
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

async fn load_settings(state: &AppState) -> Result<AppSettings, String> {
    db_run(state.db_path.clone(), |conn| {
        conn.query_row(
            "SELECT theme, hints_enabled, enable_3d, reminder_hours, telegram_enabled, telegram_bot_token, telegram_chat_id FROM app_settings WHERE id = 1",
            [],
            |row| {
                Ok(AppSettings {
                    theme: row.get(0)?,
                    hints_enabled: row.get::<_, i64>(1)? == 1,
                    enable_3d: row.get::<_, i64>(2)? == 1,
                    reminder_hours: row.get(3)?,
                    telegram_enabled: row.get::<_, i64>(4)? == 1,
                    telegram_bot_token: row.get(5)?,
                    telegram_chat_id: row.get(6)?,
                })
            },
        )
        .map_err(|err| err.to_string())
    })
    .await
}

async fn save_settings_impl(state: &AppState, settings: AppSettings) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        conn.execute(
            "UPDATE app_settings SET theme = ?1, hints_enabled = ?2, enable_3d = ?3, reminder_hours = ?4, telegram_enabled = ?5, telegram_bot_token = ?6, telegram_chat_id = ?7 WHERE id = 1",
            params![
                settings.theme,
                if settings.hints_enabled { 1 } else { 0 },
                if settings.enable_3d { 1 } else { 0 },
                settings.reminder_hours,
                if settings.telegram_enabled { 1 } else { 0 },
                settings.telegram_bot_token,
                settings.telegram_chat_id,
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

async fn save_local_account(state: &AppState, email: &str, password: &str) -> Result<(), String> {
    let email = email.trim().to_lowercase();
    let hash = password_hash(&email, password);
    db_run(state.db_path.clone(), move |conn| {
        conn.execute(
            "INSERT INTO local_accounts (email, password_hash, created_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, created_at = excluded.created_at",
            params![email, hash, Local::now().to_rfc3339()],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

async fn verify_local_account(state: &AppState, email: &str, password: &str) -> Result<bool, String> {
    let email = email.trim().to_lowercase();
    let hash = password_hash(&email, password);
    db_run(state.db_path.clone(), move |conn| {
        let stored: Result<String, _> = conn.query_row(
            "SELECT password_hash FROM local_accounts WHERE email = ?1",
            [email],
            |row| row.get(0),
        );
        Ok(matches!(stored, Ok(value) if value == hash))
    })
    .await
}

async fn delete_local_account(state: &AppState, email: String) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        conn.execute("DELETE FROM local_accounts WHERE email = ?1", [email])
            .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

async fn clear_user_data(state: &AppState, user_key: String) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        conn.execute("DELETE FROM schedule_cache WHERE user_key = ?1", [user_key.clone()])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM subject_profiles WHERE user_key = ?1", [user_key.clone()])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM workspace_edges WHERE user_key = ?1", [user_key.clone()])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM workspace_nodes WHERE user_key = ?1", [user_key.clone()])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM user_notes WHERE user_key = ?1", [user_key.clone()])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM user_tasks WHERE user_key = ?1", [user_key.clone()])
            .map_err(|err| err.to_string())?;
        conn.execute("DELETE FROM user_materials WHERE user_key = ?1", [user_key])
            .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

async fn delete_supabase_user_profile(state: &AppState, session: &AuthSession) -> Result<(), String> {
    if session.user_id.trim().is_empty() || session.access_token.trim().is_empty() {
        return Ok(());
    }
    let url = format!(
        "{}/rest/v1/users?id=eq.{}",
        state.supabase_url,
        session.user_id
    );
    let response = state
        .client
        .delete(url)
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Accept", "application/json; charset=utf-8")
        .header("apikey", &state.supabase_key)
        .header("Authorization", format!("Bearer {}", session.access_token))
        .header("Prefer", "return=minimal")
        .send()
        .await
        .map_err(|err| err.to_string())?;
    if response.status().is_success() || response.status().as_u16() == 404 {
        return Ok(());
    }
    let body = response.text().await.map_err(|err| err.to_string())?;
    Err(format!("Не удалось удалить профиль пользователя: {body}"))
}

async fn save_schedule_cache(
    state: &AppState,
    user_key: String,
    week_number: i64,
    weekday: i64,
    lessons: Vec<ScheduleLesson>,
) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        let json = serde_json::to_string(&lessons).map_err(|err| err.to_string())?;
        let now = Local::now().to_rfc3339();
        conn.execute(
            "INSERT INTO schedule_cache (user_key, week_number, weekday, lessons_json, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_key, week_number, weekday) DO UPDATE SET lessons_json = excluded.lessons_json, updated_at = excluded.updated_at",
            params![user_key.clone(), week_number, weekday, json, now.clone()],
        )
        .map_err(|err| err.to_string())?;

        let source_ref = format!("schedule:{week_number}:{weekday}");
        conn.execute(
            "DELETE FROM workspace_nodes WHERE user_key = ?1 AND kind = 'schedule' AND source_ref = ?2",
            params![user_key.clone(), source_ref.clone()],
        )
        .map_err(|err| err.to_string())?;

        for (index, lesson) in lessons.iter().enumerate() {
            let node_id = format!(
                "schedule:{week_number}:{weekday}:{}:{}:{}",
                index,
                lesson.start_time.trim(),
                slugify(&lesson.subject)
            );
            let mut content = String::new();
            if !lesson.teacher.trim().is_empty() {
                content.push_str(&format!("Teacher: {}\n", lesson.teacher.trim()));
            }
            if !lesson.room.trim().is_empty() {
                content.push_str(&format!("Room: {}\n", lesson.room.trim()));
            }
            if !lesson.notes.trim().is_empty() {
                content.push_str(lesson.notes.trim());
            }
            upsert_workspace_node_record(
                &conn,
                &user_key,
                &node_id,
                "schedule",
                &lesson.subject,
                "",
                &content,
                &source_ref,
                &now,
                &now,
            )?;
            replace_workspace_edges(&conn, &user_key, &node_id, &extract_markdown_links(&lesson.notes))?;
        }
        Ok(())
    })
    .await
}

async fn load_subject_profiles(
    state: &AppState,
    user_key: String,
) -> Result<HashMap<String, SubjectProfile>, String> {
    db_run(state.db_path.clone(), move |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT subject, teacher, room
                 FROM subject_profiles
                 WHERE user_key = ?1",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([user_key], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    SubjectProfile {
                        teacher: row.get(1)?,
                        room: row.get(2)?,
                    },
                ))
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<HashMap<_, _>, _>>()
            .map_err(|err| err.to_string())
    })
    .await
}

async fn upsert_subject_profile(
    state: &AppState,
    user_key: String,
    subject: String,
    teacher: String,
    room: String,
) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        let existing = conn
            .query_row(
                "SELECT teacher, room FROM subject_profiles WHERE user_key = ?1 AND subject = ?2",
                params![user_key, subject],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .ok();
        let merged_teacher = if teacher.trim().is_empty() {
            existing.as_ref().map(|value| value.0.clone()).unwrap_or_default()
        } else {
            teacher
        };
        let merged_room = if room.trim().is_empty() {
            existing.as_ref().map(|value| value.1.clone()).unwrap_or_default()
        } else {
            room
        };
        conn.execute(
            "INSERT INTO subject_profiles (user_key, subject, teacher, room, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(user_key, subject) DO UPDATE SET
                teacher = excluded.teacher,
                room = excluded.room,
                updated_at = excluded.updated_at",
            params![user_key, subject, merged_teacher, merged_room, Local::now().to_rfc3339()],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

fn apply_subject_profiles(
    mut lessons: Vec<ScheduleLesson>,
    profiles: &HashMap<String, SubjectProfile>,
) -> Vec<ScheduleLesson> {
    for lesson in &mut lessons {
        if let Some(profile) = profiles.get(&lesson.subject) {
            if lesson.teacher.trim().is_empty() && !profile.teacher.trim().is_empty() {
                lesson.teacher = profile.teacher.clone();
            }
            if lesson.room.trim().is_empty() && !profile.room.trim().is_empty() {
                lesson.room = profile.room.clone();
            }
        }
    }
    lessons
}

async fn remember_subject_profiles(
    state: &AppState,
    user_key: String,
    lessons: &[ScheduleLesson],
) -> Result<(), String> {
    for lesson in lessons {
        if lesson.subject.trim().is_empty() {
            continue;
        }
        if lesson.teacher.trim().is_empty() && lesson.room.trim().is_empty() {
            continue;
        }
        upsert_subject_profile(
            state,
            user_key.clone(),
            lesson.subject.clone(),
            lesson.teacher.clone(),
            lesson.room.clone(),
        )
        .await?;
    }
    Ok(())
}

async fn list_known_subjects(state: &AppState, user_key: String) -> Result<Vec<String>, String> {
    db_run(state.db_path.clone(), move |conn| {
        let mut subjects = BTreeSet::new();
        let mut profile_stmt = conn
            .prepare("SELECT subject FROM subject_profiles WHERE user_key = ?1")
            .map_err(|err| err.to_string())?;
        let profile_rows = profile_stmt
            .query_map([user_key.clone()], |row| row.get::<_, String>(0))
            .map_err(|err| err.to_string())?;
        for row in profile_rows {
            let subject = row.map_err(|err| err.to_string())?;
            let trimmed = subject.trim();
            if !trimmed.is_empty() {
                subjects.insert(trimmed.to_string());
            }
        }

        let mut cache_stmt = conn
            .prepare("SELECT lessons_json FROM schedule_cache WHERE user_key = ?1")
            .map_err(|err| err.to_string())?;
        let cache_rows = cache_stmt
            .query_map([user_key], |row| row.get::<_, String>(0))
            .map_err(|err| err.to_string())?;
        for row in cache_rows {
            let json = row.map_err(|err| err.to_string())?;
            let lessons: Vec<ScheduleLesson> = serde_json::from_str(&json).unwrap_or_default();
            for lesson in lessons {
                let trimmed = lesson.subject.trim();
                if !trimmed.is_empty() {
                    subjects.insert(trimmed.to_string());
                }
            }
        }

        Ok(subjects.into_iter().collect())
    })
    .await
}

fn parse_subject_overrides(details_text: &str, known_subjects: &[String]) -> Vec<ScheduleLesson> {
    let mut overrides = Vec::new();
    for raw_line in details_text.lines() {
        let line = raw_line.trim();
        if line.is_empty() {
            continue;
        }
        let lowered_line = line.to_lowercase();
        let subject = known_subjects
            .iter()
            .filter(|subject| lowered_line.contains(&subject.to_lowercase()))
            .max_by_key(|subject| subject.len())
            .cloned();
        let Some(subject) = subject else {
            continue;
        };
        let mut remainder = line.replacen(&subject, "", 1);
        remainder = remainder
            .trim()
            .trim_start_matches(['-', '—', ':', ' '])
            .trim()
            .to_string();
        let room = regex_room(&remainder).unwrap_or_default();
        let teacher = strip_room_markers(&remainder, &room);
        overrides.push(ScheduleLesson {
            subject,
            teacher,
            room,
            start_time: String::new(),
            end_time: String::new(),
            notes: String::new(),
            materials: Vec::new(),
        });
    }
    overrides
}

fn strip_room_markers(text: &str, room: &str) -> String {
    let mut cleaned = text.to_string();
    if !room.trim().is_empty() {
        for marker in ["каб.", "каб", "кабинет", "аудитория"] {
            cleaned = cleaned.replace(&format!("{marker} {room}"), "");
            cleaned = cleaned.replace(&format!("{marker}: {room}"), "");
            cleaned = cleaned.replace(&format!("{marker}-{room}"), "");
        }
    }
    cleaned
        .replace(',', " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn regex_room(text: &str) -> Option<String> {
    let lowered = text.to_lowercase();
    for marker in ["каб.", "каб", "кабинет", "аудитория"] {
        if let Some(index) = lowered.find(marker) {
            let tail = text[index + marker.len()..].trim();
            let room: String = tail
                .chars()
                .skip_while(|char| char.is_whitespace() || *char == ':' || *char == '-')
                .take_while(|char| char.is_alphanumeric() || *char == '-' || *char == '/')
                .collect();
            if !room.is_empty() {
                return Some(room);
            }
        }
    }
    None
}

fn apply_subject_overrides(
    mut lessons: Vec<ScheduleLesson>,
    overrides: &[ScheduleLesson],
) -> Vec<ScheduleLesson> {
    for lesson in &mut lessons {
        if let Some(override_lesson) = overrides.iter().find(|item| item.subject == lesson.subject) {
            if !override_lesson.teacher.trim().is_empty() {
                lesson.teacher = override_lesson.teacher.clone();
            }
            if !override_lesson.room.trim().is_empty() {
                lesson.room = override_lesson.room.clone();
            }
        }
    }
    lessons
}

fn parse_time_overrides(details_text: &str) -> Vec<(usize, String, String)> {
    let mut overrides = Vec::new();
    for segment in details_text.split(['\n', ',', ';']) {
        let trimmed = segment.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut chars = trimmed.chars().peekable();
        let mut digits = String::new();
        while let Some(ch) = chars.peek() {
            if ch.is_ascii_digit() {
                digits.push(*ch);
                chars.next();
            } else {
                break;
            }
        }
        if digits.is_empty() {
            continue;
        }
        let lesson_number = match digits.parse::<usize>() {
            Ok(value) if value > 0 => value,
            _ => continue,
        };
        let remainder: String = chars.collect();
        let times = extract_times(&remainder);
        if times.len() >= 2 {
            overrides.push((lesson_number - 1, times[0].clone(), times[1].clone()));
        }
    }
    overrides
}

fn extract_times(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut times = Vec::new();
    let mut index = 0usize;
    while index + 3 < chars.len() {
        if chars[index].is_ascii_digit() {
            if index + 4 < chars.len()
                && chars[index + 1].is_ascii_digit()
                && chars[index + 2] == ':'
                && chars[index + 3].is_ascii_digit()
                && chars[index + 4].is_ascii_digit()
            {
                times.push(chars[index..=index + 4].iter().collect());
                index += 5;
                continue;
            }
            if chars[index + 1] == ':'
                && chars[index + 2].is_ascii_digit()
                && chars[index + 3].is_ascii_digit()
            {
                times.push(chars[index..=index + 3].iter().collect());
                index += 4;
                continue;
            }
        }
        index += 1;
    }
    times
}

fn apply_time_overrides(
    mut lessons: Vec<ScheduleLesson>,
    overrides: &[(usize, String, String)],
) -> Vec<ScheduleLesson> {
    for (index, start, end) in overrides {
        if let Some(lesson) = lessons.get_mut(*index) {
            lesson.start_time = start.clone();
            lesson.end_time = end.clone();
        }
    }
    lessons
}

async fn load_schedule_cache(
    state: &AppState,
    user_key: String,
    week_number: i64,
    weekday: i64,
) -> Result<Vec<ScheduleLesson>, String> {
    db_run(state.db_path.clone(), move |conn| {
        let json: String = conn
            .query_row(
                "SELECT lessons_json FROM schedule_cache WHERE user_key = ?1 AND week_number = ?2 AND weekday = ?3",
                params![user_key, week_number, weekday],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| "[]".to_string());
        serde_json::from_str::<Vec<ScheduleLesson>>(&json).map_err(|err| err.to_string())
    })
    .await
}

async fn delete_schedule_lesson_impl(
    state: &AppState,
    user_key: String,
    week_number: i64,
    weekday: i64,
    lesson: ScheduleLesson,
) -> Result<bool, String> {
    let mut lessons = load_schedule_cache(state, user_key.clone(), week_number, weekday).await?;
    let original_len = lessons.len();
    let mut removed = false;
    lessons.retain(|item| {
        let is_match = !removed
            && item.subject == lesson.subject
            && item.teacher == lesson.teacher
            && item.room == lesson.room
            && item.start_time == lesson.start_time
            && item.end_time == lesson.end_time
            && item.notes == lesson.notes;
        if is_match {
            removed = true;
            false
        } else {
            true
        }
    });
    if !removed && original_len == lessons.len() {
        return Ok(false);
    }
    save_schedule_cache(state, user_key, week_number, weekday, lessons).await?;
    Ok(true)
}

async fn list_materials(state: &AppState, user_key: String) -> Result<Vec<MaterialRecord>, String> {
    db_run(state.db_path.clone(), move |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT ms.hash, ms.file_name, ms.mime_type, ms.stored_path, ms.created_at
                 FROM user_materials um
                 JOIN material_store ms ON ms.hash = um.material_hash
                 WHERE um.user_key = ?1
                 ORDER BY ms.created_at DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([user_key], |row| {
                Ok(MaterialRecord {
                    hash: row.get(0)?,
                    file_name: row.get(1)?,
                    mime_type: row.get(2)?,
                    stored_path: row.get(3)?,
                    created_at: row.get(4)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
    })
    .await
}

async fn upsert_material_link(
    state: &AppState,
    user_key: String,
    record: MaterialRecord,
) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        conn.execute(
            "INSERT OR IGNORE INTO material_store (hash, file_name, mime_type, stored_path, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![record.hash, record.file_name, record.mime_type, record.stored_path, record.created_at],
        )
        .map_err(|err| err.to_string())?;
        conn.execute(
            "INSERT OR IGNORE INTO user_materials (user_key, material_hash, created_at) VALUES (?1, ?2, ?3)",
            params![user_key, record.hash, Local::now().to_rfc3339()],
        )
        .map_err(|err| err.to_string())?;
        Ok(())
    })
    .await
}

async fn list_notes_impl(state: &AppState, user_key: String) -> Result<Vec<UserNote>, String> {
    db_run(state.db_path.clone(), move |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT note_id, title, topic, content, updated_at
                 FROM user_notes
                 WHERE user_key = ?1
                 ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([user_key], |row| {
                Ok(UserNote {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    topic: row.get(2)?,
                    content: row.get(3)?,
                    updated_at: row.get(4)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
    })
    .await
}

fn upsert_workspace_node_record(
    conn: &Connection,
    user_key: &str,
    node_id: &str,
    kind: &str,
    title: &str,
    topic: &str,
    content: &str,
    source_ref: &str,
    created_at: &str,
    updated_at: &str,
) -> Result<(), String> {
    let title = title.trim();
    let slug = slugify(if title.is_empty() { node_id } else { title });
    conn.execute(
        "INSERT INTO workspace_nodes (
            user_key, node_id, kind, title, slug, topic, content, source_ref, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        ON CONFLICT(user_key, node_id) DO UPDATE SET
            kind = excluded.kind,
            title = excluded.title,
            slug = excluded.slug,
            topic = excluded.topic,
            content = excluded.content,
            source_ref = excluded.source_ref,
            updated_at = excluded.updated_at",
        params![
            user_key,
            node_id,
            kind,
            title,
            slug,
            topic.trim(),
            node_content_preview(content),
            source_ref,
            created_at,
            updated_at,
        ],
    )
    .map_err(|err| err.to_string())?;
    Ok(())
}

fn resolve_target_node_id(
    conn: &Connection,
    user_key: &str,
    target_slug: &str,
    display_text: &str,
) -> Result<Option<String>, String> {
    let by_slug = conn
        .query_row(
            "SELECT node_id
             FROM workspace_nodes
             WHERE user_key = ?1 AND slug = ?2
             ORDER BY datetime(updated_at) DESC
             LIMIT 1",
            params![user_key, target_slug],
            |row| row.get::<_, String>(0),
        )
        .ok();
    if by_slug.is_some() {
        return Ok(by_slug);
    }
    if display_text.trim().is_empty() {
        return Ok(None);
    }
    Ok(conn
        .query_row(
            "SELECT node_id
             FROM workspace_nodes
             WHERE user_key = ?1 AND lower(title) = lower(?2)
             ORDER BY datetime(updated_at) DESC
             LIMIT 1",
            params![user_key, display_text.trim()],
            |row| row.get::<_, String>(0),
        )
        .ok())
}

fn replace_workspace_edges(
    conn: &Connection,
    user_key: &str,
    node_id: &str,
    links: &[LinkReferencePayload],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM workspace_edges WHERE user_key = ?1 AND from_node_id = ?2",
        params![user_key, node_id],
    )
    .map_err(|err| err.to_string())?;

    let now = Local::now().to_rfc3339();
    for link in links {
        let target_slug = slugify(&link.target);
        if target_slug.is_empty() {
            continue;
        }
        let edge_id = edge_id_for(user_key, node_id, &target_slug, link.range_start, link.range_end);
        let to_node_id = resolve_target_node_id(conn, user_key, &target_slug, &link.display_text)?;
        conn.execute(
            "INSERT INTO workspace_edges (
                user_key, edge_id, from_node_id, to_node_id, target_slug, edge_type, display_text, range_start, range_end, created_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            params![
                user_key,
                edge_id,
                node_id,
                to_node_id,
                target_slug,
                if link.edge_type.trim().is_empty() { "wikilink" } else { link.edge_type.trim() },
                link.display_text.trim(),
                link.range_start,
                link.range_end,
                now,
                now,
            ],
        )
        .map_err(|err| err.to_string())?;
    }
    Ok(())
}

async fn sync_node_links_impl(
    state: &AppState,
    user_key: String,
    payload: SyncNodeLinksPayload,
) -> Result<OperationResult, String> {
    db_run(state.db_path.clone(), move |conn| {
        let now = Local::now().to_rfc3339();
        let existing_created_at = conn
            .query_row(
                "SELECT created_at FROM workspace_nodes WHERE user_key = ?1 AND node_id = ?2",
                params![user_key.clone(), payload.node_id.clone()],
                |row| row.get::<_, String>(0),
            )
            .unwrap_or_else(|_| now.clone());
        upsert_workspace_node_record(
            &conn,
            &user_key,
            &payload.node_id,
            &payload.kind,
            &payload.title,
            &payload.topic,
            &payload.content,
            &payload.source_ref,
            &existing_created_at,
            &now,
        )?;
        replace_workspace_edges(&conn, &user_key, &payload.node_id, &payload.links)?;
        Ok(OperationResult {
            ok: true,
            message: "Node links synchronized".to_string(),
        })
    })
    .await
}

async fn get_node_with_neighbors_impl(
    state: &AppState,
    user_key: String,
    node_id: String,
) -> Result<NodeGraphSnapshot, String> {
    db_run(state.db_path.clone(), move |conn| {
        let node = conn
            .query_row(
                "SELECT node_id, kind, title, slug, topic, content, source_ref, created_at, updated_at
                 FROM workspace_nodes
                 WHERE user_key = ?1 AND node_id = ?2",
                params![user_key.clone(), node_id.clone()],
                |row| {
                    Ok(WorkspaceNode {
                        node_id: row.get(0)?,
                        kind: row.get(1)?,
                        title: row.get(2)?,
                        slug: row.get(3)?,
                        topic: row.get(4)?,
                        content: row.get(5)?,
                        source_ref: row.get(6)?,
                        created_at: row.get(7)?,
                        updated_at: row.get(8)?,
                    })
                },
            )
            .map_err(|err| err.to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT neighbor.node_id, neighbor.kind, neighbor.title, neighbor.slug, neighbor.topic,
                        edge.edge_type, edge.direction, COUNT(*) AS weight
                 FROM (
                    SELECT to_node_id AS neighbor_id, edge_type, 'outgoing' AS direction
                    FROM workspace_edges
                    WHERE user_key = ?1 AND from_node_id = ?2 AND to_node_id IS NOT NULL
                    UNION ALL
                    SELECT from_node_id AS neighbor_id, edge_type, 'incoming' AS direction
                    FROM workspace_edges
                    WHERE user_key = ?1 AND to_node_id = ?2
                 ) edge
                 JOIN workspace_nodes neighbor
                   ON neighbor.user_key = ?1 AND neighbor.node_id = edge.neighbor_id
                 GROUP BY neighbor.node_id, neighbor.kind, neighbor.title, neighbor.slug, neighbor.topic, edge.edge_type, edge.direction
                 ORDER BY weight DESC, neighbor.updated_at DESC, neighbor.title ASC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![user_key, node_id], |row| {
                Ok(WorkspaceNeighbor {
                    node_id: row.get(0)?,
                    kind: row.get(1)?,
                    title: row.get(2)?,
                    slug: row.get(3)?,
                    topic: row.get(4)?,
                    edge_type: row.get(5)?,
                    direction: row.get(6)?,
                    weight: row.get(7)?,
                })
            })
            .map_err(|err| err.to_string())?;

        Ok(NodeGraphSnapshot {
            node,
            neighbors: rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())?,
        })
    })
    .await
}

async fn save_note_impl(state: &AppState, user_key: String, note: UserNote) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        let node_id = note.id.clone();
        let updated_at = if note.updated_at.trim().is_empty() {
            Local::now().to_rfc3339()
        } else {
            note.updated_at.clone()
        };
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM user_notes WHERE user_key = ?1 AND note_id = ?2",
                params![user_key.clone(), note.id.clone()],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| Local::now().to_rfc3339());
        conn.execute(
            "INSERT INTO user_notes (user_key, note_id, node_id, title, topic, content, updated_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(user_key, note_id) DO UPDATE SET
                node_id = excluded.node_id,
                title = excluded.title,
                topic = excluded.topic,
                content = excluded.content,
                updated_at = excluded.updated_at",
            params![
                &user_key,
                &note.id,
                &node_id,
                &note.title,
                &note.topic,
                &note.content,
                &updated_at,
                &created_at,
            ],
        )
        .map_err(|err| err.to_string())?;
        upsert_workspace_node_record(
            &conn,
            &user_key,
            &node_id,
            "note",
            &note.title,
            &note.topic,
            &note.content,
            &format!("note:{}", node_id),
            &created_at,
            &updated_at,
        )?;
        let links = extract_markdown_links(&note.content);
        replace_workspace_edges(&conn, &user_key, &node_id, &links)?;
        Ok(())
    })
    .await
}

async fn delete_note_impl(state: &AppState, user_key: String, note_id: String) -> Result<bool, String> {
    db_run(state.db_path.clone(), move |conn| {
        let changed = conn
            .execute(
                "DELETE FROM user_notes WHERE user_key = ?1 AND note_id = ?2",
                params![user_key.clone(), note_id.clone()],
            )
            .map_err(|err| err.to_string())?;
        conn.execute(
            "DELETE FROM workspace_nodes WHERE user_key = ?1 AND node_id = ?2",
            params![user_key, note_id],
        )
        .map_err(|err| err.to_string())?;
        Ok(changed > 0)
    })
    .await
}

async fn list_tasks_impl(state: &AppState, user_key: String) -> Result<Vec<UserTask>, String> {
    db_run(state.db_path.clone(), move |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT task_id, title, topic, due_date, start_time, end_time, duration_minutes, details, bucket, done, updated_at
                 FROM user_tasks
                 WHERE user_key = ?1
                 ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([user_key], |row| {
                Ok(UserTask {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    topic: row.get(2)?,
                    due_date: row.get(3)?,
                    start_time: row.get(4)?,
                    end_time: row.get(5)?,
                    duration_minutes: row.get(6)?,
                    details: row.get(7)?,
                    bucket: row.get(8)?,
                    done: row.get::<_, i64>(9)? == 1,
                    updated_at: row.get(10)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
    })
    .await
}

async fn save_task_impl(state: &AppState, user_key: String, task: UserTask) -> Result<(), String> {
    db_run(state.db_path.clone(), move |conn| {
        let node_id = task.id.clone();
        let updated_at = if task.updated_at.trim().is_empty() {
            Local::now().to_rfc3339()
        } else {
            task.updated_at.clone()
        };
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM user_tasks WHERE user_key = ?1 AND task_id = ?2",
                params![user_key.clone(), task.id.clone()],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| Local::now().to_rfc3339());
        conn.execute(
            "INSERT INTO user_tasks (user_key, task_id, node_id, title, topic, due_date, start_time, end_time, duration_minutes, details, bucket, done, updated_at, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
             ON CONFLICT(user_key, task_id) DO UPDATE SET
                node_id = excluded.node_id,
                title = excluded.title,
                topic = excluded.topic,
                due_date = excluded.due_date,
                start_time = excluded.start_time,
                end_time = excluded.end_time,
                duration_minutes = excluded.duration_minutes,
                details = excluded.details,
                bucket = excluded.bucket,
                done = excluded.done,
                updated_at = excluded.updated_at",
            params![
                &user_key,
                &task.id,
                &node_id,
                &task.title,
                &task.topic,
                &task.due_date,
                &task.start_time,
                &task.end_time,
                task.duration_minutes,
                &task.details,
                &task.bucket,
                if task.done { 1 } else { 0 },
                &updated_at,
                &created_at,
            ],
        )
        .map_err(|err| err.to_string())?;
        let combined_content = format!("{}\n{}", task.details, task.due_date);
        upsert_workspace_node_record(
            &conn,
            &user_key,
            &node_id,
            "task",
            &task.title,
            &task.topic,
            &combined_content,
            &format!("task:{}", node_id),
            &created_at,
            &updated_at,
        )?;
        let links = extract_markdown_links(&task.details);
        replace_workspace_edges(&conn, &user_key, &node_id, &links)?;
        Ok(())
    })
    .await
}

async fn delete_task_impl(state: &AppState, user_key: String, task_id: String) -> Result<bool, String> {
    db_run(state.db_path.clone(), move |conn| {
        let changed = conn
            .execute(
                "DELETE FROM user_tasks WHERE user_key = ?1 AND task_id = ?2",
                params![user_key.clone(), task_id.clone()],
            )
            .map_err(|err| err.to_string())?;
        conn.execute(
            "DELETE FROM workspace_nodes WHERE user_key = ?1 AND node_id = ?2",
            params![user_key, task_id],
        )
        .map_err(|err| err.to_string())?;
        Ok(changed > 0)
    })
    .await
}

async fn delete_material_link(
    state: &AppState,
    user_key: String,
    hash: String,
) -> Result<Option<String>, String> {
    db_run(state.db_path.clone(), move |conn| {
        conn.execute(
            "DELETE FROM user_materials WHERE user_key = ?1 AND material_hash = ?2",
            params![user_key, hash.clone()],
        )
        .map_err(|err| err.to_string())?;

        let remaining: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM user_materials WHERE material_hash = ?1",
                [hash.clone()],
                |row| row.get(0),
            )
            .map_err(|err| err.to_string())?;

        if remaining > 0 {
            return Ok(None);
        }

        let stored_path: Result<String, _> = conn.query_row(
            "SELECT stored_path FROM material_store WHERE hash = ?1",
            [hash.clone()],
            |row| row.get(0),
        );
        let stored_path = stored_path.ok();

        conn.execute("DELETE FROM material_store WHERE hash = ?1", [hash])
            .map_err(|err| err.to_string())?;

        Ok(stored_path)
    })
    .await
}

async fn post_supabase<T: Serialize, R: for<'de> Deserialize<'de>>(
    state: &AppState,
    path: &str,
    payload: &T,
) -> Result<R, String> {
    let url = format!("{}/{}", state.supabase_url, path.trim_start_matches('/'));
    let response = state
        .client
        .post(url)
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Accept", "application/json; charset=utf-8")
        .header("apikey", &state.supabase_key)
        .header("Authorization", format!("Bearer {}", state.supabase_key))
        .json(payload)
        .send()
        .await
        .map_err(|err| err.to_string())?;
    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    if !status.is_success() {
        return Err(body);
    }
    serde_json::from_str::<R>(&body).map_err(|err| err.to_string())
}

fn map_supabase_session(response: SupabaseAuthResponse) -> Result<AuthResponse, String> {
    let user = response
        .user
        .ok_or_else(|| "Supabase не вернул пользователя".to_string())?;
    let email = user.email.unwrap_or_default();
    let access_token = response
        .access_token
        .ok_or_else(|| "Supabase не вернул access token".to_string())?;
    let refresh_token = response.refresh_token.unwrap_or_default();

    Ok(AuthResponse {
        ok: true,
        message: "Вход выполнен".to_string(),
        session: Some(AuthSession {
            user_id: user.id,
            email: email.clone(),
            display_name: email.split('@').next().unwrap_or("veyo.ai User").to_string(),
            access_token,
            refresh_token,
        }),
    })
}

async fn run_python_agent(state: &AppState, action: &str, payload: Value) -> Result<Value, String> {
    let mut command = Command::new(&state.python_path);
    if let Some(script) = &state.python_script {
        command.arg(script);
    }
    command
        .env("PYTHONUTF8", "1")
        .env("GROQ_API_KEY", &state.groq_key)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());
    #[cfg(target_os = "windows")]
    command.creation_flags(0x08000000);

    let mut child = command
        .spawn()
        .map_err(|err| format!("Ошибка запуска Python: {err}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let envelope = json!({ "action": action, "payload": payload }).to_string();
        stdin
            .write_all(envelope.as_bytes())
            .await
            .map_err(|err| err.to_string())?;
    }

    let output = child.wait_with_output().await.map_err(|err| err.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !output.status.success() {
        let raw_error = if stderr.trim().is_empty() { stdout } else { stderr };
        return Err(clean_python_error(&raw_error));
    }
    serde_json::from_str::<Value>(&stdout).map_err(|err| format!("Ошибка чтения ответа Python: {err}"))
}

fn clean_python_error(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "Не удалось обработать ответ Python.".to_string();
    }
    let filtered = trimmed
        .lines()
        .filter(|line| {
            let lowered = line.to_lowercase();
            !lowered.contains("requestsdependencywarning")
                && !lowered.contains("traceback (most recent call last)")
                && !lowered.contains("[pyi-")
                && !lowered.contains("failed to execute script")
        })
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    if let Some(last) = filtered.last() {
        if let Some(value) = last.split(':').nth(1) {
            let value = value.trim();
            if !value.is_empty() {
                return value.to_string();
            }
        }
        return (*last).to_string();
    }
    "Не удалось обработать изображение расписания.".to_string()
}

async fn rebuild_rag_index(state: &AppState, user_key: String) -> Result<(), String> {
    let materials = list_materials(state, user_key.clone()).await?;
    let pdfs: Vec<String> = materials
        .iter()
        .filter(|item| item.mime_type.to_lowercase().contains("pdf") || item.file_name.to_lowercase().ends_with(".pdf"))
        .map(|item| item.stored_path.clone())
        .collect();
    let storage_dir = state.rag_dir.join(user_key);
    tokio::fs::create_dir_all(&storage_dir)
        .await
        .map_err(|err| err.to_string())?;
    let _ = run_python_agent(
        state,
        "index_pdfs",
        json!({
            "file_paths": pdfs,
            "storage_dir": storage_dir.to_string_lossy(),
        }),
    )
    .await?;
    Ok(())
}

async fn write_import_file(
    dir: &Path,
    file_name: &str,
    mime_type: &str,
    file_base64: &str,
) -> Result<PathBuf, String> {
    let bytes = BASE64
        .decode(extract_base64_payload(file_base64).as_bytes())
        .map_err(|err| format!("Не удалось прочитать файл: {err}"))?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = format!("{:x}", hasher.finalize());
    let extension = extension_for_mime(file_name, mime_type);
    let path = dir.join(format!("{hash}.{extension}"));
    if !path.exists() {
        tokio::fs::write(&path, bytes)
            .await
            .map_err(|err| err.to_string())?;
    }
    Ok(path)
}

fn spawn_telegram_bot_if_needed(_settings: &AppSettings, _state: &AppState) -> Option<Child> {
    None
}

#[tauri::command]
async fn bootstrap_app(state: State<'_, AppState>) -> Result<BootstrapPayload, String> {
    let auth_session = load_auth_session(&state).await?;
    let user_key = local_user_key(auth_session.as_ref());
    let settings = load_settings(&state).await.unwrap_or_else(|_| default_settings());
    let textbooks = list_materials(&state, user_key.clone()).await?;
    let subjects = list_known_subjects(&state, user_key).await?;
    let _ = spawn_telegram_bot_if_needed(&settings, &state);
    Ok(BootstrapPayload {
        days: (1..=7)
            .map(|value| WeekdayOption {
                value,
                label: weekday_label(value),
            })
            .collect(),
        subjects,
        default_weekday: Local::now().weekday().number_from_monday() as i64,
        default_week_number: Local::now().iso_week().week() as i64,
        auth_session,
        settings,
        textbooks,
    })
}

#[tauri::command]
async fn register_user(
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<AuthResponse, String> {
    let email = email.trim().to_lowercase();
    if email.is_empty() {
        return Err("Укажи email.".to_string());
    }
    if password.trim().len() < 6 {
        return Err("Пароль должен быть не короче 6 символов.".to_string());
    }
    let payload = json!({ "email": email, "password": password });
    let fallback_message = "Аккаунт создан. Вход по email и паролю уже доступен.".to_string();

    match post_supabase::<_, SupabaseAuthResponse>(&state, "/auth/v1/signup", &payload).await {
        Ok(response) => {
            if response.access_token.is_some() {
                let mapped = map_supabase_session(response)?;
                save_auth_session(&state, mapped.session.clone()).await?;
                Ok(mapped)
            } else {
                save_local_account(&state, &email, &password).await?;
                let session = build_local_session(&email);
                save_auth_session(&state, Some(session.clone())).await?;
                Ok(AuthResponse {
                    ok: true,
                    message: fallback_message.clone(),
                    session: Some(session),
                })
            }
        }
        Err(error) => {
            let friendly = normalize_auth_error(&error);
            if friendly.contains("локальный аккаунт") || friendly.contains("Вход по email") {
                save_local_account(&state, &email, &password).await?;
                let session = build_local_session(&email);
                save_auth_session(&state, Some(session.clone())).await?;
                Ok(AuthResponse {
                    ok: true,
                    message: friendly,
                    session: Some(session),
                })
            } else {
                Err(friendly)
            }
        }
    }
}

#[tauri::command]
async fn login_user(
    email: String,
    password: String,
    state: State<'_, AppState>,
) -> Result<AuthResponse, String> {
    let email = email.trim().to_lowercase();
    if verify_local_account(&state, &email, &password).await? {
        let session = build_local_session(&email);
        save_auth_session(&state, Some(session.clone())).await?;
        return Ok(AuthResponse {
            ok: true,
            message: "Вход выполнен".to_string(),
            session: Some(session),
        });
    }

    let payload = json!({ "email": email, "password": password });
    let response: SupabaseAuthResponse =
        post_supabase(&state, "/auth/v1/token?grant_type=password", &payload)
            .await
            .map_err(|err| normalize_auth_error(&err))?;
    let mapped = map_supabase_session(response)?;
    save_auth_session(&state, mapped.session.clone()).await?;
    Ok(mapped)
}

#[tauri::command]
async fn recover_password(email: String, state: State<'_, AppState>) -> Result<OperationResult, String> {
    let email = email.trim().to_lowercase();
    let payload = json!({ "email": email });
    match post_supabase::<_, Value>(&state, "/auth/v1/recover", &payload).await {
        Ok(_) => Ok(OperationResult {
            ok: true,
            message: "Письмо для восстановления отправлено.".to_string(),
        }),
        Err(error) => Ok(OperationResult {
            ok: false,
            message: normalize_auth_error(&error),
        }),
    }
}

#[tauri::command]
async fn logout_user(state: State<'_, AppState>) -> Result<OperationResult, String> {
    save_auth_session(&state, None).await?;
    Ok(OperationResult {
        ok: true,
        message: "Выход выполнен".to_string(),
    })
}

#[tauri::command]
async fn save_settings(settings: AppSettings, state: State<'_, AppState>) -> Result<OperationResult, String> {
    save_settings_impl(&state, settings).await?;
    Ok(OperationResult {
        ok: true,
        message: "Настройки сохранены".to_string(),
    })
}

#[tauri::command]
async fn update_profile(display_name: String, state: State<'_, AppState>) -> Result<OperationResult, String> {
    let mut session = load_auth_session(&state)
        .await?
        .ok_or_else(|| "Сначала войди в аккаунт.".to_string())?;
    let normalized = display_name.trim();
    if normalized.is_empty() {
        return Err("Никнейм не может быть пустым.".to_string());
    }
    session.display_name = normalized.to_string();
    save_auth_session(&state, Some(session)).await?;
    Ok(OperationResult {
        ok: true,
        message: "Профиль обновлён".to_string(),
    })
}

#[tauri::command]
async fn delete_account(state: State<'_, AppState>) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let Some(session) = session else {
        return Err("Сначала войди в аккаунт.".to_string());
    };
    let user_key = local_user_key(Some(&session));
    let _ = delete_supabase_user_profile(&state, &session).await;
    clear_user_data(&state, user_key).await?;
    if !session.email.trim().is_empty() {
        let _ = delete_local_account(&state, session.email.clone()).await;
    }
    save_auth_session(&state, None).await?;
    Ok(OperationResult {
        ok: true,
        message: "Аккаунт удалён на этом устройстве.".to_string(),
    })
}

#[tauri::command]
async fn save_schedule(payload: SaveSchedulePayload, state: State<'_, AppState>) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let file_paths = if !payload.file_base64.trim().is_empty() {
        let path = write_import_file(
            &state.imports_dir,
            &payload.file_name,
            &payload.mime_type,
            &payload.file_base64,
        )
        .await?;
        vec![path.to_string_lossy().to_string()]
    } else {
        Vec::new()
    };
    let has_schedule_input = !file_paths.is_empty() || !payload.text.trim().is_empty();
    let profiles = load_subject_profiles(&state, user_key.clone()).await?;
    let known_subjects = list_known_subjects(&state, user_key.clone()).await?;
    let overrides = parse_subject_overrides(&payload.details_text, &known_subjects);
    let time_overrides = parse_time_overrides(&payload.details_text);
    if !has_schedule_input && overrides.is_empty() && time_overrides.is_empty() {
        return Err("Добавь расписание, файл или уточнения по предметам.".to_string());
    }

    let mut lessons = if !file_paths.is_empty() {
        let value = run_python_agent(
            &state,
            "parse_schedule_from_files",
            json!({
                "weekday": payload.weekday,
                "file_paths": file_paths,
                "subjects": Vec::<String>::new(),
            }),
        )
        .await
        .map_err(|err| format!("Ошибка анализа расписания: {err}"))?;
        let parsed: PythonScheduleResponse =
            serde_json::from_value(value).map_err(|err| err.to_string())?;
        parsed.lessons
    } else if !payload.text.trim().is_empty() {
        let value = run_python_agent(
            &state,
            "parse_schedule",
            json!({
                "weekday": payload.weekday,
                "text": payload.text,
                "subjects": Vec::<String>::new(),
            }),
        )
        .await
        .map_err(|err| format!("Ошибка анализа расписания: {err}"))?;
        let parsed: PythonScheduleResponse =
            serde_json::from_value(value).map_err(|err| err.to_string())?;
        parsed.lessons
    } else {
        load_schedule_cache(&state, user_key.clone(), payload.week_number, payload.weekday).await?
    };

    lessons = apply_subject_profiles(lessons, &profiles);
    lessons = apply_subject_overrides(lessons, &overrides);
    lessons = apply_time_overrides(lessons, &time_overrides);
    save_schedule_cache(
        &state,
        user_key.clone(),
        payload.week_number,
        payload.weekday,
        lessons.clone(),
    )
    .await?;
    remember_subject_profiles(&state, user_key.clone(), &lessons).await?;
    remember_subject_profiles(&state, user_key, &overrides).await?;
    notify_status("veyo.ai".to_string(), "Расписание обновлено".to_string(), state.clone()).await?;
    Ok(OperationResult {
        ok: true,
        message: if has_schedule_input {
            "Расписание обновлено".to_string()
        } else {
            "Уточнения по предметам сохранены".to_string()
        },
    })
}

#[tauri::command]
async fn delete_schedule_lesson(
    payload: DeleteScheduleLessonPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let removed = delete_schedule_lesson_impl(
        &state,
        user_key,
        payload.week_number,
        payload.weekday,
        payload.lesson,
    )
    .await?;
    Ok(OperationResult {
        ok: removed,
        message: if removed {
            "Урок удалён.".to_string()
        } else {
            "Урок не найден.".to_string()
        },
    })
}

#[tauri::command]
async fn upload_textbook(
    payload: UploadTextbookPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let bytes = BASE64
        .decode(extract_base64_payload(&payload.file_base64).as_bytes())
        .map_err(|err| format!("Не удалось прочитать файл: {err}"))?;
    if bytes.is_empty() {
        return Err("Файл пустой.".to_string());
    }
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    let hash = format!("{:x}", hasher.finalize());
    let extension = extension_for_mime(&payload.file_name, &payload.mime_type);
    let stored_path = state.materials_dir.join(format!("{hash}.{extension}"));
    if !stored_path.exists() {
        tokio::fs::write(&stored_path, &bytes)
            .await
            .map_err(|err| err.to_string())?;
    }

    upsert_material_link(
        &state,
        user_key.clone(),
        MaterialRecord {
            hash: hash.clone(),
            file_name: payload.file_name,
            mime_type: payload.mime_type,
            stored_path: stored_path.to_string_lossy().to_string(),
            created_at: Local::now().to_rfc3339(),
        },
    )
    .await?;
    rebuild_rag_index(&state, user_key).await?;
    Ok(OperationResult {
        ok: true,
        message: "Учебник добавлен в базу. Одинаковые файлы хранятся один раз.".to_string(),
    })
}

#[tauri::command]
async fn save_schedule_lessons(
    payload: SaveScheduleLessonsPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    save_schedule_cache(
        &state,
        user_key,
        payload.week_number,
        payload.weekday,
        payload.lessons,
    )
    .await?;
    notify_status("veyo.ai".to_string(), "Расписание сохранено".to_string(), state.clone()).await?;
    Ok(OperationResult {
        ok: true,
        message: "Расписание успешно сохранено".to_string(),
    })
}

#[tauri::command]
async fn delete_textbook(
    payload: DeleteTextbookPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    if let Some(path) = delete_material_link(&state, user_key.clone(), payload.hash).await? {
        let _ = tokio::fs::remove_file(path).await;
    }
    rebuild_rag_index(&state, user_key).await?;
    Ok(OperationResult {
        ok: true,
        message: "Учебник удалён.".to_string(),
    })
}

#[tauri::command]
async fn list_textbooks_command(state: State<'_, AppState>) -> Result<Vec<MaterialRecord>, String> {
    let session = load_auth_session(&state).await?;
    list_materials(&state, local_user_key(session.as_ref())).await
}

#[tauri::command]
async fn get_textbook_preview(
    payload: TextbookPreviewPayload,
    state: State<'_, AppState>,
) -> Result<TextbookPreviewResponse, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let materials = list_materials(&state, user_key).await?;
    let material = materials
        .into_iter()
        .find(|item| item.hash == payload.hash)
        .ok_or_else(|| "Учебник не найден".to_string())?;

    let bytes = tokio::fs::read(&material.stored_path)
        .await
        .map_err(|err| err.to_string())?;
    let lower_name = material.file_name.to_lowercase();
    let lower_mime = material.mime_type.to_lowercase();

    if lower_mime.contains("pdf") || lower_name.ends_with(".pdf") {
        return Ok(TextbookPreviewResponse {
            kind: "pdf".into(),
            file_name: material.file_name,
            mime_type: material.mime_type,
            content: BASE64.encode(bytes),
        });
    }

    if lower_mime.contains("text") || lower_name.ends_with(".txt") {
        return Ok(TextbookPreviewResponse {
            kind: "text".into(),
            file_name: material.file_name,
            mime_type: material.mime_type,
            content: String::from_utf8_lossy(&bytes).to_string(),
        });
    }

    Ok(TextbookPreviewResponse {
        kind: "unsupported".into(),
        file_name: material.file_name,
        mime_type: material.mime_type,
        content: "Предпросмотр доступен только для PDF и TXT файлов.".into(),
    })
}

#[tauri::command]
async fn get_schedule_for_weekday(
    week_number: i64,
    weekday: i64,
    state: State<'_, AppState>,
) -> Result<Vec<ScheduleLesson>, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    load_schedule_cache(&state, user_key, week_number, weekday).await
}

#[tauri::command]
async fn ask_ai(question: String, context: Option<String>, state: State<'_, AppState>) -> Result<ChatResponse, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let storage_dir = state.rag_dir.join(user_key);
    let value = run_python_agent(
        &state,
        "ask_ai",
        json!({
            "question": question,
            "storage_dir": storage_dir.to_string_lossy(),
            "context": context.unwrap_or_default(),
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|err| err.to_string())
}

#[tauri::command]
async fn generate_study_plan(
    week_number: i64,
    weekday: i64,
    state: State<'_, AppState>,
) -> Result<PlanResponse, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let lessons = load_schedule_cache(&state, user_key, week_number, weekday).await?;
    let value = run_python_agent(
        &state,
        "generate_plan",
        json!({
            "weekday": weekday,
            "day_label": weekday_label(weekday),
            "lessons": lessons,
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|err| err.to_string())
}

#[tauri::command]
async fn notify_status(
    title: String,
    body: String,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    state
        .app
        .notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|err| err.to_string())?;
    Ok(OperationResult {
        ok: true,
        message: "ok".to_string(),
    })
}


#[tauri::command]
async fn list_notes(state: State<'_, AppState>) -> Result<Vec<UserNote>, String> {
    let session = load_auth_session(&state).await?;
    list_notes_impl(&state, local_user_key(session.as_ref())).await
}

#[tauri::command]
async fn save_note(
    payload: SaveNotePayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    save_note_impl(&state, user_key, payload.note).await?;
    Ok(OperationResult {
        ok: true,
        message: "Заметка сохранена".to_string(),
    })
}

#[tauri::command]
async fn delete_note(
    payload: DeleteNotePayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let removed = delete_note_impl(&state, user_key, payload.id).await?;
    Ok(OperationResult {
        ok: removed,
        message: if removed {
            "Заметка удалена".to_string()
        } else {
            "Заметка не найдена".to_string()
        },
    })
}

#[tauri::command]
async fn list_tasks(state: State<'_, AppState>) -> Result<Vec<UserTask>, String> {
    let session = load_auth_session(&state).await?;
    list_tasks_impl(&state, local_user_key(session.as_ref())).await
}

#[tauri::command]
async fn save_task(
    payload: SaveTaskPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    save_task_impl(&state, user_key, payload.task).await?;
    Ok(OperationResult {
        ok: true,
        message: "Задача сохранена".to_string(),
    })
}

#[tauri::command]
async fn delete_task(
    payload: DeleteTaskPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let removed = delete_task_impl(&state, user_key, payload.id).await?;
    Ok(OperationResult {
        ok: removed,
        message: if removed {
            "Задача удалена".to_string()
        } else {
            "Задача не найдена".to_string()
        },
    })
}

#[tauri::command]
async fn sync_node_links(
    payload: SyncNodeLinksPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    sync_node_links_impl(&state, user_key, payload).await
}

#[tauri::command]
async fn get_node_with_neighbors(
    payload: NodeQueryPayload,
    state: State<'_, AppState>,
) -> Result<NodeGraphSnapshot, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    get_node_with_neighbors_impl(&state, user_key, payload.node_id).await
}

#[derive(Serialize)]
pub struct GlobalGraphNode {
    pub node_id: String,
    pub kind: String,
    pub title: String,
    pub slug: String,
    pub topic: String,
    pub content: String,
    pub source_ref: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Serialize)]
pub struct GlobalGraphEdge {
    pub from_node_id: String,
    pub to_node_id: String,
    pub edge_type: String,
}

#[derive(Serialize)]
pub struct GlobalGraphSnapshot {
    pub nodes: Vec<GlobalGraphNode>,
    pub edges: Vec<GlobalGraphEdge>,
}

async fn get_all_graph_impl(
    state: &AppState,
    user_key: String,
) -> Result<GlobalGraphSnapshot, String> {
    db_run(state.db_path.clone(), move |conn| {
        let mut nodes_stmt = conn
            .prepare(
                "SELECT node_id, kind, title, slug, topic, content, source_ref, created_at, updated_at
                 FROM workspace_nodes
                 WHERE user_key = ?1",
            )
            .map_err(|err| err.to_string())?;
        
        let nodes: Vec<GlobalGraphNode> = nodes_stmt
            .query_map([user_key.clone()], |row| {
                Ok(GlobalGraphNode {
                    node_id: row.get(0)?,
                    kind: row.get(1)?,
                    title: row.get(2)?,
                    slug: row.get(3)?,
                    topic: row.get(4)?,
                    content: row.get(5)?,
                    source_ref: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                })
            })
            .map_err(|err| err.to_string())?
            .filter_map(Result::ok)
            .collect();

        let mut edges_stmt = conn
            .prepare(
                "SELECT from_node_id, to_node_id, edge_type
                 FROM workspace_edges
                 WHERE user_key = ?1 AND to_node_id IS NOT NULL",
            )
            .map_err(|err| err.to_string())?;
        
        let edges: Vec<GlobalGraphEdge> = edges_stmt
            .query_map([user_key], |row| {
                Ok(GlobalGraphEdge {
                    from_node_id: row.get(0)?,
                    to_node_id: row.get(1)?,
                    edge_type: row.get(2)?,
                })
            })
            .map_err(|err| err.to_string())?
            .filter_map(Result::ok)
            .collect();

        Ok(GlobalGraphSnapshot { nodes, edges })
    }).await
}

#[tauri::command]
async fn get_all_graph(
    state: State<'_, AppState>,
) -> Result<GlobalGraphSnapshot, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    get_all_graph_impl(&state, user_key).await
}

#[tauri::command]
async fn list_note_folders(state: State<'_, AppState>) -> Result<Vec<NoteFolder>, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    db_run(state.db_path.clone(), move |conn| {
        let mut stmt = conn
            .prepare(
                "SELECT folder_id, name, color, parent_id, sort_order
                 FROM note_folders
                 WHERE user_key = ?1
                 ORDER BY sort_order ASC, name ASC",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map([user_key], |row| {
                Ok(NoteFolder {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    color: row.get(2)?,
                    parent_id: row.get(3)?,
                    sort_order: row.get(4)?,
                })
            })
            .map_err(|err| err.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|err| err.to_string())
    })
    .await
}

#[tauri::command]
async fn save_note_folder(
    payload: SaveNoteFolderPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let folder = payload.folder;
    db_run(state.db_path.clone(), move |conn| {
        let now = Local::now().to_rfc3339();
        let created_at: String = conn
            .query_row(
                "SELECT created_at FROM note_folders WHERE user_key = ?1 AND folder_id = ?2",
                params![user_key.clone(), folder.id.clone()],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| now.clone());
        conn.execute(
            "INSERT INTO note_folders (user_key, folder_id, name, color, parent_id, sort_order, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(user_key, folder_id) DO UPDATE SET
                name = excluded.name,
                color = excluded.color,
                parent_id = excluded.parent_id,
                sort_order = excluded.sort_order,
                updated_at = excluded.updated_at",
            params![
                &user_key,
                &folder.id,
                &folder.name,
                &folder.color,
                &folder.parent_id,
                folder.sort_order,
                &created_at,
                &now,
            ],
        )
        .map_err(|err| err.to_string())?;
        Ok(OperationResult {
            ok: true,
            message: "Папка сохранена".to_string(),
        })
    })
    .await
}

#[tauri::command]
async fn delete_note_folder(
    payload: DeleteNoteFolderPayload,
    state: State<'_, AppState>,
) -> Result<OperationResult, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let folder_id = payload.id;
    db_run(state.db_path.clone(), move |conn| {
        // Move notes out of folder
        conn.execute(
            "UPDATE user_notes SET folder_id = '' WHERE user_key = ?1 AND folder_id = ?2",
            params![user_key.clone(), folder_id.clone()],
        )
        .map_err(|err| err.to_string())?;
        conn.execute(
            "DELETE FROM note_folders WHERE user_key = ?1 AND folder_id = ?2",
            params![user_key, folder_id],
        )
        .map_err(|err| err.to_string())?;
        Ok(OperationResult {
            ok: true,
            message: "Папка удалена".to_string(),
        })
    })
    .await
}

#[tauri::command]
async fn search_notes(
    payload: SearchNotesPayload,
    state: State<'_, AppState>,
) -> Result<Vec<SearchNoteResult>, String> {
    let session = load_auth_session(&state).await?;
    let user_key = local_user_key(session.as_ref());
    let query = payload.query.trim().to_lowercase();
    db_run(state.db_path.clone(), move |conn| {
        let pattern = format!("%{}%", query);
        let mut results = Vec::new();
        // Search notes
        let mut stmt = conn
            .prepare(
                "SELECT note_id, title FROM user_notes
                 WHERE user_key = ?1 AND lower(title) LIKE ?2
                 ORDER BY datetime(updated_at) DESC
                 LIMIT 10",
            )
            .map_err(|err| err.to_string())?;
        let rows = stmt
            .query_map(params![user_key.clone(), pattern.clone()], |row| {
                Ok(SearchNoteResult {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    kind: "note".to_string(),
                })
            })
            .map_err(|err| err.to_string())?;
        for row in rows {
            results.push(row.map_err(|err| err.to_string())?);
        }
        // Search folders
        let mut stmt2 = conn
            .prepare(
                "SELECT folder_id, name FROM note_folders
                 WHERE user_key = ?1 AND lower(name) LIKE ?2
                 ORDER BY name ASC
                 LIMIT 5",
            )
            .map_err(|err| err.to_string())?;
        let rows2 = stmt2
            .query_map(params![user_key.clone(), pattern.clone()], |row| {
                Ok(SearchNoteResult {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    kind: "folder".to_string(),
                })
            })
            .map_err(|err| err.to_string())?;
        for row in rows2 {
            results.push(row.map_err(|err| err.to_string())?);
        }
        // Search textbooks
        let mut stmt3 = conn
            .prepare(
                "SELECT hash, file_name FROM material_store
                 WHERE lower(file_name) LIKE ?1
                 LIMIT 5",
            )
            .map_err(|err| err.to_string())?;
        let rows3 = stmt3
            .query_map(params![pattern], |row| {
                Ok(SearchNoteResult {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    kind: "textbook".to_string(),
                })
            })
            .map_err(|err| err.to_string())?;
        for row in rows3 {
            results.push(row.map_err(|err| err.to_string())?);
        }
        Ok(results)
    })
    .await
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let state = ensure_state(app.handle())?;
            let _keep = state.app_dir.clone();
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bootstrap_app,
            register_user,
            login_user,
            recover_password,
            logout_user,
            save_settings,
            update_profile,
            delete_account,
            save_schedule,
            save_schedule_lessons,
            delete_schedule_lesson,
            list_notes,
            save_note,
            delete_note,
            list_tasks,
            save_task,
            delete_task,
            sync_node_links,
            get_node_with_neighbors,
            get_all_graph,
            list_note_folders,
            save_note_folder,
            delete_note_folder,
            search_notes,
            upload_textbook,
            delete_textbook,
            list_textbooks_command,
            get_textbook_preview,
            get_schedule_for_weekday,
            ask_ai,
            generate_study_plan,
            notify_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_subject_override_line() {
        let overrides = parse_subject_overrides(
            "Английский язык — Гаршева Анна Геннадьевна, каб. 312",
            &["Английский язык".to_string()],
        );
        assert_eq!(overrides.len(), 1);
        assert_eq!(overrides[0].subject, "Английский язык");
        assert_eq!(overrides[0].teacher, "Гаршева Анна Геннадьевна");
        assert_eq!(overrides[0].room, "312");
    }

    #[test]
    fn applies_saved_subject_profile_to_missing_teacher() {
        let lessons = vec![ScheduleLesson {
            subject: "Английский язык".to_string(),
            teacher: String::new(),
            room: String::new(),
            start_time: "09:25".to_string(),
            end_time: "10:10".to_string(),
            notes: String::new(),
            materials: Vec::new(),
        }];
        let profiles = HashMap::from([(
            "Английский язык".to_string(),
            SubjectProfile {
                teacher: "Гаршева Анна Геннадьевна".to_string(),
                room: "312".to_string(),
            },
        )]);

        let applied = apply_subject_profiles(lessons, &profiles);
        assert_eq!(applied[0].teacher, "Гаршева Анна Геннадьевна");
        assert_eq!(applied[0].room, "312");
    }

    #[test]
    fn parses_lesson_number_time_overrides() {
        let overrides = parse_time_overrides("2 предмет 9:25-10:10, 3 - 10:25-11:10");
        assert_eq!(overrides.len(), 2);
        assert_eq!(overrides[0], (1, "9:25".to_string(), "10:10".to_string()));
        assert_eq!(overrides[1], (2, "10:25".to_string(), "11:10".to_string()));
    }
}

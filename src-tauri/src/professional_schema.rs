use serde::{Deserialize, Serialize};

pub const PROFESSIONAL_SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS professional_users (
    user_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL DEFAULT '',
    role_name TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS workspace_sessions (
    user_key TEXT NOT NULL,
    session_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    project_topic TEXT NOT NULL DEFAULT '',
    assignee TEXT NOT NULL DEFAULT '',
    scheduled_for TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'planned',
    notes_json TEXT NOT NULL DEFAULT '{}',
    updated_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_key, session_id)
);

CREATE TABLE IF NOT EXISTS documentation_topics (
    user_key TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    body_markdown TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_key, topic_id)
);

CREATE TABLE IF NOT EXISTS hybrid_objects (
    user_key TEXT NOT NULL,
    object_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    object_kind TEXT NOT NULL,
    payload_json TEXT NOT NULL DEFAULT '{}',
    z_index INTEGER NOT NULL DEFAULT 0,
    locked INTEGER NOT NULL DEFAULT 0,
    visible INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_key, object_id)
);

CREATE TABLE IF NOT EXISTS knowledge_links (
    user_key TEXT NOT NULL,
    link_id TEXT NOT NULL,
    source_node_id TEXT NOT NULL,
    target_node_id TEXT NOT NULL,
    link_kind TEXT NOT NULL DEFAULT 'reference',
    display_text TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_key, link_id)
);

CREATE TABLE IF NOT EXISTS vector_export_jobs (
    user_key TEXT NOT NULL,
    export_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    theme_mode TEXT NOT NULL DEFAULT 'dark',
    format TEXT NOT NULL DEFAULT 'pdf',
    status TEXT NOT NULL DEFAULT 'queued',
    output_path TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_key, export_id)
);
"#;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProfessionalUser {
    pub user_key: String,
    pub display_name: String,
    pub role_name: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorkspaceSession {
    pub session_id: String,
    pub title: String,
    pub project_topic: String,
    pub assignee: String,
    pub scheduled_for: String,
    pub status: String,
    pub notes_json: String,
    pub updated_at: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DocumentationTopic {
    pub topic_id: String,
    pub title: String,
    pub summary: String,
    pub body_markdown: String,
    pub updated_at: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct HybridObjectRecord {
    pub object_id: String,
    pub note_id: String,
    pub object_kind: String,
    pub payload_json: String,
    pub z_index: i64,
    pub locked: bool,
    pub visible: bool,
    pub updated_at: String,
}

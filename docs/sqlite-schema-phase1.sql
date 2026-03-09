PRAGMA foreign_keys = ON;

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

CREATE TABLE IF NOT EXISTS user_tasks (
    user_key TEXT NOT NULL,
    task_id TEXT NOT NULL,
    node_id TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL DEFAULT '',
    topic TEXT NOT NULL DEFAULT '',
    due_date TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '',
    bucket TEXT NOT NULL DEFAULT 'today',
    done INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (user_key, task_id),
    FOREIGN KEY (user_key, node_id) REFERENCES workspace_nodes(user_key, node_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_tasks_node
    ON user_tasks(user_key, node_id);

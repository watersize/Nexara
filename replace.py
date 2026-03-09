import os

file_path = "c:/Users/1thproj/Documents/ai/src-tauri/src/lib.rs"
with open(file_path, "r", encoding="utf-8") as f:
    text = f.read()

# Replace run_python_agent
text = text.replace("""async fn run_python_agent(state: &AppState, action: &str, payload: Value) -> Result<Value, String> {
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
        return Err(if stderr.trim().is_empty() { stdout } else { stderr });
    }
    serde_json::from_str::<Value>(&stdout).map_err(|err| format!("Ошибка чтения ответа Python: {err}"))
}""", """async fn post_ai_backend<T: Serialize, R: for<'de> Deserialize<'de>>(
    state: &AppState,
    path: &str,
    payload: &T,
) -> Result<R, String> {
    let url = format!("{}{}", state.ai_backend_url, path);
    let response = state
        .client
        .post(&url)
        .header("Content-Type", "application/json; charset=utf-8")
        .header("Accept", "application/json; charset=utf-8")
        .json(payload)
        .send()
        .await
        .map_err(|err| err.to_string())?;

    let status = response.status();
    let body = response.text().await.map_err(|err| err.to_string())?;
    
    if !status.is_success() {
        return Err(format!("AI Backend Error ({}): {}", status, body));
    }

    serde_json::from_str::<R>(&body).map_err(|err| format!("Ошибка чтения ответа: {err}"))
}""")

# Remove rebuild_rag_index
text = text.replace("""async fn rebuild_rag_index(state: &AppState, user_key: String) -> Result<(), String> {
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
}""", "")

# Replace save_schedule logic
text = text.replace("""    let mut lessons = if !file_paths.is_empty() {
        let value = run_python_agent(
            &state,
            "parse_schedule_from_files",
            json!({
                "weekday": payload.weekday,
                "file_paths": file_paths,
                "subjects": SUBJECTS,
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
                "subjects": SUBJECTS,
            }),
        )
        .await
        .map_err(|err| format!("Ошибка анализа расписания: {err}"))?;
        let parsed: PythonScheduleResponse =
            serde_json::from_value(value).map_err(|err| err.to_string())?;
        parsed.lessons
    } else {
        load_schedule_cache(&state, user_key.clone(), payload.week_number, payload.weekday).await?
    };""", """    let mut lessons = if !payload.file_base64.trim().is_empty() {
        let value: PythonScheduleResponse = post_ai_backend(
            &state,
            "/api/ocr/parse_schedule",
            &json!({
                "image_base64": extract_base64_payload(&payload.file_base64),
            }),
        )
        .await
        .map_err(|err| format!("Ошибка анализа расписания: {err}"))?;
        value.lessons
    } else {
        load_schedule_cache(&state, user_key.clone(), payload.week_number, payload.weekday).await?
    };""")


# Replace ask_ai logic
text = text.replace("""    let storage_dir = state.rag_dir.join(user_key);
    let value = run_python_agent(
        &state,
        "ask_ai",
        json!({
            "question": question,
            "storage_dir": storage_dir.to_string_lossy(),
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|err| err.to_string())""", """    let rag_resp: Value = post_ai_backend(
        &state,
        "/api/rag/query",
        &json!({
            "user_id": user_key,
            "query": &question,
        }),
    )
    .await
    .unwrap_or_else(|_| json!({}));
    
    let context = rag_resp.get("raw_context").and_then(|v| v.as_str()).unwrap_or_default();
    let sources: Vec<String> = rag_resp.get("sources").and_then(|v| v.as_array()).map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect()).unwrap_or_default();

    let chat_resp: Value = post_ai_backend(
        &state,
        "/api/chat/ask",
        &json!({
            "question": question,
            "context": context,
        }),
    )
    .await?;
    
    let answer = chat_resp.get("answer").and_then(|v| v.as_str()).unwrap_or_default().to_string();
    Ok(ChatResponse { answer, sources })""")


# Replace generate_plan logic
text = text.replace("""    let value = run_python_agent(
        &state,
        "generate_plan",
        json!({
            "weekday": weekday,
            "day_label": weekday_label(weekday),
            "lessons": lessons,
        }),
    )
    .await?;
    serde_json::from_value(value).map_err(|err| err.to_string())""", """    let value: PlanResponse = post_ai_backend(
        &state,
        "/api/chat/plan",
        &json!({
            "weekday": weekday,
            "day_label": weekday_label(weekday),
            "lessons": lessons,
        }),
    )
    .await?;
    Ok(value)""")

with open(file_path, "w", encoding="utf-8") as f:
    f.write(text)

print("Done")

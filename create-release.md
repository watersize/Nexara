# Создание GitHub Release

## Автоматически созданный standalone .exe

Путь к исполняемому файлу:
```
target/release/schoolmate-proto.exe
```

Размер: ~6.2 MB

## Как создать GitHub Release

### Вариант 1: Через GitHub Web Interface

1. Перейдите на https://github.com/watersize/Nexara/releases
2. Нажмите "Create a new release"
3. Заполните:
   - **Tag version**: `v0.2.0`
   - **Release title**: `Nexara v0.2.0 - Standalone Executable`
   - **Description**:
   ```
   ## Nexara v0.2.0 - Standalone Executable
   
   🚀 **Полностью автономная версия** - не требует установки Python или запуска отдельных серверов!
   
### ✨ Возможности:
- 🤖 AI-помощник для обучения
- 📅 Управление расписанием
- 📄 Обработка документов
- 🔐 Локальная аутентификация
- 🎯 Интегрированный Python AI
   
### 📦 Что включено:
- Все зависимости встроены в .exe
- Встроенный Python для AI-функций
- Локальная база данных SQLite
- Веб-интерфейс на встроенном сервере
   
### 🚀 Установка:
1. Скачайте `schoolmate-proto.exe`
2. Запустите файл
3. Готово! Никакой дополнительной настройки не требуется.
   
### 💻 Системные требования:
- Windows 10/11 (x64)
- ~50 MB свободного места
- Интернет-соединение для AI-функций (опционально)
   
---
**Разработано с ❤️ использованием Tauri, Rust, и Python**
   ```
4. Нажмите "Choose files" и загрузите `target/release/schoolmate-proto.exe`
5. Нажмите "Publish release"

### Вариант 2: Через GitHub CLI (если установлен)

```powershell
gh auth login
gh release create v0.2.0 target/release/schoolmate-proto.exe --title "Nexara v0.2.0 - Standalone Executable" --notes "Автономная версия Nexara AI Assistant"
```

## Проверка работы

После загрузки пользователи могут:
1. Скачать .exe файл
2. Запустить его двойным кликом
3. Приложение откроется с встроенным веб-сервером
4. Никаких дополнительных команд не требуется

## Структура проекта после сборки

```
target/release/
├── schoolmate-proto.exe    # Основной исполняемый файл (6.2 MB)
├── schoolmate_proto.pdb    # Debug symbols (для отладки)
└── resources/              # Встроенные ресурсы
```

## Преимущества standalone версии

✅ **Один файл** - вся программа в одном .exe
✅ **Без установки** - не требует инсталлятора
✅ **Портативность** - можно запускать с USB-накопителя
✅ **Автономность** - все зависимости встроены
✅ **Простота** - скачал и запустил

// 关闭 release 模式下的控制台窗口(避免后台弹出 cmd 黑窗)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::{Deserialize, Serialize};
use std::path::Path;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
struct MdFile {
    name: String,
    path: String,
}

#[derive(Serialize, Clone)]
struct FolderPayload {
    dir: String,
    files: Vec<MdFile>,
}

#[derive(Serialize, Clone)]
struct FilePayload {
    path: String,
    name: String,
    content: String,
}

// 持久化配置:记住上次文件夹 + 默认 md 文件
#[derive(Serialize, Deserialize, Default, Clone)]
struct AppConfig {
    last_folder: Option<String>,
    default_md: Option<String>,
}

#[tauri::command]
fn read_md_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

// 弹出文件夹选择对话框
#[tauri::command]
async fn pick_folder() -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        rfd::FileDialog::new()
            .set_title("选择 Markdown 文件夹")
            .pick_folder()
            .map(|p| p.to_string_lossy().to_string())
    })
    .await
    .map_err(|e| format!("对话框失败: {}", e))
}

// 扫描文件夹,返回所有 .md/.markdown 文件
#[tauri::command]
fn list_md_files(dir: String) -> Result<Vec<MdFile>, String> {
    let files = scan_md_files(Path::new(&dir));
    Ok(files)
}

// 保存"上次打开的文件夹"
#[tauri::command]
fn save_last_folder(app: AppHandle, dir: String) {
    let mut cfg = load_config(&app);
    cfg.last_folder = Some(dir);
    save_config(&app, &cfg);
}

// 设置/清除"默认 MD 文件"(传 null 即清除)
#[tauri::command]
fn set_default_md(app: AppHandle, path: Option<String>) {
    let mut cfg = load_config(&app);
    cfg.default_md = path;
    save_config(&app, &cfg);
}

// 读取当前配置(前端启动恢复 + 打开默认时用)
#[tauri::command]
fn get_config(app: AppHandle) -> AppConfig {
    load_config(&app)
}

// 从应用配置目录读取配置(读不到则返回默认空配置)
fn load_config(app: &AppHandle) -> AppConfig {
    if let Ok(dir) = app.path().app_config_dir() {
        let p = dir.join("mdview_config.json");
        if let Ok(s) = std::fs::read_to_string(&p) {
            if let Ok(cfg) = serde_json::from_str::<AppConfig>(&s) {
                return cfg;
            }
        }
    }
    AppConfig::default()
}

// 把配置写入应用配置目录
fn save_config(app: &AppHandle, cfg: &AppConfig) {
    if let Ok(dir) = app.path().app_config_dir() {
        if std::fs::create_dir_all(&dir).is_err() {
            return;
        }
        let p = dir.join("mdview_config.json");
        if let Ok(s) = serde_json::to_string_pretty(cfg) {
            let _ = std::fs::write(&p, s);
        }
    }
}

fn scan_md_files(dir: &Path) -> Vec<MdFile> {
    let mut files = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if ext.eq_ignore_ascii_case("md") || ext.eq_ignore_ascii_case("markdown") {
                        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
                            files.push(MdFile {
                                name: name.to_string(),
                                path: path.to_string_lossy().to_string(),
                            });
                        }
                    }
                }
            }
        }
    }
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    files
}

fn main() {
    // 解析命令行参数:双击 .md 文件打开时,Windows 会把文件路径作为参数传入
    let mut open_path: Option<String> = None;
    for arg in std::env::args().skip(1) {
        let lower = arg.to_lowercase();
        if lower.ends_with(".md") || lower.ends_with(".markdown") {
            open_path = Some(arg);
            break;
        }
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_md_file,
            pick_folder,
            list_md_files,
            save_last_folder,
            set_default_md,
            get_config
        ])
        .on_window_event(|window, event| {
            // 拖放处理:拖入文件夹 → 列出 md 文件;拖入 .md 文件 → 直接读取
            if let tauri::WindowEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                if let Some(p) = paths.first() {
                    if p.is_dir() {
                        let files = scan_md_files(p);
                        let payload = FolderPayload {
                            dir: p.to_string_lossy().to_string(),
                            files,
                        };
                        let _ = window.emit("mdview:folder", payload);
                    } else if p.is_file() {
                        let name = p
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        if let Ok(content) = std::fs::read_to_string(p) {
                            let payload = FilePayload {
                                path: p.to_string_lossy().to_string(),
                                name,
                                content,
                            };
                            let _ = window.emit("mdview:file", payload);
                        }
                    }
                }
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |app_handle, event| {
            // 窗口就绪后,自动打开命令行传入的 .md 文件
            if let tauri::RunEvent::Ready = event {
                if let Some(path) = &open_path {
                    if let Ok(content) = std::fs::read_to_string(path) {
                        let name = std::path::Path::new(path)
                            .file_name()
                            .map(|n| n.to_string_lossy().to_string())
                            .unwrap_or_default();
                        let payload = FilePayload {
                            path: path.clone(),
                            name,
                            content,
                        };
                        let _ = app_handle.emit("mdview:file", payload);
                    }
                }
            }
        });
}

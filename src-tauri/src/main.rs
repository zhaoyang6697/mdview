// 关闭 release 模式下的控制台窗口(避免后台弹出 cmd 黑窗)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::path::Path;
use tauri::Emitter;

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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_md_file, pick_folder, list_md_files])
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
        .run(tauri::generate_context!())
        .expect("启动失败");
}

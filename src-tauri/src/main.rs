// 关闭 release 模式下的控制台窗口(避免后台弹出 cmd 黑窗)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;

#[derive(Serialize)]
struct MdFile {
    name: String,
    path: String,
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
    let mut files = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| format!("读取目录失败: {}", e))?;
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
    files.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(files)
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_md_file,
            pick_folder,
            list_md_files
        ])
        .run(tauri::generate_context!())
        .expect("启动失败");
}

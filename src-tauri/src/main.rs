// 关闭 release 模式下的控制台窗口(避免后台弹出 cmd 黑窗)
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[tauri::command]
fn read_md_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path)
        .map_err(|e| format!("读取文件失败: {}", e))
}

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![read_md_file])
        .run(tauri::generate_context!())
        .expect("启动失败");
}

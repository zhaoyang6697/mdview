# mdview

> 本项目使用 opencode 生成

简单的 Markdown 预览桌面工具。拖入 .md 文件即可查看渲染效果,支持代码高亮、数学公式、流程图。

---

## 直接使用(无需编译)

`mdview.exe` 需要和 `WebView2Loader.dll` 放在**同一目录**才能运行。直接下载打包好的两个文件即可:

```
mdview.exe          (4.16 MB)
WebView2Loader.dll  (0.15 MB)
```

**注意**:只复制 `mdview.exe` 单独运行会报找不到 DLL 的错误,必须两个文件放一起。

---

## 项目结构

```
markdownView/
├── src/                                       # 前端(浏览器加载)
│   ├── index.html                            # 主页面
│   ├── main.js                               # 渲染流水线(拖放/marked/KaTeX/Mermaid)
│   ├── styles.css                            # GitHub 风格主题
│   └── vendor/                               # 第三方库(本地打包,离线可用)
│       ├── marked.min.js          (39 KB)
│       ├── highlight.min.js       (119 KB)
│       ├── katex.min.js           (269 KB)
│       ├── katex.min.css          (23 KB)
│       └── mermaid.min.js         (3.2 MB)
├── src-tauri/                                # Rust 后端
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   └── src/main.rs
├── assets/                                   # 图标
├── test-samples/                             # 5 个测试样本 md
├── preview.html                # 浏览器预览(无需编译,双击在 Chrome 打开)
├── scripts/
│   ├── validate.js              # 项目文件验证
│   └── build.ps1                # 一键构建脚本
└── README.md
```

---

## 浏览器预览(无需 Rust)

双击 `preview.html`,在 Chrome 中拖入任意 `.md` 文件即可看效果。与编译版渲染效果一致。

---

## 自行编译

### 1. 安装 Rust

```powershell
Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile "$env:TEMP\rustup-init.exe"
& "$env:TEMP\rustup-init.exe" -y --default-toolchain stable --default-host x86_64-pc-windows-msvc
```

装完后**新开 PowerShell 窗口**。

### 2. 一键编译

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build.ps1
```

首次编译 5-15 分钟(下载+编译 Tauri 运行时)。脚本自动完成全部步骤。

### 3. 产物

```
src-tauri\target\release\
├── mdview.exe                    (4.16 MB)  ← 需和 DLL 放一起
├── WebView2Loader.dll            (0.15 MB)  ← 必须带
└── bundle\nsis\mdview_0.1.0_x64-setup.exe   (2.06 MB)  ← 安装包,自带 DLL
```

**分发**:
- `setup.exe`: 发这一个文件给任何人,安装后直接用
- `mdview.exe` + `WebView2Loader.dll`: 两个文件放一起发给别人

---

## 平台支持

| 平台 | 状态 | 说明 |
|---|---|---|
| Windows 10/11 | ✅ 已验证 | 系统自带 WebView2 |
| macOS 12+ | ✅ 可编译 | 在 Mac 上 `cargo tauri build` 生成 .dmg |
| Linux | ⚠️ 未测试 | Tauri 支持,但本项目未验证 |

---

## 验证完整性

```powershell
node scripts\validate.js
```

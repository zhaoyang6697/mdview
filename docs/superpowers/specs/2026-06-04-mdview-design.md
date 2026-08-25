# mdview — Markdown 预览桌面工具 设计文档

**日期**: 2026-06-04
**状态**: Draft
**作者**: Sisyphus (brainstorming session)

---

## 1. 背景与目标

用户日常使用 Markdown 写文档,自用没问题,但分发给非技术同事(产品/运营/客户)时,对方需要装浏览器插件或专门软件,门槛高。

**目标**:做一个极简的桌面应用,把 .md 文件拖进去就能看到渲染好的预览,产物是单个 `.exe`(Windows)和 `.app`(macOS),双击即用,不需要安装任何运行时。

---

## 2. 范围(In Scope / Out of Scope)

### In Scope
- 标准 Markdown 语法(标题、列表、引用、链接、图片、强调)
- GFM 扩展(表格、任务列表、删除线)
- 代码块语法高亮(常用语言:JS/TS/Python/Go/Rust/Java/C++/Shell/SQL/HTML/CSS/JSON/Markdown)
- KaTeX 数学公式(`$inline$` 和 `$$display$$`)
- Mermaid 流程图(支持流程图、时序图、类图、甘特图、状态图)
- 拖拽打开(拖到 exe 图标 / 拖入已打开的窗口)
- GitHub Markdown 风格的默认主题(浅色)
- Windows 10/11 与 macOS 12+

### Out of Scope(YAGNI)
- 暗色模式 / 主题切换
- Markdown 编辑功能
- 多标签 / 同时打开多个文件
- 导出 PDF / 图片
- 历史记录 / 最近文件
- 设置 / 偏好
- 自动更新
- 代码签名
- 文件系统关联 / 右键菜单
- Linux 支持(暂不需要)
- 自定义字体 / 字号

---

## 3. 技术选型

### 核心栈:Tauri 2.x

| 维度 | 选择 | 理由 |
|---|---|---|
| 应用框架 | **Tauri 2.x** | 体积 3-5MB,启动 <1s,跨平台,WebView 系统自带 |
| 后端语言 | **Rust** | Tauri 必需;本项目只用最薄一层(文件 I/O) |
| 渲染引擎 | **WebView2**(Win) / **WebKit**(Mac) | 系统自带,用户零依赖 |
| Markdown 解析 | **marked.js** | 轻量(30KB),速度快,GFM 支持完善 |
| 代码高亮 | **highlight.js** | 自动语言检测,语言包按需加载 |
| 数学公式 | **KaTeX** | 比 MathJax 轻量 10 倍,渲染快 |
| 流程图 | **Mermaid** | 唯一成熟的纯 JS 图表库 |
| 主题样式 | 手写 CSS(参考 github-markdown-css) | 完全可控,无额外依赖 |

### 为什么不用 Electron
- Electron 把整个 Chromium 打包进 exe(60-100MB),违背"分发给非技术用户"的核心需求
- 启动慢 1-3s,体验差
- 内存占用高(每实例 100MB+)

### 为什么不用 Wails
- Tauri 体积更小(3-5MB vs 5-10MB)
- Tauri 生态更成熟
- 跨平台一致性 Tauri 略胜

---

## 4. 架构

```
┌─────────────────────────────────────────────┐
│  Tauri 应用(mdview.exe / mdview.app)        │
│                                              │
│  ┌────────────────────────────────────┐     │
│  │  Rust 后端(超薄,~50 行)            │     │
│  │  - read_md_file(path) -> Result    │     │
│  │  - 主窗口 + 拖放事件注册            │     │
│  └────────────────────────────────────┘     │
│                    │  IPC                    │
│                    ▼                         │
│  ┌────────────────────────────────────┐     │
│  │  前端(HTML + CSS + JS)            │     │
│  │  - 拖放处理                         │     │
│  │  - 渲染流水线                       │     │
│  │  - GitHub 风格主题                  │     │
│  └────────────────────────────────────┘     │
│                    │                         │
│                    ▼                         │
│  ┌────────────────────────────────────┐     │
│  │  WebView2(Win) / WebKit(Mac)      │     │
│  │  系统自带,无需打包                  │     │
│  └────────────────────────────────────┘     │
└─────────────────────────────────────────────┘
```

### 核心交互流

1. 用户双击 `mdview.exe` → 打开空窗口,显示「拖入 .md 文件」提示
2. 用户把 .md 文件拖入窗口 → 触发 HTML5 drop 事件
3. 前端从 `e.dataTransfer.files[0].path` 拿到绝对路径
4. 前端通过 `window.__TAURI__.invoke('read_md_file', { path })` 调用 Rust
5. Rust 读取文件内容 → 字符串返回给前端(失败返回错误信息)
6. 前端执行渲染流水线 → innerHTML 更新 → 用户看到结果

### 关键设计决策

- **不用 `file://` 协议直接打开 md**:WebView 的 file:// 有安全限制(CORS、本地资源访问),且 Tauri 不鼓励
- **不用文件系统监听**:单次预览,不需要热重载
- **不存任何状态**:无配置文件、无历史、无偏好,符合"功能只有一个"的极简原则
- **所有第三方 JS 库本地打包到 `src/vendor/`**:非技术用户可能没网、可能防火墙拦截 CDN

---

## 5. 项目结构

```
markdownView/
├── src-tauri/                  # Rust 后端
│   ├── Cargo.toml             # Rust 依赖
│   ├── tauri.conf.json        # Tauri 配置(窗口、icon、bundle)
│   ├── build.rs               # Tauri 构建脚本
│   └── src/
│       └── main.rs            # 主入口(~80 行)
│
├── src/                        # 前端
│   ├── index.html             # 主页面
│   ├── styles.css             # GitHub 风格主题 + KaTeX 字体
│   ├── main.js                # 拖放 + IPC + 渲染编排
│   └── vendor/                # 第三方 JS 库(本地,离线)
│       ├── marked.min.js
│       ├── highlight.min.js
│       ├── katex.min.js
│       ├── katex.min.css
│       └── mermaid.min.js
│
├── assets/                     # 图标
│   ├── icon.ico               # Windows(256x256)
│   ├── icon.icns              # macOS
│   └── icon.png               # 通用
│
├── docs/
│   └── superpowers/
│       └── specs/
│           └── 2026-06-04-mdview-design.md   # 本文档
│
└── README.md
```

### 体积预估

| 组件 | 体积 |
|---|---|
| marked.js | 30KB |
| highlight.js(常用语言) | 500KB |
| KaTeX(JS + CSS + 字体) | 1.2MB |
| Mermaid | 800KB |
| 前端代码 | 50KB |
| Rust 后端编译产物 | 1-2MB |
| Tauri 运行时 | 1-2MB |
| **总计** | **4-7MB** |

---

## 6. 模块设计

### 6.1 Rust 后端 `src-tauri/src/main.rs`

```rust
use tauri::Manager;

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
```

**唯一职责**:把 .md 文件从磁盘读到内存返回给前端。其他什么都不做。

### 6.2 前端渲染流水线 `src/main.js`

```javascript
document.body.addEventListener('dragover', e => e.preventDefault());
document.body.addEventListener('drop', async (e) => {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (!file.name.toLowerCase().endsWith('.md')) {
    return showError('请拖入 .md 文件');
  }
  const content = await window.__TAURI__.invoke('read_md_file', {
    path: file.path
  });
  document.getElementById('content').innerHTML = renderMarkdown(content);
});

function renderMarkdown(text) {
  // 1. 提取 ```mermaid 代码块,临时占位(避免 marked 破坏 Mermaid 语法)
  // 2. marked.parse() → HTML
  // 3. 注入到 DOM
  // 4. highlight.js 高亮所有 <pre><code>
  // 5. KaTeX renderMathInElement() 处理 $...$ 和 $$...$$
  // 6. mermaid.run() 把占位符替换为 SVG
}
```

**渲染顺序的关键**:
- Mermaid 必须先抽出(因为 marked 会把 ```mermaid 块里的内容当普通代码)
- KaTeX 必须在 marked 之后(因为要处理 HTML 中的 $...$)
- highlight.js 在 marked 之后(因为要处理渲染好的 <pre><code>)

### 6.3 错误处理

| 场景 | 表现 |
|---|---|
| 拖入非 .md 文件 | 顶部红色横幅「请拖入 .md 文件」 |
| 文件不存在 | 红色横幅「读取文件失败: 系统找不到指定的文件」 |
| 权限不足 | 红色横幅「读取文件失败: 拒绝访问」 |
| 文件超大(>10MB) | 提示「文件较大,渲染可能需要几秒」 |
| Markdown 语法错误 | marked 容错,尽力渲染 |
| Mermaid 语法错误 | Mermaid 自身显示红色错误框 |
| KaTeX 公式错误 | KaTeX 自身显示红色错误信息 |

**所有错误都不阻塞应用,只是显示提示**。

### 6.4 窗口配置 `src-tauri/tauri.conf.json`

```json
{
  "productName": "mdview",
  "version": "0.1.0",
  "identifier": "com.local.mdview",
  "app": {
    "windows": [{
      "title": "Markdown 预览",
      "width": 1100,
      "height": 800,
      "minWidth": 600,
      "minHeight": 400,
      "resizable": true,
      "fullscreen": false
    }],
    "security": {
      "csp": "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis", "dmg"],
    "icon": ["assets/icon.ico", "assets/icon.icns"]
  }
}
```

**安全策略**:
- CSP 限制资源只能来自本地(self)
- 不允许外网请求(符合离线需求)
- `style-src 'unsafe-inline'` 是 KaTeX/Mermaid 需要的

---

## 7. 开发与构建

### 7.1 开发环境(开发者机器,一次性安装)

```bash
# 1. Rust 工具链
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Node.js LTS(仅打包前端资源,不写 Node 代码)
# 下载: https://nodejs.org

# 3. Tauri CLI
cargo install tauri-cli --version "^2.0"

# 4. 平台额外依赖
# Windows:Microsoft Visual C++ Build Tools + WebView2 SDK
# macOS:Xcode Command Line Tools
```

### 7.2 开发模式

```bash
cargo tauri dev
```

- 启动后窗口立即出现
- 改前端文件(`src/*`)→ 窗口热重载
- 改 Rust 文件 → 自动重启

### 7.3 编译发布

```bash
# 当前平台
cargo tauri build

# 跨平台交叉编译(需要在 Mac 上才能编译 Mac 版本)
cargo tauri build --target aarch64-apple-darwin   # macOS Apple Silicon
cargo tauri build --target x86_64-apple-darwin    # macOS Intel
cargo tauri build --target x86_64-pc-windows-msvc # Windows
```

### 7.4 编译产物

```
target/release/bundle/
├── nsis/
│   └── mdview_0.1.0_x64-setup.exe     # Windows 安装包(~6MB)
├── msi/
│   └── mdview_0.1.0_x64_en-US.msi
├── dmg/
│   └── mdview_0.1.0_aarch64.dmg       # macOS 镜像(~6MB)
└── macos/
    └── mdview.app                      # macOS app 包
```

**推荐分发**:
- Windows:`mdview_0.1.0_x64-setup.exe`(NSIS)
- macOS:`mdview_0.1.0_aarch64.dmg`

---

## 8. 测试策略

| 类别 | 内容 |
|---|---|
| 样本文件 | 准备 5 个测试 .md:基础、表格、代码、公式、流程图 |
| 平台 | Windows 10 / Windows 11 / macOS 12+(Intel + Apple Silicon) |
| 边界 | 非 md 文件、空 md、超大 md(>10MB)、含中文/空格路径 |
| UX | 拖到 exe 图标、拖入已开窗口、连续拖多个文件 |

**MVP 完成标准**:
1. 5 个样本文件全部正确渲染
2. 在两台 Windows 11 机器 + 两台 Mac(不同架构)上正常运行
3. exe/app 体积 ≤ 8MB

---

## 9. 风险与缓解

| 风险 | 缓解 |
|---|---|
| 用户电脑没装 WebView2(极老的 Win10) | 文档说明;可选 Bootstrapper 模式(自动下载安装) |
| Mermaid 渲染慢(大文档) | 提示用户;可后续加"按需渲染" |
| KaTeX 字体加载失败 | 字体打包到本地 vendor |
| 跨平台图标差异 | 使用平台特定格式(ico/icns) |
| Rust 学习曲线 | 本项目 Rust 代码极少(<100 行),参考本设计即可 |

---

## 10. 后续可能扩展(暂不实现)

- 暗色模式
- 多文件/标签
- 导出 PDF
- 文件关联(双击 .md 默认用 mdview 打开)
- 自定义 CSS 主题
- 全文搜索

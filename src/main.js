// mdview - Markdown 预览渲染流水线
// 依赖:marked, highlight.js, KaTeX, mermaid(全部本地 vendor,见 index.html)

'use strict';

// ===== 1. Mermaid 初始化 =====
mermaid.initialize({
  startOnLoad: false,        // 我们手动控制渲染时机
  theme: 'default',          // GitHub 风格
  securityLevel: 'strict',   // 禁用外部资源
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif'
});

// ===== 2. Marked 配置(含代码高亮 + 数学公式扩展) =====

// 数学公式扩展:把 $...$ 和 $$...$$ 转成自定义 class 元素,KaTeX 后续处理
const mathExtension = {
  name: 'math',
  level: 'inline',
  start(src) {
    return src.match(/\$\$/)?.index;
  },
  tokenizer(src) {
    // 块级 $$...$$
    const blockMatch = /^\$\$([\s\S]+?)\$\$(?:\n|$)/.exec(src);
    if (blockMatch) {
      return {
        type: 'math',
        raw: blockMatch[0],
        text: blockMatch[1].trim(),
        displayMode: true
      };
    }
    // 行内 $...$
    const inlineMatch = /^\$([^\$\n]+?)\$/.exec(src);
    if (inlineMatch) {
      return {
        type: 'math',
        raw: inlineMatch[0],
        text: inlineMatch[1].trim(),
        displayMode: false
      };
    }
  },
  renderer(token) {
    const cls = token.displayMode ? 'math-display' : 'math-inline';
    return `<div class="${cls}">${escapeHtml(token.text)}</div>`;
  }
};

marked.use({ extensions: [mathExtension] });

marked.setOptions({
  gfm: true,           // GFM 扩展(表格、删除线、任务列表)
  breaks: false,       // 不把单个换行变 <br>(GitHub 默认行为)
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) {
        return code;
      }
    }
    // 没有指定语言,自动检测
    try {
      return hljs.highlightAuto(code).value;
    } catch (e) {
      return code;
    }
  }
});

// ===== 3. 拖放处理(Tauri 原生拖放:拖入文件夹/文件由 Rust 扫描后发事件) =====

async function tauriInvoke(cmd, args = {}) {
  if (!window.__TAURI__) {
    throw new Error('Tauri API 不可用(浏览器预览模式不支持此功能)');
  }
  return window.__TAURI__.core.invoke(cmd, args);
}

let currentDir = null; // 当前打开的文件夹

// 「打开文件夹」按钮:弹系统文件夹选择框
document.getElementById('btn-open-folder').addEventListener('click', async () => {
  hideError();
  try {
    const dir = await tauriInvoke('pick_folder');
    if (!dir) return; // 用户取消
    currentDir = dir;
    document.getElementById('folder-path').textContent = dir;
    const files = await tauriInvoke('list_md_files', { dir });
    renderFileList(files);
  } catch (err) {
    showError(`打开文件夹失败: ${err}`);
  }
});

// 监听 Rust 端发来的事件
async function initDropListener() {
  if (!window.__TAURI__) return;
  // 拖入文件夹 → 左侧列出 md 文件
  await window.__TAURI__.event.listen('mdview:folder', (e) => {
    const { dir, files } = e.payload;
    currentDir = dir;
    document.getElementById('folder-path').textContent = dir;
    renderFileList(files);
  });
  // 拖入单个 .md 文件 → 直接渲染
  await window.__TAURI__.event.listen('mdview:file', (e) => {
    const { path, name, content } = e.payload;
    hideError();
    renderContent(content);
  });
}
initDropListener();

function renderFileList(files) {
  const list = document.getElementById('file-list');
  list.innerHTML = '';
  if (!files.length) {
    const tip = document.createElement('div');
    tip.className = 'empty-tip';
    tip.textContent = '此文件夹没有 .md 文件';
    list.appendChild(tip);
    return;
  }
  files.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.textContent = file.name;
    item.title = file.path;
    item.addEventListener('click', () => {
      list.querySelectorAll('.file-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      openMdFile(file.path, file.name);
    });
    list.appendChild(item);
  });
}

async function openMdFile(path, name) {
  hideError();
  try {
    const content = await tauriInvoke('read_md_file', { path });
    renderContent(content);
  } catch (err) {
    showError(`打开失败: ${name}: ${err}`);
  }
}

// ===== 4. 渲染流水线 =====

function renderContent(text) {
  document.getElementById('placeholder').style.display = 'none';

  // 第一步:提取 ```mermaid 代码块,替换为占位 div(marked 不会动 div 内部)
  const mermaidBlocks = [];
  const processedText = text.replace(/```mermaid\n([\s\S]+?)\n```/g, (match, code) => {
    const id = 'mermaid-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    mermaidBlocks.push({ id, code: code.trim() });
    return `<div class="mermaid-placeholder" id="${id}">${escapeHtml(code.trim())}</div>`;
  });

  // 第二步:marked 解析为 HTML
  const html = marked.parse(processedText);
  document.getElementById('content').innerHTML = html;

  // 第三步:代码高亮(marked parse 时已处理过,这里兜底)
  document.querySelectorAll('pre code').forEach(block => {
    if (!block.classList.contains('hljs')) {
      hljs.highlightElement(block);
    }
  });

  // 第四步:数学公式
  renderMath();

  // 第五步:异步渲染 Mermaid(必须在 DOM 准备好后)
  renderMermaidBlocks(mermaidBlocks);
}

function renderMath() {
  // 块级 $$...$$
  document.querySelectorAll('#content .math-display').forEach(el => {
    try {
      katex.render(el.textContent, el, { displayMode: true, throwOnError: false });
    } catch (e) {
      console.error('KaTeX display error:', e);
    }
  });

  // 行内 $...$
  document.querySelectorAll('#content .math-inline').forEach(el => {
    try {
      katex.render(el.textContent, el, { displayMode: false, throwOnError: false });
    } catch (e) {
      console.error('KaTeX inline error:', e);
    }
  });
}

async function renderMermaidBlocks(blocks) {
  for (const { id, code } of blocks) {
    const el = document.getElementById(id);
    if (!el) continue;
    try {
      const { svg } = await mermaid.render(id + '-svg', code);
      el.innerHTML = svg;
      el.classList.remove('mermaid-placeholder');
      el.classList.add('mermaid-rendered');
    } catch (e) {
      el.innerHTML = `<pre class="mermaid-error">Mermaid 渲染失败:\n${escapeHtml(String(e))}</pre>`;
    }
  }
}

// ===== 5. 错误提示 =====

function showError(msg) {
  const el = document.getElementById('error');
  el.textContent = msg;
  el.style.display = 'block';
  el.style.cursor = 'pointer';
  el.onclick = hideError;
}

function hideError() {
  document.getElementById('error').style.display = 'none';
}

// ===== 6. 工具函数 =====

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

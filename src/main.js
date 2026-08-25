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

// ===== 3. 拖放处理 =====

// 全局禁用浏览器默认拖放行为(否则会打开文件而不是 drop 到应用)
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  document.body.addEventListener(eventName, e => e.preventDefault());
  document.body.addEventListener(eventName, e => e.stopPropagation());
});

// 监听 drop
document.body.addEventListener('drop', async (e) => {
  e.preventDefault();
  hideError();

  const file = e.dataTransfer.files[0];
  if (!file) {
    showError('没有检测到文件');
    return;
  }

  if (!file.name.toLowerCase().endsWith('.md') &&
      !file.name.toLowerCase().endsWith('.markdown')) {
    showError('请拖入 .md 或 .markdown 文件');
    return;
  }

  // 大文件警告(>10MB,不阻断,只提示)
  if (file.size > 10 * 1024 * 1024) {
    showError(`文件较大 (${(file.size / 1024 / 1024).toFixed(1)} MB),渲染可能较慢`);
  }

  // 用 FileReader 读文件(无需 Tauri IPC,跟 preview.html 一致)
  try {
    const content = await readFileAsText(file);
    renderContent(content);
  } catch (err) {
    showError(`读取失败: ${err.message || err}`);
  }
});

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(reader.error?.message || '文件读取失败'));
    reader.readAsText(file, 'UTF-8');
  });
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

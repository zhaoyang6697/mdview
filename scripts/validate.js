// validate.js - 验证项目所有文件正确性(无需 Rust)
const fs = require('fs');
const path = require('path');

const root = __dirname.replace(/scripts$/, '');

function ok(msg) { console.log('  [OK]   ' + msg); }
function fail(msg) { console.log('  [FAIL] ' + msg); process.exitCode = 1; }
function info(msg) { console.log('  [INFO] ' + msg); }

console.log('=== 1. Cargo.toml ===');
try {
  const toml = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8');
  const lines = toml.split('\n').length;
  info('Lines: ' + lines);
  if (toml.includes('[package]')) ok('Has [package] section'); else fail('Missing [package]');
  if (toml.includes('[dependencies]')) ok('Has [dependencies] section'); else fail('Missing [dependencies]');
  const tauriMatch = toml.match(/tauri\s*=\s*\{[^}]*version\s*=\s*"([^"]+)"/);
  info('Tauri version: ' + (tauriMatch ? tauriMatch[1] : 'not found'));
  if (toml.includes('lto = true')) ok('Has LTO optimization'); else fail('Missing LTO');
  if (toml.includes('opt-level = "s"')) ok('Has size optimization'); else fail('Missing opt-level');
  if (toml.includes('strip = true')) ok('Has strip'); else fail('Missing strip');
} catch (e) { fail('Cannot read Cargo.toml: ' + e.message); }

console.log('\n=== 2. tauri.conf.json ===');
try {
  const c = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json'), 'utf8'));
  info('productName: ' + c.productName);
  info('identifier: ' + c.identifier);
  info('window title: ' + c.app.windows[0].title);
  info('window size: ' + c.app.windows[0].width + 'x' + c.app.windows[0].height);
  ok('fileDropEnabled: ' + c.app.windows[0].fileDropEnabled);
  info('bundle targets: ' + c.bundle.targets.join(', '));
  info('icons: ' + c.bundle.icon.join(', '));
  if (c.app.security.csp) ok('Has CSP'); else fail('Missing CSP');
} catch (e) { fail('Cannot parse tauri.conf.json: ' + e.message); }

console.log('\n=== 3. main.js syntax ===');
try {
  const js = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  new Function(js); // throws on syntax error
  ok('main.js: ' + js.split('\n').length + ' lines, syntax valid');
  // Check for required functions
  const required = ['renderContent', 'renderMath', 'renderMermaidBlocks', 'showError', 'hideError', 'humanizeError', 'escapeHtml'];
  for (const fn of required) {
    if (js.includes('function ' + fn)) ok('Has ' + fn + '()'); else fail('Missing ' + fn);
  }
  // Check for required event listeners
  if (js.includes("addEventListener('drop'")) ok('Has drop listener'); else fail('Missing drop listener');
  if (js.includes("mermaid.initialize")) ok('Has mermaid init'); else fail('Missing mermaid init');
  if (js.includes("marked.setOptions")) ok('Has marked config'); else fail('Missing marked config');
  if (js.includes("hljs.highlight")) ok('Has highlight.js integration'); else fail('Missing highlight.js');
  if (js.includes("katex.render")) ok('Has KaTeX integration'); else fail('Missing KaTeX');
} catch (e) { fail('main.js syntax error: ' + e.message); }

console.log('\n=== 4. styles.css ===');
try {
  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  ok('styles.css: ' + css.split('\n').length + ' lines');
  // Check for key classes
  const required = ['.markdown-body', '#error', '#placeholder', '.hljs', '.mermaid-placeholder', '.mermaid-rendered', '.mermaid-error'];
  for (const cls of required) {
    if (css.includes(cls)) ok('Has selector: ' + cls); else fail('Missing selector: ' + cls);
  }
} catch (e) { fail('Cannot read styles.css: ' + e.message); }

console.log('\n=== 5. index.html ===');
try {
  const html = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
  const required = ['marked.min.js', 'highlight.min.js', 'katex.min.js', 'katex.min.css', 'mermaid.min.js', 'main.js', 'styles.css'];
  for (const ref of required) {
    if (html.includes(ref)) ok('References ' + ref); else fail('Missing reference: ' + ref);
  }
  if (html.includes('id="content"')) ok('Has #content div'); else fail('Missing #content');
  if (html.includes('id="error"')) ok('Has #error div'); else fail('Missing #error');
  if (html.includes('id="placeholder"')) ok('Has #placeholder div'); else fail('Missing #placeholder');
} catch (e) { fail('Cannot read index.html: ' + e.message); }

console.log('\n=== 6. preview.html ===');
try {
  const html = fs.readFileSync(path.join(root, 'preview.html'), 'utf8');
  if (html.includes('FileReader')) ok('Uses FileReader (browser fallback)'); else fail('Missing FileReader');
  if (html.includes('mermaid.initialize')) ok('Has mermaid init'); else fail('Missing mermaid init');
  if (html.includes('katex.render')) ok('Has KaTeX'); else fail('Missing KaTeX');
  ok('preview.html: ' + html.split('\n').length + ' lines');
} catch (e) { fail('Cannot read preview.html: ' + e.message); }

console.log('\n=== 7. Vendor libraries ===');
const expected = [
  ['src/vendor/marked.min.js', 20],
  ['src/vendor/highlight.min.js', 100],
  ['src/vendor/katex.min.js', 200],
  ['src/vendor/katex.min.css', 10],
  ['src/vendor/mermaid.min.js', 1000]
];
let totalKB = 0;
for (const [rel, minKB] of expected) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) {
    const kb = Math.round(fs.statSync(p).size / 1024);
    totalKB += kb;
    if (kb >= minKB) ok(rel + ': ' + kb + ' KB'); else fail(rel + ': ' + kb + ' KB (expected >' + minKB + ')');
  } else {
    fail(rel + ': MISSING');
  }
}
info('Total vendor: ' + totalKB + ' KB (' + (totalKB/1024).toFixed(2) + ' MB)');

console.log('\n=== 8. Icons ===');
const icons = ['src-tauri/../assets/icon.png', 'src-tauri/../assets/icon.ico', 'src-tauri/../assets/icon-source.png'];
for (const rel of icons) {
  const p = path.join(root, rel);
  if (fs.existsSync(p)) {
    const kb = Math.round(fs.statSync(p).size / 1024);
    ok(rel + ': ' + kb + ' KB');
  } else {
    fail(rel + ': MISSING');
  }
}
const icns = path.join(root, 'assets/icon.icns');
if (fs.existsSync(icns)) ok('icon.icns exists'); else info('icon.icns: needs to be generated on macOS');

console.log('\n=== 9. Test samples ===');
const samples = ['01-basic.md', '02-code.md', '03-math.md', '04-mermaid.md', '05-all-in-one.md'];
for (const s of samples) {
  const p = path.join(root, 'test-samples', s);
  if (fs.existsSync(p)) {
    const kb = Math.round(fs.statSync(p).size / 1024 * 10) / 10;
    ok('test-samples/' + s + ': ' + kb + ' KB');
  } else {
    fail('test-samples/' + s + ': MISSING');
  }
}

console.log('\n=== 10. Git history ===');
const { execSync } = require('child_process');
try {
  const log = execSync('git log --oneline', { cwd: root }).toString().trim();
  const commits = log.split('\n');
  info('Commits: ' + commits.length);
  commits.forEach(c => info('  ' + c));
} catch (e) { fail('Cannot read git log: ' + e.message); }

console.log('\n=== Summary ===');
if (process.exitCode) {
  console.log('FAIL: Some checks failed');
} else {
  console.log('PASS: All files validated successfully');
  console.log('Next step: Install Rust (rustup) to compile and build .exe');
}

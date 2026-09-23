// 把共享的四个文件从 Chrome 目录同步到 Firefox 目录
// 两边 JS/HTML 完全一致，只有 manifest.json 不同（Chrome 用 MV3，Firefox 用 MV2）
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'bili-course-companion');
const DST = path.join(__dirname, 'bili-course-companion-firefox');
const FILES = ['background.js', 'content.js', 'options.html', 'options.js'];

fs.mkdirSync(DST, { recursive: true });
for (const f of FILES) {
  const from = path.join(SRC, f);
  const to = path.join(DST, f);
  if (!fs.existsSync(from)) { console.error('缺少源文件:', from); process.exit(1); }
  fs.copyFileSync(from, to);
  console.log('synced', f);
}
console.log('完成。firefox/manifest.json 保持不动。');

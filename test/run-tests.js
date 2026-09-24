// Bilibili LecturePilot 测试
// 运行：node test/run-tests.js
// 无第三方依赖；用 new Function + 桩件加载真实源码，测试纯函数与网络层逻辑。
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'bili-course-companion');
const BG = fs.readFileSync(path.join(DIR, 'background.js'), 'utf8');
const CT = fs.readFileSync(path.join(DIR, 'content.js'), 'utf8');

let passed = 0, failed = 0;
const failures = [];
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { passed++; console.log('  ok -', name); })
    .catch(e => { failed++; failures.push([name, e]); console.log('  FAIL -', name, '=>', e.message); });
}
function mockRes(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

// ---------- 加载 background.js（注入桩件） ----------
function loadBg({ fetchImpl, storageData } = {}) {
  const ext = {
    runtime: {
      onMessage: { addListener() { } },
      onConnect: { addListener() { } },
      sendMessage: async () => ({})
    },
    storage: {
      local: {
        get: async keys => { const d = storageData || {}, out = {}; (Array.isArray(keys) ? keys : []).forEach(k => { if (d[k] !== undefined) out[k] = d[k]; }); return out; },
        set: async () => { }
      }
    }
  };
  const fn = new Function('browser', 'chrome', 'fetch', 'console', 'URLSearchParams', 'TextDecoder',
    BG + '\n;return { md5, getMixinKey, signParams, buildMessages, OUTPUT_RULES, enrichPrompt, answerPrompt, quizPrompt, quizUptoPrompt, termsPrompt, callLLM, cacheKey, pickSub, subListOf, fetchSubtitleSentences };');
  return fn(ext, undefined, fetchImpl || (async () => { throw new Error('fetch not stubbed'); }), console, URLSearchParams, TextDecoder);
}

// ---------- 加载 content.js（剥掉外层 IIFE，注入假 DOM） ----------
function loadCt({ href = 'https://www.bilibili.com/video/BV1xx411c7mD?p=1', search = '?p=1', sendResponse } = {}) {
  function makeEl(tag) {
    const el = {
      tagName: tag || 'div', id: '', className: '', dataset: {}, style: {}, children: [],
      _html: '', textContent: '', value: '',
      appendChild(c) { this.children.push(c); return c; },
      remove() { }, click() { }, scrollIntoView() { },
      addEventListener() { }, removeEventListener() { },
      setAttribute() { }, getAttribute() { return null; },
      classList: { add() { }, remove() { }, toggle() { }, contains() { return false; } },
      querySelector() { return null; }, querySelectorAll() { return []; },
      closest() { return null; }
    };
    Object.defineProperty(el, 'innerHTML', { get() { return this._html; }, set(v) { this._html = v; this.children = []; } });
    return el;
  }
  const byId = new Map();
  const documentStub = {
    head: makeEl('head'), body: makeEl('body'),
    createElement: tag => makeEl(tag),
    getElementById(id) {
      if (id === 'bili-companion-root') return null; // 模拟首次注入，避免守卫提前 return
      if (!byId.has(id)) { const el = makeEl('div'); el.id = id; byId.set(id, el); }
      return byId.get(id);
    },
    querySelector() { return makeEl('div'); }
  };
  const ext = {
    runtime: {
      sendMessage: async msg => (sendResponse ? sendResponse(msg) : { error: 'stub' }),
      onMessage: { addListener() { } }, connect() { return { onMessage: { addListener() { } }, onDisconnect: { addListener() { } }, postMessage() { }, disconnect() { } }; }
    },
    storage: { local: { get: async () => ({}), set: async () => { } } }
  };
  // 剥离最外层 IIFE：注释保留在函数体内无害，只去掉 (function () { ... })(); 外壳
  const open = '(function () {', close = '})();';
  const startIdx = CT.indexOf(open), endIdx = CT.lastIndexOf(close);
  assert.ok(startIdx >= 0 && endIdx > startIdx, 'content.js IIFE 外壳定位失败');
  const body = CT.slice(startIdx + open.length, endIdx);
  const fn = new Function('browser', 'chrome', 'document', 'window', 'location', 'sessionStorage', 'setInterval', 'setTimeout', 'console', 'URL', 'Blob',
    body + '\n;return { fmtTime, srtTime, escHtml, escRe, latexClean, mdInline, renderMarkdown, getVideoKey, selectText };');
  const api = fn(ext, undefined, documentStub,
    { getSelection: () => '' },
    { href, search },
    { getItem: () => null, setItem() { }, removeItem() { } },
    () => 0, // setInterval 空转
    (f, ms) => setTimeout(f, ms),
    console,
    { createObjectURL: () => 'blob:x', revokeObjectURL() { } },
    class Blob { constructor(parts) { this.parts = parts; } }
  );
  return { api, byId, documentStub };
}

(async () => {
  console.log('== background.js ==');

  await t('md5 已知向量', () => {
    const bg = loadBg();
    assert.strictEqual(bg.md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
    assert.strictEqual(bg.md5('hello'), '5d41402abc4b2a76b9719d911017c592');
    assert.strictEqual(bg.md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  });

  await t('getMixinKey 结构正确（32 位、确定性、字符来自输入）', () => {
    const bg = loadBg();
    const orig = '0123456789abcdef'.repeat(4); // 64 字符
    const k1 = bg.getMixinKey(orig);
    const k2 = bg.getMixinKey(orig);
    assert.strictEqual(k1.length, 32);
    assert.strictEqual(k1, k2);
    for (const ch of k1) assert.ok(orig.includes(ch), 'mixin 字符应来自输入');
  });

  await t('signParams 生成 wts 与 32 位十六进制 w_rid，且对参数敏感', () => {
    const bg = loadBg();
    const img = 'a'.repeat(32), sub = 'b'.repeat(32);
    const now = Date.now; Date.now = () => 1700000000000;
    try {
      const s1 = bg.signParams({ bvid: 'BV123', cid: 456 }, img, sub);
      const s2 = bg.signParams({ bvid: 'BV123', cid: 456 }, img, sub);
      assert.strictEqual(typeof s1.wts, 'number');
      assert.ok(/^[0-9a-f]{32}$/.test(s1.w_rid), 'w_rid 应为 32 位 hex');
      assert.strictEqual(s1.w_rid, s2.w_rid, '同参数同时间签名应一致');
      const s3 = bg.signParams({ bvid: 'BV999', cid: 456 }, img, sub);
      assert.notStrictEqual(s1.w_rid, s3.w_rid, '参数不同签名应不同');
    } finally { Date.now = now; }
  });

  await t('buildMessages：无历史 / 有历史 / 历史截断到最近 6 对', () => {
    const bg = loadBg();
    assert.strictEqual(bg.buildMessages('Q').length, 1);
    const h = [{ q: 'q1', a: 'a1' }, { q: 'q2', a: 'a2' }];
    const m = bg.buildMessages('Q', h);
    assert.strictEqual(m.length, 5);
    assert.deepStrictEqual(m.map(x => x.role), ['user', 'assistant', 'user', 'assistant', 'user']);
    const h8 = Array.from({ length: 8 }, (_, i) => ({ q: 'q' + i, a: 'a' + i }));
    assert.strictEqual(bg.buildMessages('Q', h8).length, 13); // 6 对 + 当前问题
  });

  await t('提示词：含输出规则、含原文、quizUptoPrompt 格式化时间', () => {
    const bg = loadBg();
    assert.ok(bg.OUTPUT_RULES.includes('LaTeX') && bg.OUTPUT_RULES.includes('Unicode'));
    assert.ok(bg.enrichPrompt('什么是极限', '原文片段').includes('原文片段'));
    assert.ok(bg.answerPrompt('问题', '原文', 'plain', 'normal').includes('大白话'));
    assert.ok(bg.quizUptoPrompt('字幕内容', 754).includes('12:34'));
    assert.ok(bg.termsPrompt('任意字幕').includes('JSON'));
  });

  await t('callLLM：5xx 后重试成功', async () => {
    let calls = 0;
    const fetchImpl = async () => (++calls === 1)
      ? mockRes(500, { error: { message: 'rrgw.InternalServerError: upstream - Internal Server Error' } })
      : mockRes(200, { choices: [{ message: { content: '答案' } }] });
    const bg = loadBg({ fetchImpl });
    const real = global.setTimeout; global.setTimeout = f => { if (typeof f === 'function') f(); return 0; };
    try {
      const out = await bg.callLLM([{ role: 'user', content: 'q' }], { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm' });
      assert.strictEqual(out, '答案');
      assert.strictEqual(calls, 2);
    } finally { global.setTimeout = real; }
  });

  await t('callLLM：4xx 不重试直接抛错', async () => {
    let calls = 0;
    const bg = loadBg({ fetchImpl: async () => { calls++; return mockRes(401, { error: { message: 'unauthorized' } }); } });
    await assert.rejects(bg.callLLM([{ role: 'user', content: 'q' }], { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm' }), /unauthorized/);
    assert.strictEqual(calls, 1);
  });

  await t('callLLM：持续 500 重试 3 次后抛错', async () => {
    let calls = 0;
    const bg = loadBg({ fetchImpl: async () => { calls++; return mockRes(500, { error: { message: 'upstream - Internal Server Error' } }); } });
    const real = global.setTimeout; global.setTimeout = f => { if (typeof f === 'function') f(); return 0; };
    try {
      await assert.rejects(bg.callLLM([{ role: 'user', content: 'q' }], { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm' }), /Internal Server Error/);
      assert.strictEqual(calls, 3);
    } finally { global.setTimeout = real; }
  });

  await t('callLLM：未配置 Key 直接抛错且不发起请求', async () => {
    let calls = 0;
    const bg = loadBg({ fetchImpl: async () => { calls++; return mockRes(200, {}); } });
    await assert.rejects(bg.callLLM([], { apiKey: '' }), /尚未配置 API Key/);
    assert.strictEqual(calls, 0);
  });

  await t('callLLM：空内容返回占位文案', async () => {
    const bg = loadBg({ fetchImpl: async () => mockRes(200, { choices: [{ message: { content: '' } }] }) });
    const out = await bg.callLLM([{ role: 'user', content: 'q' }], { apiKey: 'k', baseUrl: 'https://x/v1', model: 'm' });
    assert.strictEqual(out, '（未返回内容）');
  });

  await t('pickSub：优先 ai-zh，其次 zh，过滤无 URL 项', () => {
    const bg = loadBg();
    const mk = (lan, url) => ({ lan, subtitle_url: url });
    assert.strictEqual(bg.pickSub([mk('zh-CN', 'a'), mk('ai-zh', 'b')]).lan, 'ai-zh');
    assert.strictEqual(bg.pickSub([mk('en', 'a'), mk('zh-CN', 'b')]).lan, 'zh-CN');
    assert.strictEqual(bg.pickSub([{ lan: 'zh-CN' }, mk('en', 'x')]).lan, 'en');
    assert.strictEqual(bg.pickSub([]), null);
  });

  await t('fetchSubtitleSentences：换行转空格、过滤空句', async () => {
    const bg = loadBg({
      fetchImpl: async () => ({ json: async () => ({ body: [{ from: 0, to: 1, content: '你好\n世界' }, { from: 1, to: 2, content: '  ' }] }) })
    });
    const ss = await bg.fetchSubtitleSentences({ subtitle_url: 'https://x/sub.json' });
    assert.deepStrictEqual(ss, [{ from: 0, to: 1, text: '你好 世界' }]);
  });

  console.log('== content.js ==');

  await t('初始化冒烟：加载 2 句字幕并渲染', async () => {
    const { byId } = loadCt({
      sendResponse: msg => msg.type === 'getSubtitles'
        ? { sentences: [{ from: 0, to: 2, text: '第一句' }, { from: 2, to: 4, text: '第二句' }], title: '测试课', partName: '', page: 1 }
        : { error: 'stub' }
    });
    await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r));
    const status = byId.get('bc-status');
    assert.ok(status.textContent.includes('已加载 2 句字幕'), '状态应显示加载成功，实际: ' + status.textContent);
    assert.strictEqual(byId.get('bc-transcript').children.length, 2);
  });

  await t('fmtTime / srtTime', () => {
    const { api } = loadCt();
    assert.strictEqual(api.fmtTime(0), '00:00');
    assert.strictEqual(api.fmtTime(65), '01:05');
    assert.strictEqual(api.fmtTime(600), '10:00');
    assert.strictEqual(api.srtTime(0), '00:00:00,000');
    assert.strictEqual(api.srtTime(3661.5), '01:01:01,500');
  });

  await t('escHtml 转义', () => {
    const { api } = loadCt();
    assert.strictEqual(api.escHtml('<a>&"'), '&lt;a&gt;&amp;"');
  });

  await t('latexClean：常用命令转 Unicode', () => {
    const { api } = loadCt();
    assert.strictEqual(api.latexClean('(\\varepsilon,\\delta)'), '(ε,δ)');
    assert.strictEqual(api.latexClean('\\frac{a+b}{c}'), '(a+b)/(c)');
    assert.strictEqual(api.latexClean('x^{2}'), 'x^(2)');
    assert.strictEqual(api.latexClean('$\\sum$'), '∑');
    assert.strictEqual(api.latexClean('a\\times b'), 'a× b'); // 替换后保留原空格
    assert.strictEqual(api.latexClean('\\lim_{x\\to0}'), 'lim(x→0)'.replace('(x→0)', '(x→0)'));
  });

  await t('renderMarkdown：标题/列表/引用/加粗/行内码', () => {
    const { api } = loadCt();
    const html = api.renderMarkdown('# 标题\n- a\n- b\n1. x\n> 引用\n**加** 和 `码`');
    assert.ok(html.includes('<h3>标题</h3>'), '标题级别应为 h3，实际: ' + html);
    assert.ok(html.includes('<ul><li>a</li><li>b</li></ul>'));
    assert.ok(html.includes('<ol><li>x</li></ol>'));
    assert.ok(html.includes('<blockquote>引用</blockquote>'));
    assert.ok(html.includes('<strong>加</strong>'));
    assert.ok(html.includes('<code>码</code>'));
  });

  await t('renderMarkdown：HTML 先转义防注入', () => {
    const { api } = loadCt();
    const html = api.renderMarkdown('<script>alert(1)</script>');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  await t('getVideoKey：解析 BV 与分 P', () => {
    const mk = (href, search) => loadCt({ href, search }).api.getVideoKey();
    assert.deepStrictEqual(mk('https://www.bilibili.com/video/BV1xx411c7mD?p=2', '?p=2'), { bvid: 'BV1xx411c7mD', page: 2 });
    assert.deepStrictEqual(mk('https://www.bilibili.com/video/BV1xx411c7mD', ''), { bvid: 'BV1xx411c7mD', page: 1 });
    assert.deepStrictEqual(mk('https://www.bilibili.com/', ''), { bvid: null, page: 1 });
  });

  console.log('== 仓库卫生 ==');

  await t('无硬编码密钥', () => {
    const re = /sk-[A-Za-z0-9]{16,}/;
    for (const f of ['background.js', 'content.js', 'options.html', 'options.js']) {
      const src = fs.readFileSync(path.join(DIR, f), 'utf8');
      assert.ok(!re.test(src), f + ' 疑似泄漏密钥');
    }
  });

  await t('firefox/chrome 共享文件一致', () => {
    for (const f of ['background.js', 'content.js', 'options.html', 'options.js']) {
      const a = fs.readFileSync(path.join(ROOT, 'bili-course-companion', f), 'utf8');
      const b = fs.readFileSync(path.join(ROOT, 'bili-course-companion-firefox', f), 'utf8');
      assert.strictEqual(a, b, f + ' 两目录不一致');
    }
  });

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  if (failed) { failures.forEach(([n, e]) => console.log(' -', n, '::', e.message)); process.exit(1); }
})();

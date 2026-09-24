// B站网课随行助手 - 后台
// 拉字幕（分P）/ 流式作答 / 缓存 / 风格与深度 / 自测题 / 术语 / 跨分P搜索

const ext = (typeof browser !== 'undefined') ? browser : chrome;

// ---------- MD5（WBI 签名用） ----------
function md5(input) {
  const s = [7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
             5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,
             4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
             6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
  const K = [];
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296);
  const msg = input;
  const bitLen = msg.length * 8;
  const withOne = msg + '\x80';
  const padLen = (56 - (withOne.length % 64) + 64) % 64;
  const total = withOne.length + padLen + 8;
  const bytes = new Uint8Array(total);
  for (let i = 0; i < withOne.length; i++) bytes[i] = withOne.charCodeAt(i) & 0xFF;
  for (let i = 0; i < 4; i++) bytes[withOne.length + padLen + i] = (bitLen >>> (8 * i)) & 0xFF;
  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  function rotl(x, c) { return (x << c) | (x >>> (32 - c)); }
  for (let i = 0; i < total; i += 64) {
    const M = [];
    for (let j = 0; j < 16; j++) {
      const off = i + j * 4;
      M[j] = (bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16) | (bytes[off + 3] << 24)) >>> 0;
    }
    let A = a0, B = b0, C = c0, D = d0;
    for (let r = 0; r < 64; r++) {
      let Fg, g;
      if (r < 16) { Fg = (B & C) | (~B & D); g = r; }
      else if (r < 32) { Fg = (D & B) | (~D & C); g = (5 * r + 1) % 16; }
      else if (r < 48) { Fg = B ^ C ^ D; g = (3 * r + 5) % 16; }
      else { Fg = C ^ (B | ~D); g = (7 * r) % 16; }
      const sum = ((A + Fg + K[r] + M[g]) >>> 0);
      const temp = (B + rotl(sum, s[r])) >>> 0;
      A = D; D = C; C = B; B = temp;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  function hex(n) { let str = ''; for (let i = 0; i < 4; i++) str += ('0' + ((n >>> (i * 8)) & 0xFF).toString(16)).slice(-2); return str; }
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

// ---------- WBI ----------
const POS = [46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
function getMixinKey(orig) { let s = ''; for (const p of POS) s += orig[p]; return s.slice(0, 32); }
function signParams(params, imgKey, subKey) {
  const mixin = getMixinKey(imgKey + subKey);
  const wts = Math.floor(Date.now() / 1000);
  const p = Object.assign({}, params, { wts });
  const qs = Object.keys(p).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(p[k])}`).join('&');
  return Object.assign({}, p, { w_rid: md5(qs + mixin) });
}
async function getWbiKeys() {
  const r = await fetch('https://api.bilibili.com/x/web-interface/nav', { credentials: 'include', headers: { 'Referer': 'https://www.bilibili.com/' } });
  const j = await r.json();
  if (!j.data || !j.data.wbi_img) throw new Error('获取 WBI 密钥失败（请确认已登录 B 站）');
  return { img: j.data.wbi_img.img_url.split('/').pop().split('.')[0], sub: j.data.wbi_img.sub_url.split('/').pop().split('.')[0] };
}
async function wbiGet(baseUrl, params, img, sub) {
  const qs = new URLSearchParams(signParams(params, img, sub)).toString();
  return fetch(`${baseUrl}?${qs}`, { credentials: 'include', headers: { 'Referer': 'https://www.bilibili.com/' } }).then(r => r.json());
}
const H = { 'Referer': 'https://www.bilibili.com/' };
function pickSub(list) {
  const withUrl = (list || []).filter(s => s && s.subtitle_url);
  return withUrl.find(s => s.lan === 'ai-zh') || withUrl.find(s => /^ai-zh/.test(s.lan))
    || withUrl.find(s => /^zh/.test(s.lan)) || withUrl[0] || null;
}
function subListOf(data) {
  return (data && data.subtitle && (data.subtitle.subtitles || data.subtitle.list)) || [];
}
async function fetchSubtitleSentences(info) {
  const url = info.subtitle_url.startsWith('//') ? 'https:' + info.subtitle_url : info.subtitle_url;
  const j = await fetch(url, { credentials: 'include', headers: H }).then(r => r.json());
  return (j.body || []).map(b => ({ from: Number(b.from) || 0, to: Number(b.to) || 0, text: (b.content || '').replace(/\n/g, ' ').trim() })).filter(s => s.text);
}

// ---------- 拉字幕（支持分P） ----------
async function getSubtitles(bvid, page) {
  const pageNo = Number(page) || 1;
  const { img, sub } = await getWbiKeys();
  const vj = await wbiGet('https://api.bilibili.com/x/web-interface/wbi/view', { bvid }, img, sub);
  if (vj.code !== 0) throw new Error('视频信息接口错误 code=' + vj.code);
  const title = (vj.data && vj.data.title) || '';
  let cid = null, partName = '';
  const pages = (vj.data && vj.data.pages) || [];
  if (pages.length) { const pg = pages.find(x => x.page === pageNo) || pages[0]; cid = pg.cid; partName = pg.part || ''; }
  if (!cid) cid = vj.data && vj.data.cid;
  if (!cid) throw new Error('未取到 cid');

  const pj = await wbiGet('https://api.bilibili.com/x/player/wbi/v2', { bvid, cid }, img, sub);
  if (pj.code !== 0) throw new Error('字幕接口错误 code=' + pj.code);
  let list = subListOf(pj.data);
  if (!list.length) list = subListOf(vj.data);
  console.warn('[随行助手] P' + pageNo + ' cid=' + cid + ' 字幕条目=' + JSON.stringify(list));
  const info = pickSub(list);
  if (!info) throw new Error('该视频没有可用字幕（需登录 B 站；或换一个有字幕/AI 字幕的视频）');
  const sentences = await fetchSubtitleSentences(info);
  if (!sentences.length) throw new Error('字幕内容为空');
  return { title, partName, page: pageNo, sentences, lan: info.lan, pages: pages.map(p => ({ page: p.page, part: p.part || '' })) };
}

// ---------- 跨分P全课搜索 ----------
async function searchAll(bvid, keyword) {
  const kw = String(keyword || '').trim();
  if (!kw) throw new Error('请先输入关键词');
  const { img, sub } = await getWbiKeys();
  const vj = await wbiGet('https://api.bilibili.com/x/web-interface/wbi/view', { bvid }, img, sub);
  if (vj.code !== 0) throw new Error('视频信息接口错误 code=' + vj.code);
  const pages = (vj.data && vj.data.pages) || [];
  const matches = [];
  for (const pg of pages.slice(0, 20)) {
    try {
      const pj = await wbiGet('https://api.bilibili.com/x/player/wbi/v2', { bvid, cid: pg.cid }, img, sub);
      const info = pickSub(subListOf(pj.data));
      if (!info) continue;
      const ss = await fetchSubtitleSentences(info);
      ss.forEach(s => { if (s.text.includes(kw)) matches.push({ page: pg.page, part: pg.part || '', from: s.from, text: s.text }); });
    } catch (e) { /* 该分P取不到就跳过 */ }
    if (matches.length > 80) break;
  }
  return { keyword: kw, totalPages: pages.length, matches: matches.slice(0, 80) };
}

// ---------- 设置 ----------
const DEFAULT_BASE = 'https://myai.bupt.edu.cn/llm-gw/v1';
// 出于安全考虑不内置任何 Key：请在插件设置页（或选项页）填入你自己的网关 Key
const DEFAULT_KEY = '';
const DEFAULT_MODEL = 'deepseek-v4-flash';
async function getSettings() {
  const d = await ext.storage.local.get(['baseUrl', 'apiKey', 'model', 'style', 'depth']);
  return {
    baseUrl: d.baseUrl || DEFAULT_BASE, apiKey: d.apiKey || DEFAULT_KEY,
    model: d.model || DEFAULT_MODEL, style: d.style || 'plain', depth: d.depth || 'normal'
  };
}

// ---------- 网关调用 ----------
function endpoint(s) { return s.baseUrl.replace(/\/+$/, '') + '/chat/completions'; }
function headers(s) { return { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey }; }
function buildMessages(userPrompt, history) {
  const msgs = [];
  if (history && history.length) {
    history.slice(-6).forEach(h => { msgs.push({ role: 'user', content: h.q }); msgs.push({ role: 'assistant', content: h.a }); });
  }
  msgs.push({ role: 'user', content: userPrompt });
  return msgs;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
// 北邮网关 deepseek-v4-flash 默认 max_tokens 虚标到 ~39 万，prompt + 默认上限超过上游 262144 限制会直接 500。
// 这里显式夹到 65536；并对 5xx/网络错误做最多 3 次重试。
async function callLLM(messages, s, tries = 3) {
  if (!s.apiKey) throw new Error('尚未配置 API Key：请点侧栏 ⚙（或扩展选项页）填入你自己的网关 Key');
  let lastMsg = '';
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(endpoint(s), { method: 'POST', headers: headers(s), body: JSON.stringify({ model: s.model, messages, temperature: 0.7, max_tokens: 65536, stream: false }) });
      const j = await res.json().catch(() => ({}));
      if (j.error) {
        lastMsg = (j.error.message) || JSON.stringify(j.error);
        if (res.status >= 500 && i < tries - 1) { await sleep(700 * (i + 1)); continue; }
        throw new Error(lastMsg);
      }
      return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '（未返回内容）';
    } catch (e) {
      const msg = (e && e.message) || String(e);
      const transient = (e && e.name === 'TypeError') || msg.includes('InternalServerError') || msg.includes('Failed to fetch') || msg.includes('network');
      if (i < tries - 1 && transient) { lastMsg = msg; await sleep(700 * (i + 1)); continue; }
      throw e;
    }
  }
  throw new Error(lastMsg || '网关请求失败');
}

// ---------- 提示词 ----------
const OUTPUT_RULES = `\n\n【输出格式要求·重要】\n` +
  `- 用中文。可用 Markdown 组织：## 标题、- 列表、**加粗**。\n` +
  `- 严禁 LaTeX：不要写 \\( \\)、\\[ \\]、$...$、\\varepsilon、\\frac{}{} 这类命令，页面不会渲染它们，只会原样显示成乱码。\n` +
  `- 数学一律用 Unicode 符号直接写：ε δ → ≠ ≤ ≥ ∞ ∑ ∫ √ × ≤；分数写成 "ε/2"；下标写成 x₀ 或 x_0；极限写成 lim(x→a) f(x) = L。\n` +
  `- 不要输出多余的前缀/后缀客套话。`;

const STYLE_MAP = {
  plain: '用大白话和生活化的类比讲，少堆术语，让零基础也能听懂',
  exam: '按应试思路讲：先给考点，再给常见题型与解题套路，最后点易错点',
  strict: '按严谨的数学/专业课方式讲：给出严格表述、前提假设与必要推导'
};
const DEPTH_MAP = {
  short: '篇幅控制在 150 字以内，只讲最关键的一点，不要展开',
  normal: '中等篇幅，讲清原理并配一个具体例子',
  deep: '详尽深入：原理、推导、例子、常见误区、与前后知识的关联都要有'
};

function enrichPrompt(question, selectedText) {
  return `你是网课学习助手。用户正在看网课，并从课程字幕里选中了下面这段话，同时提出了一个可能很简略的问题。\n` +
    `请把这个原始问题"丰富"成一个更清晰、更具体、更容易得到高质量回答的问题：\n` +
    `- 补全必要背景与术语，明确用户真正想搞懂的点；\n` +
    `- 如果原文里有关键概念，把它点出来；\n` +
    `- 只输出丰富后的问题本身，不要前缀、不要解释、不要加引号。\n\n` +
    `课程原文（用户选中的字幕）：\n${selectedText}\n\n` +
    `用户原始问题：${(question && question.trim()) ? question.trim() : '（用户没有额外提问，请就这段原文提出最值得讲解的那个问题）'}` + OUTPUT_RULES;
}

function answerPrompt(enriched, selectedText, style, depth) {
  const st = STYLE_MAP[style] || STYLE_MAP.plain;
  const dp = DEPTH_MAP[depth] || DEPTH_MAP.normal;
  return `你是一位严谨的网课助教。请针对下面这个问题（结合课程原文理解题意，若问题简略就自行判断其真实意图），给出真正有用的细致讲解：\n` +
    `1）先点明它属于什么知识点/概念；\n` +
    `2）用通俗语言配合具体例子把原理讲透；\n` +
    `3）指出初学者常见误区或易混淆之处；\n` +
    `4）若涉及前后关联，简要说明它在整门课里的位置。\n` +
    `只讲与问题直接相关的内容，不要发散。\n\n` +
    `【讲解风格】${st}\n【篇幅要求】${dp}\n\n` +
    `课程原文（用户选中的字幕）：\n${selectedText}\n\n问题：${enriched}` + OUTPUT_RULES;
}

function quizPrompt(selectedText) {
  return `你是网课助教。请就下面这段课程原文所讲的知识点，出 2-3 道自测题，用来检验学习者是否真的理解了。\n` +
    `要求：题型可以混合（概念辨析 / 简单计算或推导 / 判断题）；每题后面紧跟"答案与解析"。\n` +
    `只围绕这段原文的知识点出题，不要超纲。\n\n课程原文：\n${selectedText}` + OUTPUT_RULES;
}

function termsPrompt(text) {
  const body = String(text || '').slice(0, 6000);
  return `下面是一段网课字幕。请从中提取这门课的**关键术语/概念名词**（8-15 个），用于给学习者做术语表。\n` +
    `要求：只输出一个 JSON 数组，例如 ["梯度下降","学习率","过拟合"]；不要任何解释文字；\n` +
    `术语要是这门课真正的专业概念，不要普通词汇；按在文中出现顺序排列。\n\n字幕：\n${body}`;
}
function quizUptoPrompt(text, uptoTime) {
  const body = String(text || '').slice(0, 12000);
  const t = Math.floor(uptoTime / 60) + ':' + String(Math.floor(uptoTime % 60)).padStart(2, '0');
  return `你是网课助教。下面是一段网课从开头到当前播放位置（约 ${t}）的【全部字幕原文】。\n` +
    `请基于这些字幕里出现的【所有知识点】出一套自测题，检验学习者是否掌握了到目前为止讲过的内容：\n` +
    `要求：\n` +
    `1）覆盖要广，尽量涵盖这段字幕里出现的各个主要知识点（建议 6-10 道，按重要性取舍）；\n` +
    `2）题型可混合：概念辨析 / 简单计算或推导 / 判断正误 / 简答；\n` +
    `3）每题后紧跟"答案与解析"，解析要结合本段字幕内容，不要泛泛而谈；\n` +
    `4）用中文，可用 Markdown 组织（## 标题、- 列表、**加粗**）。\n` +
    `只围绕这段字幕里的知识点出题，不要超纲、不要出字幕里没出现的内容。\n\n字幕原文：\n${body}` + OUTPUT_RULES;
}

function outlinePrompt(sentences) {
  const lines = sentences.map((s, i) => `${i + 1}. ${s.text}`).join('\n');
  return `以下是某节网课的字幕全文（已按时间顺序分句）。请提炼本节课涉及的若干核心知识点，按出现顺序列出，` +
    `每条给出一句话定义和"为什么重要"。用中文，条列，控制在 15 条以内。\n\n${lines}` + OUTPUT_RULES;
}

// ---------- 讲解结果缓存（内存，重启浏览器即失效） ----------
const ansCache = new Map();
function cacheKey(o) { return [o.style, o.depth, o.enriched, o.selectedText, JSON.stringify(o.history || [])].join(''); }

// ---------- 消息路由 ----------
if (ext && ext.runtime && ext.runtime.onMessage) {
  ext.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    const fail = e => sendResponse({ error: String(e && e.message ? e.message : e) });

    if (msg.type === 'getSubtitles') {
      getSubtitles(msg.bvid, msg.page).then(r => sendResponse(r)).catch(fail); return true;
    }
    if (msg.type === 'searchAll') {
      searchAll(msg.bvid, msg.keyword).then(r => sendResponse(r)).catch(fail); return true;
    }
    if (msg.type === 'enrich') {
      getSettings().then(s => callLLM(buildMessages(enrichPrompt(msg.question, msg.selectedText)), s))
        .then(enriched => sendResponse({ enriched })).catch(fail); return true;
    }
    if (msg.type === 'answer') {
      getSettings().then(async s => {
        const key = cacheKey({ style: s.style, depth: s.depth, enriched: msg.enriched, selectedText: msg.selectedText, history: msg.history });
        if (ansCache.has(key)) return { text: ansCache.get(key), cached: true };
        const text = await callLLM(buildMessages(answerPrompt(msg.enriched, msg.selectedText, s.style, s.depth), msg.history), s);
        ansCache.set(key, text);
        return { text, cached: false };
      }).then(r => sendResponse(r)).catch(fail);
      return true;
    }
    if (msg.type === 'cacheCheck') {
      getSettings().then(s => {
        const key = cacheKey({ style: s.style, depth: s.depth, enriched: msg.enriched, selectedText: msg.selectedText, history: msg.history });
        sendResponse(ansCache.has(key) ? { hit: true, text: ansCache.get(key) } : { hit: false });
      }).catch(fail);
      return true;
    }
    if (msg.type === 'quiz') {
      getSettings().then(s => callLLM(buildMessages(quizPrompt(msg.selectedText)), s))
        .then(text => sendResponse({ text })).catch(fail); return true;
    }
    if (msg.type === 'quizUpto') {
      getSettings().then(s => callLLM(buildMessages(quizUptoPrompt(msg.text, msg.uptoTime)), s))
        .then(text => sendResponse({ text })).catch(fail); return true;
    }
    if (msg.type === 'terms') {
      getSettings().then(async s => {
        const raw = await callLLM(buildMessages(termsPrompt(msg.text)), s);
        let arr = [];
        try { arr = JSON.parse(raw); }
        catch (e) {
          const m = raw.match(/\[[\s\S]*\]/);
          if (m) { try { arr = JSON.parse(m[0]); } catch (e2) { arr = []; } }
          if (!arr.length) arr = raw.split(/[\n,，、]/).map(x => x.replace(/^[-\d.\s"']+/, '').replace(/["'\]]/g, '').trim()).filter(Boolean);
        }
        return { terms: arr.filter(Boolean).slice(0, 20) };
      }).then(r => sendResponse(r)).catch(fail);
      return true;
    }
    if (msg.type === 'outline') {
      getSettings().then(s => callLLM(buildMessages(outlinePrompt(msg.sentences)), s))
        .then(text => sendResponse({ text })).catch(fail); return true;
    }
  });
}

// ---------- 流式作答（port 长连接） ----------
if (ext && ext.runtime && ext.runtime.onConnect) {
  ext.runtime.onConnect.addListener(port => {
    if (port.name !== 'stream') return;
    port.onMessage.addListener(async (msg) => {
      if (msg.type !== 'answerStream') return;
      try {
        const s = await getSettings();
        if (!s.apiKey) throw new Error('尚未配置 API Key：请点侧栏 ⚙（或扩展选项页）填入你自己的网关 Key');
        const url = endpoint(s);
        const res = await fetch(url, {
          method: 'POST', headers: headers(s),
          body: JSON.stringify({
            model: s.model,
            messages: buildMessages(answerPrompt(msg.enriched, msg.selectedText, s.style, s.depth), msg.history),
            temperature: 0.7, max_tokens: 65536, stream: true
          })
        });
        if (!res.ok) {
          const ej = await res.json().catch(() => ({}));
          throw new Error((ej.error && (ej.error.message || JSON.stringify(ej.error))) || ('网关返回 ' + res.status));
        }
        if (!res.body) throw new Error('网关不支持流式');
        const reader = res.body.getReader();
        const dec = new TextDecoder('utf-8');
        let buf = '', full = '';
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split('\n');
          buf = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const d = t.slice(5).trim();
            if (!d || d === '[DONE]') continue;
            try {
              const j = JSON.parse(d);
              const delta = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
              if (delta) { full += delta; port.postMessage({ type: 'chunk', delta }); }
            } catch (e) { /* 忽略非 JSON 行 */ }
          }
        }
        // 流式完成后写入缓存，下次同样的问题直接命中
        if (full) {
          try {
            const s2 = await getSettings();
            ansCache.set(cacheKey({ style: s2.style, depth: s2.depth, enriched: msg.enriched, selectedText: msg.selectedText, history: msg.history }), full);
          } catch (e) { /* 忽略 */ }
        }
        port.postMessage({ type: 'done', full });
      } catch (e) {
        port.postMessage({ type: 'error', error: String(e && e.message ? e.message : e) });
      }
    });
  });
}

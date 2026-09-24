// B站网课随行助手 - 内容脚本
// 字幕跟随 / 拖选提问 / 流式作答 / 缓存与历史 / 风格深度 / 自测题 / 术语表 / 本集与全课搜索 / 笔记与字幕导出 / 标记本
(function () {
  if (document.getElementById('bili-companion-root')) return;
  const ext = (typeof browser !== 'undefined') ? browser : chrome;

  async function sendMsg(msg, retries = 2) {
    let lastErr;
    for (let i = 0; i <= retries; i++) {
      try { return await ext.runtime.sendMessage(msg); }
      catch (e) { lastErr = e; await new Promise(r => setTimeout(r, 400)); }
    }
    throw lastErr;
  }
  const store = {
    get: k => ext.storage.local.get(k),
    set: o => ext.storage.local.set(o)
  };

  const root = document.createElement('div');
  root.id = 'bili-companion-root';
  document.body.appendChild(root);

  const cssEl = document.createElement('style');
  cssEl.textContent = `
  #bili-companion-root * { box-sizing: border-box; font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  #bili-companion-root {
    position: fixed; top: 0; right: 0; width: 400px; height: 100vh; z-index: 999999;
    background: #fff; color: #222; border-left: 1px solid #e3e5e7; display: flex; flex-direction: column;
    box-shadow: -4px 0 16px rgba(0,0,0,.08); font-size: 14px;
  }
  #bili-companion-root.collapsed { width: 44px; }
  #bili-companion-root.collapsed .bc-body,
  #bili-companion-root.collapsed .bc-head-title,
  #bili-companion-root.collapsed #bc-settings-btn,
  #bili-companion-root.collapsed #bc-outline-btn { display: none; }
  #bili-companion-root.collapsed .bc-head { justify-content: center; padding: 8px 4px; }
  #bili-companion-root.collapsed #bc-collapse-btn { width: 34px; text-align: center; font-size: 15px; }
  .bc-head { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid #e3e5e7; background: #f6f7f8; }
  .bc-head-title { font-weight: 600; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .bc-btn { cursor: pointer; border: 1px solid #e3e5e7; background: #fff; border-radius: 6px; padding: 4px 8px; font-size: 12px; }
  .bc-btn:hover { background: #eef0f1; }
  .bc-btn.primary { background: #00a1d6; color: #fff; border-color: #00a1d6; }
  .bc-btn.on { background: #e6f7ff; color: #00a1d6; border-color: #00a1d6; font-weight: 600; }
  .bc-body { flex: 1; display: flex; flex-direction: column; overflow: hidden; position: relative; }
  .bc-bar { display: flex; gap: 5px; padding: 6px 10px; border-bottom: 1px solid #f0f1f2; align-items: center; flex-wrap: wrap; }
  .bc-bar.hide { display: none; }
  .bc-bar input, .bc-bar select { font-size: 12px; padding: 4px 6px; border: 1px solid #e3e5e7; border-radius: 6px; }
  .bc-bar input { flex: 1; min-width: 110px; }
  .bc-transcript { flex: 1; overflow-y: auto; padding: 6px 0; min-height: 100px; }
  .bc-row { display: flex; gap: 8px; padding: 6px 10px; cursor: pointer; border-left: 3px solid transparent; }
  .bc-row:hover { background: #f3f5f7; }
  .bc-row.active { background: #e7f3ff; border-left-color: #00a1d6; }
  .bc-row .bc-t { color: #00a1d6; font-variant-numeric: tabular-nums; flex: 0 0 44px; user-select: none; }
  .bc-row .bc-txt { flex: 1; line-height: 1.5; }
  .bc-row mark { background: #ffe9a8; padding: 0 1px; border-radius: 2px; }
  .bc-row mark.bc-term { background: #d9f0ff; cursor: help; border-bottom: 1px dashed #00a1d6; }
  .bc-ask { border-top: 1px solid #e3e5e7; padding: 8px 10px; display: flex; flex-direction: column; gap: 6px; background: #fafbfc; }
  .bc-sel { font-size: 12px; color: #666; background: #fff8e6; border: 1px dashed #e0c98a; border-radius: 6px; padding: 5px 7px; max-height: 54px; overflow: hidden; line-height: 1.4; }
  .bc-ask input { padding: 6px 8px; border: 1px solid #e3e5e7; border-radius: 6px; font-size: 13px; width: 100%; }
  .bc-row-btn { display: flex; gap: 5px; flex-wrap: wrap; }
  .bc-foot { display: flex; gap: 5px; padding: 6px 10px; border-top: 1px solid #f0f1f2; flex-wrap: wrap; background: #fafbfc; }
  .bc-detail { border-top: 1px solid #e3e5e7; max-height: 44%; overflow-y: auto; padding: 10px; background: #fff; }
  .bc-detail h4 { margin: 0 0 6px; font-size: 13px; color: #00a1d6; }
  .bc-src { color: #888; font-size: 12px; margin-bottom: 8px; line-height: 1.5; max-height: 60px; overflow: auto; }
  .bc-enriched { background: #eef7ff; border-left: 3px solid #00a1d6; border-radius: 4px; padding: 7px 9px; font-size: 13px; line-height: 1.5; margin-bottom: 8px; white-space: pre-wrap; }
  .bc-enriched .bc-tag { display: block; font-size: 11px; color: #00a1d6; margin-bottom: 3px; }
  .bc-text { line-height: 1.7; font-size: 13.5px; }
  .bc-text h3, .bc-text h4, .bc-text h5 { margin: 12px 0 6px; font-size: 14px; color: #222; }
  .bc-text h3 { font-size: 15px; border-left: 3px solid #00a1d6; padding-left: 7px; }
  .bc-text p { margin: 0 0 8px; }
  .bc-text ul, .bc-text ol { margin: 0 0 8px; padding-left: 20px; }
  .bc-text li { margin: 3px 0; }
  .bc-text blockquote { margin: 6px 0; padding: 6px 9px; background: #f6f7f8; border-left: 3px solid #ccc; color: #555; }
  .bc-text code { background: #f2f4f5; padding: 1px 4px; border-radius: 3px; font-family: Consolas, Menlo, monospace; font-size: 12.5px; }
  .bc-text strong { color: #111; }
  .bc-text hr { border: 0; border-top: 1px solid #e3e5e7; margin: 10px 0; }
  .bc-list { display: flex; flex-direction: column; gap: 6px; }
  .bc-item { border: 1px solid #e3e5e7; border-radius: 6px; padding: 6px 8px; cursor: pointer; font-size: 12.5px; line-height: 1.5; background: #fff; }
  .bc-item:hover { background: #f3f5f7; }
  .bc-item .bc-meta { color: #999; font-size: 11px; display: block; margin-bottom: 2px; }
  .bc-status { font-size: 12px; color: #888; padding: 6px 10px; }
  .bc-status.error { color: #d23; }
  .bc-settings { padding: 14px; display: none; flex-direction: column; gap: 8px; background: #f6f7f8; position: absolute; inset: 0; z-index: 20; overflow-y: auto; box-shadow: -2px 0 10px rgba(0,0,0,.12); }
  .bc-settings.show { display: flex; }
  .bc-settings label { font-size: 12px; color: #555; }
  .bc-settings input { padding: 6px; border: 1px solid #e3e5e7; border-radius: 6px; font-size: 13px; }
  `;
  document.head.appendChild(cssEl);

  root.innerHTML = `
    <div class="bc-head">
      <div class="bc-head-title">LecturePilot</div>
      <span class="bc-btn" id="bc-search-toggle" title="搜索栏 显隐">🔍</span>
      <span class="bc-btn" id="bc-settings-btn" title="设置">⚙</span>
      <span class="bc-btn" id="bc-outline-btn" title="整章梳理">梳理</span>
      <span class="bc-btn" id="bc-collapse-btn" title="收起/展开">⟩</span>
    </div>
    <div class="bc-body">
      <div class="bc-status" id="bc-status">正在加载字幕…</div>
      <div class="bc-bar">
        <input id="bc-search" placeholder="搜本集字幕（回车跳下一处）" />
        <select id="bc-style"><option value="plain">通俗</option><option value="exam">应试</option><option value="strict">严谨</option></select>
        <select id="bc-depth"><option value="short">简短</option><option value="normal">标准</option><option value="deep">深入</option></select>
      </div>
      <div class="bc-transcript" id="bc-transcript"></div>
      <div class="bc-ask">
        <div class="bc-sel" id="bc-sel">未选中内容（在上方字幕里拖选任意文字，可跨句）</div>
        <input id="bc-q" placeholder="你的问题（可留空；回车提交）" />
        <div class="bc-row-btn">
          <span class="bc-btn primary" id="bc-ask-btn">提问</span>
          <span class="bc-btn" id="bc-enrich-btn" title="开启后先让 AI 把问题变清楚，再作答">丰富：关</span>
          <span class="bc-btn" id="bc-quiz-btn">自测题</span>
          <span class="bc-btn" id="bc-mark-btn">标记不懂</span>
          <span class="bc-btn" id="bc-clear-btn">清空</span>
        </div>
      </div>
      <div class="bc-detail" id="bc-detail" style="display:none;">
        <h4 id="bc-detail-title">讲解</h4>
        <div class="bc-src" id="bc-detail-src"></div>
        <div class="bc-enriched" id="bc-enriched" style="display:none;"><span class="bc-tag">AI 丰富后的问题</span><span id="bc-enriched-text"></span></div>
        <div class="bc-text" id="bc-detail-text"></div>
      </div>
      <div class="bc-foot">
        <span class="bc-btn" id="bc-hist-btn">历史</span>
        <span class="bc-btn" id="bc-marks-btn">标记本</span>
        <span class="bc-btn" id="bc-terms-btn">术语表</span>
        <span class="bc-btn" id="bc-allsearch-btn">全课搜索</span>
        <span class="bc-btn" id="bc-savenote-btn">存笔记</span>
        <span class="bc-btn" id="bc-exportnote-btn">导出笔记</span>
        <span class="bc-btn" id="bc-exportsub-btn">导出字幕</span>
      </div>
      <div class="bc-settings" id="bc-settings">
        <label>网关地址 (base_url)</label>
        <input id="bc-base" value="https://myai.bupt.edu.cn/llm-gw/v1" />
        <label>API Key</label>
        <input id="bc-key" type="password" placeholder="粘贴你自己的网关 Key" />
        <label>模型名</label>
        <input id="bc-model" value="deepseek-v4-flash" />
        <span class="bc-btn" id="bc-save" style="align-self:flex-start;">保存</span>
        <span class="bc-status" style="padding:0;">配置保存在本机浏览器，不会上传。</span>
      </div>
    </div>
  `;

  const $ = id => document.getElementById(id);
  const statusEl = $('bc-status'), transcriptEl = $('bc-transcript'), detailEl = $('bc-detail');
  const detailTitle = $('bc-detail-title'), detailSrc = $('bc-detail-src');
  const enrichedEl = $('bc-enriched'), enrichedText = $('bc-enriched-text'), detailText = $('bc-detail-text');
  const selEl = $('bc-sel'), qInput = $('bc-q'), searchInput = $('bc-search'), barEl = $('bc-bar');
  const styleSel = $('bc-style'), depthSel = $('bc-depth'), settingsEl = $('bc-settings');

  let sentences = [], activeIdx = -1, selectedText = '';
  let enrichOn = false, style = 'plain', depth = 'normal';
  let searchKw = '', searchHits = [], searchPos = 0;
  let terms = [];
  let history = [], marks = [], notes = [];
  let conv = [], convKey = '';           // 多轮追问上下文
  let currentQA = null;                  // 当前讲解（用于存笔记）
  let meta = { bvid: '', page: 1, title: '', partName: '' };

  // ---------- 工具 ----------
  function fmtTime(sec) { const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s; }
  function srtTime(sec) { const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60), ms = Math.floor((sec % 1) * 1000); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`; }
  function getVideo() { return document.querySelector('.bpx-player-video-wrap video') || document.querySelector('.bilibili-player-video video') || document.querySelector('video'); }
  function getVideoKey() {
    const m = location.href.match(/\/video\/(BV\w+)/);
    const pm = location.search.match(/[?&]p=(\d+)/);
    return { bvid: m ? m[1] : null, page: pm ? Number(pm[1]) : 1 };
  }
  function download(name, text, mime) {
    const blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function escHtml(t) { return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  // 兜底：残留 LaTeX 转 Unicode
  function latexClean(text) {
    let s = String(text || '');
    const map = {
      '\\varepsilon': 'ε', '\\epsilon': 'ε', '\\delta': 'δ', '\\Delta': 'Δ', '\\alpha': 'α', '\\beta': 'β',
      '\\gamma': 'γ', '\\theta': 'θ', '\\lambda': 'λ', '\\mu': 'μ', '\\pi': 'π', '\\sigma': 'σ', '\\omega': 'ω',
      '\\varphi': 'φ', '\\phi': 'φ', '\\psi': 'ψ', '\\to': '→', '\\rightarrow': '→', '\\Rightarrow': '⇒',
      '\\leftarrow': '←', '\\ne': '≠', '\\neq': '≠', '\\le': '≤', '\\leq': '≤', '\\ge': '≥', '\\geq': '≥',
      '\\infty': '∞', '\\sum': '∑', '\\int': '∫', '\\sqrt': '√', '\\times': '×', '\\cdot': '·', '\\pm': '±',
      '\\approx': '≈', '\\equiv': '≡', '\\in': '∈', '\\notin': '∉', '\\subset': '⊂', '\\forall': '∀',
      '\\exists': '∃', '\\partial': '∂', '\\lim': 'lim', '\\sin': 'sin', '\\cos': 'cos', '\\tan': 'tan',
      '\\ln': 'ln', '\\log': 'log', '\\max': 'max', '\\min': 'min'
    };
    for (const k in map) s = s.split(k).join(map[k]);
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
    s = s.replace(/\\frac(\w)\{(\w)\}/g, '$1/$2');
    s = s.replace(/\\\(|\\\)|\\\[|\\\]|\\\{|\\\}/g, '');
    s = s.replace(/\{([^{}]*)\}/g, '($1)');
    s = s.replace(/_\{([^{}]*)\}/g, '($1)');
    s = s.replace(/\^\{([^{}]*)\}/g, '^($1)');
    s = s.replace(/\^(\d)/g, (m, d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(d)]);
    s = s.replace(/\$\$/g, '').replace(/\$/g, '');
    s = s.replace(/\\([a-zA-Z]+)/g, '$1');
    return s;
  }
  function mdInline(t) {
    let s = escHtml(t);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    return s;
  }
  function renderMarkdown(raw) {
    const lines = latexClean(raw).split('\n');
    let html = '', inList = false, listType = '';
    const closeList = () => { if (inList) { html += (listType === 'ol' ? '</ol>' : '</ul>'); inList = false; } };
    for (let line of lines) {
      const t = line.trim();
      if (!t) { closeList(); continue; }
      if (/^-{3,}$/.test(t)) { closeList(); html += '<hr/>'; continue; }
      let m;
      if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { closeList(); const lv = Math.min(Number(m[1].length) + 2, 5); html += `<h${lv}>${mdInline(m[2])}</h${lv}>`; continue; }
      if ((m = t.match(/^>\s?(.*)$/))) { closeList(); html += `<blockquote>${mdInline(m[1])}</blockquote>`; continue; }
      if ((m = t.match(/^[-*]\s+(.*)$/))) { if (!inList || listType !== 'ul') { closeList(); html += '<ul>'; inList = true; listType = 'ul'; } html += `<li>${mdInline(m[1])}</li>`; continue; }
      if ((m = t.match(/^\d+[.、)]\s+(.*)$/))) { if (!inList || listType !== 'ol') { closeList(); html += '<ol>'; inList = true; listType = 'ol'; } html += `<li>${mdInline(m[1])}</li>`; continue; }
      closeList(); html += `<p>${mdInline(t)}</p>`;
    }
    closeList();
    return html;
  }

  // ---------- 字幕渲染 ----------
  function rowHtml(text) {
    let s = escHtml(text);
    if (searchKw) {
      s = s.replace(new RegExp(escRe(escHtml(searchKw)), 'g'), m => '<mark>' + m + '</mark>');
    } else if (terms.length) {
      terms.forEach(t => {
        const tt = escHtml(t);
        if (tt.length < 2) return;
        s = s.replace(new RegExp(escRe(tt), 'g'), m => '<mark class="bc-term" data-term="' + escHtml(t) + '">' + m + '</mark>');
      });
    }
    return s;
  }
  function visibleSentences() {
    if (!searchKw) return sentences.map((s, i) => ({ s, i }));
    const kw = searchKw.toLowerCase();
    return sentences.map((s, i) => ({ s, i })).filter(o => o.s.text.toLowerCase().includes(kw));
  }
  function renderTranscript() {
    const vis = visibleSentences();
    transcriptEl.innerHTML = '';
    searchHits = vis.map(o => o.i);
    vis.forEach(o => {
      const row = document.createElement('div');
      row.className = 'bc-row'; row.dataset.idx = o.i;
      row.innerHTML = `<span class="bc-t" title="跳到此处">▶ ${fmtTime(o.s.from)}</span><span class="bc-txt">${rowHtml(o.s.text)}</span>`;
      transcriptEl.appendChild(row);
    });
    if (searchKw) statusEl.textContent = `匹配 ${vis.length} 句（关键词：${searchKw}）`;
  }
  function findAndActivate(idx) {
    const el = transcriptEl.querySelector(`.bc-row[data-idx="${idx}"]`);
    if (el) { el.classList.add('active'); el.scrollIntoView({ block: 'center' }); }
  }
  function setActive(idx) {
    if (idx === activeIdx) return;
    const prev = transcriptEl.querySelector('.bc-row.active');
    if (prev) prev.classList.remove('active');
    activeIdx = idx;
    if (idx >= 0) findAndActivate(idx);
  }

  // ---------- 跟随 / 换集 ----------
  setInterval(() => {
    if (!sentences.length) return;
    const v = getVideo(); if (!v) return;
    const t = v.currentTime;
    let idx = -1;
    for (let i = 0; i < sentences.length; i++) if (t >= sentences[i].from && t < sentences[i].to) { idx = i; break; }
    if (idx === -1 && t >= sentences[sentences.length - 1].from) idx = sentences.length - 1;
    if (idx >= 0) setActive(idx);
  }, 400);

  let lastKey = '';
  setInterval(() => {
    const k = getVideoKey(); if (!k.bvid) return;
    const key = k.bvid + '#' + k.page;
    if (lastKey && key !== lastKey) {
      sentences = []; activeIdx = -1; selectedText = ''; terms = []; conv = []; convKey = '';
      selEl.textContent = '未选中内容（在上方字幕里拖选任意文字，可跨句）';
      load();
    }
    lastKey = key;
  }, 1000);

  // ---------- 交互 ----------
  transcriptEl.addEventListener('click', e => {
    const termEl = e.target.closest('.bc-term');
    if (termEl) {
      const term = termEl.getAttribute('data-term');
      const row = termEl.closest('.bc-row');
      const s = row ? sentences[Number(row.dataset.idx)] : null;
      selectText(s ? s.text : term);
      ask(s ? s.text : term, `请解释术语「${term}」`);
      return;
    }
    const row = e.target.closest('.bc-row');
    if (!row) return;
    const s = sentences[Number(row.dataset.idx)];
    if (e.target.closest('.bc-t')) { const v = getVideo(); if (v) v.currentTime = s.from; return; }
    const sel = String(window.getSelection() || '').trim();
    ask((sel && sel.length > 1) ? sel : s.text, '');
  });
  transcriptEl.addEventListener('mouseup', () => {
    const sel = String(window.getSelection() || '').trim();
    if (sel) selectText(sel);
  });
  function selectText(t) {
    selectedText = t;
    selEl.textContent = '已选中：' + (t.length > 80 ? t.slice(0, 80) + '…' : t);
  }
  function updateEnrichBtn() {
    const b = $('bc-enrich-btn');
    b.textContent = '丰富：' + (enrichOn ? '开' : '关');
    b.classList.toggle('on', enrichOn);
  }

  // ---------- 流式作答 ----------
  function streamAnswer(enriched, text, hist) {
    return new Promise(resolve => {
      let port;
      try { port = ext.runtime.connect({ name: 'stream' }); }
      catch (e) { resolve({ fallback: true }); return; }
      let acc = '', got = false, settled = false;
      const finish = r => { if (settled) return; settled = true; clearTimeout(timer); try { port.disconnect(); } catch (e) { } resolve(r); };
      const timer = setTimeout(() => finish(got ? { text: acc } : { fallback: true }), 20000);
      port.onMessage.addListener(m => {
        if (m.type === 'chunk') { got = true; acc += m.delta; detailText.textContent = latexClean(acc); }
        else if (m.type === 'done') finish({ text: m.full || acc });
        else if (m.type === 'error') finish(got ? { text: acc } : { fallback: true, error: m.error });
      });
      port.onDisconnect.addListener(() => finish(got ? { text: acc } : { fallback: true }));
      port.postMessage({ type: 'answerStream', enriched, selectedText: text, style, depth, history: hist });
    });
  }

  async function ask(text, question) {
    detailEl.style.display = 'block';
    detailSrc.textContent = '原文：' + text;
    enrichedEl.style.display = 'none';
    detailText.textContent = '';
    // 多轮追问：换了一段原文就开新话题
    if (convKey !== text) { conv = []; convKey = text; }
    try {
      let effQ;
      if (enrichOn) {
        detailTitle.textContent = '① AI 正在丰富你的问题…';
        const e = await sendMsg({ type: 'enrich', question: question, selectedText: text });
        if (e.error) { detailTitle.textContent = '出错了'; detailText.textContent = e.error; return; }
        enrichedText.textContent = latexClean(e.enriched);
        enrichedEl.style.display = 'block';
        effQ = e.enriched;
      } else {
        effQ = (question && question.trim()) ? question.trim() : '请就这段原文讲清楚它涉及的知识点';
      }
      // 缓存命中直接出
      const c = await sendMsg({ type: 'cacheCheck', enriched: effQ, selectedText: text, history: conv });
      if (c && c.hit) {
        detailTitle.textContent = '讲解（缓存）';
        detailText.innerHTML = renderMarkdown(c.text);
        finishQA(text, effQ, c.text, question);
        return;
      }
      detailTitle.textContent = enrichOn ? '② 正在作答…' : '正在作答…';
      const r = await streamAnswer(effQ, text, conv);
      let out = r && r.text;
      if (!out) {
        const a = await sendMsg({ type: 'answer', enriched: effQ, selectedText: text, history: conv });
        if (a.error) { detailTitle.textContent = '出错了'; detailText.textContent = a.error; return; }
        out = a.text;
      }
      detailTitle.textContent = '讲解';
      detailText.innerHTML = renderMarkdown(out);
      finishQA(text, effQ, out, question);
    } catch (err) {
      detailTitle.textContent = '出错了'; detailText.textContent = String(err);
    }
  }
  function finishQA(text, effQ, answer, rawQ) {
    conv.push({ q: effQ, a: answer.slice(0, 1500) });
    if (conv.length > 8) conv.shift();
    currentQA = { sel: text, q: rawQ || effQ, a: answer, ts: Date.now() };
    pushHistory(currentQA);
  }

  // ---------- 历史 / 标记 / 笔记 ----------
  async function pushHistory(qa) {
    history.unshift(qa);
    if (history.length > 50) history = history.slice(0, 50);
    try { await store.set({ bcHistory: history }); } catch (e) { }
  }
  function showList(title, items, onPick) {
    detailEl.style.display = 'block';
    enrichedEl.style.display = 'none';
    detailTitle.textContent = title;
    detailSrc.textContent = '';
    detailText.innerHTML = '';
    const box = document.createElement('div');
    box.className = 'bc-list';
    if (!items.length) { detailText.textContent = '（暂无记录）'; return; }
    items.forEach((it, i) => {
      const d = document.createElement('div');
      d.className = 'bc-item';
      d.innerHTML = `<span class="bc-meta">${escHtml(it.meta || '')}</span>${escHtml(it.label || '')}`;
      d.addEventListener('click', () => onPick(i));
      box.appendChild(d);
    });
    detailText.appendChild(box);
  }
  function showHistory() {
    showList('历史提问（点击回看）', history.map(h => ({
      label: (h.q && h.q.length > 60 ? h.q.slice(0, 60) + '…' : h.q) || '（自动提问）',
      meta: new Date(h.ts).toLocaleString()
    })), i => {
      const h = history[i];
      detailTitle.textContent = '讲解（历史）';
      detailSrc.textContent = '原文：' + h.sel;
      detailText.innerHTML = renderMarkdown(h.a);
      currentQA = h;
    });
  }
  async function addMark() {
    const text = selectedText || (sentences[activeIdx] && sentences[activeIdx].text);
    if (!text) { statusEl.textContent = '先选中文字或播放到某一句'; return; }
    const from = (sentences[activeIdx] && sentences[activeIdx].from) || 0;
    marks.unshift({ bvid: meta.bvid, page: meta.page, from, text, ts: Date.now() });
    try { await store.set({ bcMarks: marks }); } catch (e) { }
    statusEl.textContent = '已加入标记本（共 ' + marks.length + ' 条）';
  }
  function showMarks() {
    const mine = marks.filter(m => m.bvid === meta.bvid);
    showList('标记本（点击跳转）', mine.map(m => ({
      label: m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text,
      meta: `P${m.page} · ${fmtTime(m.from)}`
    })), i => {
      const m = mine[i];
      if (m.page !== meta.page) {
        try { sessionStorage.setItem('bcSeek', String(m.from)); } catch (e) { }
        location.search = '?p=' + m.page;
        return;
      }
      const v = getVideo(); if (v) v.currentTime = m.from;
    });
  }
  async function addNote() {
    if (!currentQA) { statusEl.textContent = '先提问一次，再把结果存进笔记'; return; }
    notes.unshift({ ...currentQA, title: meta.title, bvid: meta.bvid, page: meta.page });
    try { await store.set({ bcNotes: notes }); } catch (e) { }
    statusEl.textContent = '已存入笔记（共 ' + notes.length + ' 条）';
  }
  function exportNotes() {
    if (!notes.length) { statusEl.textContent = '笔记还是空的'; return; }
    const md = ['# 网课笔记\n']
      .concat(notes.map((n, i) => `## ${i + 1}. ${n.q}\n\n**原文**：${n.sel}\n\n${n.a}\n\n---\n`)).join('\n');
    download(`网课笔记_${new Date().toISOString().slice(0, 10)}.md`, md, 'text/markdown;charset=utf-8');
  }
  function exportSubtitle() {
    if (!sentences.length) { statusEl.textContent = '字幕还没加载'; return; }
    const srt = sentences.map((s, i) => `${i + 1}\n${srtTime(s.from)} --> ${srtTime(s.to)}\n${s.text}\n`).join('\n');
    download(`${(meta.title || '字幕').replace(/[\\/:*?"<>|]/g, '_')}_P${meta.page}.srt`, srt, 'text/plain;charset=utf-8');
  }

  // ---------- AI 功能 ----------
  async function runQuiz() {
    const text = selectedText || (sentences[activeIdx] && sentences[activeIdx].text);
    if (!text) { statusEl.textContent = '先选中文字或播放到某一句'; return; }
    detailEl.style.display = 'block'; enrichedEl.style.display = 'none';
    detailTitle.textContent = '正在出题…';
    detailSrc.textContent = '原文：' + text;
    detailText.textContent = '（稍候）';
    const r = await sendMsg({ type: 'quiz', selectedText: text });
    if (r.error) { detailTitle.textContent = '出错了'; detailText.textContent = r.error; return; }
    detailTitle.textContent = '自测题';
    detailText.innerHTML = renderMarkdown(r.text);
  }
  async function runOutline() {
    if (!sentences.length) { statusEl.textContent = '字幕尚未加载'; return; }
    detailEl.style.display = 'block'; enrichedEl.style.display = 'none';
    detailTitle.textContent = '整章梳理中…'; detailSrc.textContent = `共 ${sentences.length} 句`;
    detailText.textContent = '（稍候）';
    const r = await sendMsg({ type: 'outline', sentences });
    if (r.error) { detailTitle.textContent = '出错了'; detailText.textContent = r.error; return; }
    detailTitle.textContent = '整章知识点梳理';
    detailText.innerHTML = renderMarkdown(r.text);
  }
  async function runTerms() {
    if (!sentences.length) { statusEl.textContent = '字幕尚未加载'; return; }
    if (terms.length) { showTerms(); return; }
    detailEl.style.display = 'block'; enrichedEl.style.display = 'none';
    detailTitle.textContent = '正在提取术语…'; detailSrc.textContent = '';
    detailText.textContent = '（稍候）';
    const r = await sendMsg({ type: 'terms', text: sentences.map(s => s.text).join('\n') });
    if (r.error) { detailTitle.textContent = '出错了'; detailText.textContent = r.error; return; }
    terms = (r.terms || []).filter(Boolean);
    renderTranscript();
    showTerms();
  }
  function showTerms() {
    showList('术语表（点击就讲；字幕里已高亮）', terms.map(t => ({ label: t, meta: '本课术语' })), i => {
      const term = terms[i];
      const hit = sentences.find(s => s.text.includes(term));
      const text = hit ? hit.text : term;
      selectText(text);
      ask(text, `请解释术语「${term}」`);
    });
  }
  async function runAllSearch() {
    const kw = (searchInput.value || '').trim();
    if (!kw) { statusEl.textContent = '先在上方搜索框输入关键词，再点全课搜索'; return; }
    detailEl.style.display = 'block'; enrichedEl.style.display = 'none';
    detailTitle.textContent = '正在全课搜索…'; detailSrc.textContent = `关键词：${kw}`;
    detailText.textContent = '（会逐集拉取字幕，稍候）';
    const r = await sendMsg({ type: 'searchAll', bvid: meta.bvid, keyword: kw });
    if (r.error) { detailTitle.textContent = '出错了'; detailText.textContent = r.error; return; }
    detailTitle.textContent = `全课搜索：${kw}（${r.matches.length} 处 / ${r.totalPages} 集）`;
    showList(`全课搜索：${kw}`, r.matches.map(m => ({
      label: m.text.length > 60 ? m.text.slice(0, 60) + '…' : m.text,
      meta: `P${m.page}${m.part ? ' · ' + m.part : ''} · ${fmtTime(m.from)}`
    })), i => {
      const m = r.matches[i];
      try { sessionStorage.setItem('bcSeek', String(m.from)); } catch (e) { }
      location.search = '?p=' + m.page;
    });
  }

  // ---------- 搜索框 ----------
  function applySearch() {
    searchKw = searchInput.value.trim();
    searchPos = 0;
    renderTranscript();
    if (!searchKw) statusEl.textContent = `已加载 ${sentences.length} 句字幕；拖选任意文字后提问`;
  }
  searchInput.addEventListener('input', applySearch);
  searchInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !searchHits.length) return;
    const idx = searchHits[searchPos % searchHits.length];
    searchPos++;
    setActive(-1); activeIdx = idx; findAndActivate(idx);
  });
  qInput.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const text = selectedText || (sentences[activeIdx] && sentences[activeIdx].text) || '';
    if (!text) { statusEl.textContent = '请先选中字幕文字，或先播放视频'; return; }
    ask(text, qInput.value);
  });

  // ---------- 按钮 ----------
  $('bc-ask-btn').addEventListener('click', () => {
    const text = selectedText || (sentences[activeIdx] && sentences[activeIdx].text) || '';
    if (!text) { statusEl.textContent = '请先选中字幕文字，或先播放视频'; return; }
    ask(text, qInput.value);
  });
  $('bc-enrich-btn').addEventListener('click', async () => {
    enrichOn = !enrichOn; updateEnrichBtn();
    try { await store.set({ enrichOn }); } catch (e) { }
  });
  $('bc-quiz-btn').addEventListener('click', runQuiz);
  $('bc-mark-btn').addEventListener('click', addMark);
  $('bc-clear-btn').addEventListener('click', () => {
    selectedText = ''; qInput.value = '';
    selEl.textContent = '未选中内容（在上方字幕里拖选任意文字，可跨句）';
    window.getSelection().removeAllRanges();
  });
  $('bc-collapse-btn').addEventListener('click', () => {
    root.classList.toggle('collapsed');
    $('bc-collapse-btn').textContent = root.classList.contains('collapsed') ? '⟨' : '⟩';
  });
  $('bc-outline-btn').addEventListener('click', runOutline);
  $('bc-hist-btn').addEventListener('click', showHistory);
  $('bc-marks-btn').addEventListener('click', showMarks);
  $('bc-terms-btn').addEventListener('click', runTerms);
  $('bc-allsearch-btn').addEventListener('click', runAllSearch);
  $('bc-savenote-btn').addEventListener('click', addNote);
  $('bc-exportnote-btn').addEventListener('click', exportNotes);
  $('bc-exportsub-btn').addEventListener('click', exportSubtitle);
  $('bc-search-toggle').addEventListener('click', () => { barEl.classList.toggle('hide'); });
  styleSel.addEventListener('change', async () => { style = styleSel.value; try { await store.set({ style }); } catch (e) { } });
  depthSel.addEventListener('change', async () => { depth = depthSel.value; try { await store.set({ depth }); } catch (e) { } });

  $('bc-settings-btn').addEventListener('click', async () => {
    settingsEl.classList.toggle('show');
    if (settingsEl.classList.contains('show')) {
      const d = await store.get(['baseUrl', 'apiKey', 'model']);
      $('bc-base').value = d.baseUrl || 'https://myai.bupt.edu.cn/llm-gw/v1';
      $('bc-key').value = d.apiKey || '';
      $('bc-model').value = d.model || 'deepseek-v4-flash';
    }
  });
  $('bc-save').addEventListener('click', async () => {
    await store.set({
      baseUrl: $('bc-base').value.trim() || 'https://myai.bupt.edu.cn/llm-gw/v1',
      apiKey: $('bc-key').value.trim(),
      model: $('bc-model').value.trim() || 'deepseek-v4-flash'
    });
    statusEl.textContent = '设置已保存';
  });

  // ---------- 加载 ----------
  async function load() {
    const { bvid, page } = getVideoKey();
    if (!bvid) { statusEl.textContent = '未识别到 BV 号（请在视频播放页使用）'; return; }
    statusEl.className = 'bc-status';
    statusEl.textContent = '正在加载字幕…（第 ' + page + ' 集）';
    try {
      const r = await sendMsg({ type: 'getSubtitles', bvid, page });
      if (r.error) { statusEl.textContent = r.error; statusEl.className = 'bc-status error'; return; }
      sentences = r.sentences || [];
      meta = { bvid, page: r.page || page, title: r.title || '', partName: r.partName || '' };
      document.querySelector('.bc-head-title').textContent =
        '随行 · ' + (meta.title || bvid) + (meta.partName ? ' · ' + meta.partName : '') + '（P' + meta.page + '）';
      statusEl.textContent = `已加载 ${sentences.length} 句字幕；拖选任意文字后提问`;
      renderTranscript();
      seekPending();
    } catch (err) {
      statusEl.textContent = String(err);
      statusEl.className = 'bc-status error';
    }
  }
  function seekPending() {
    let v = null;
    try { v = sessionStorage.getItem('bcSeek'); } catch (e) { }
    if (!v) return;
    try { sessionStorage.removeItem('bcSeek'); } catch (e) { }
    const t = Number(v);
    let tries = 0;
    const iv = setInterval(() => {
      const vid = getVideo();
      if (vid) { vid.currentTime = t; clearInterval(iv); }
      else if (++tries > 20) clearInterval(iv);
    }, 500);
  }

  // ---------- 初始化 ----------
  (async () => {
    try {
      const d = await store.get(['enrichOn', 'style', 'depth', 'bcHistory', 'bcMarks', 'bcNotes']);
      enrichOn = !!d.enrichOn;
      style = d.style || 'plain';
      depth = d.depth || 'normal';
      history = d.bcHistory || [];
      marks = d.bcMarks || [];
      notes = d.bcNotes || [];
    } catch (e) { }
    updateEnrichBtn();
    styleSel.value = style;
    depthSel.value = depth;
    lastKey = (getVideoKey().bvid || '') + '#' + getVideoKey().page;
    load();
  })();
})();

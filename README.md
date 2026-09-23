# Bilibili LecturePilot

> 看网课时，随手圈一段，让它讲清楚。

看 B站网课时，把课程字幕变成可交互的学习面板：字幕跟着播放进度高亮，看到不懂的地方**拖选那几个字**就能让 AI 细致讲解。

浏览器扩展，Chrome / Edge / Firefox 都能用。

---

## 能做什么

- **字幕跟随**：自动拉取当期视频字幕，播放时高亮当前句；换集（分P）自动重新加载。
- **任意取字提问**：不用管它怎么断句，鼠标拖选任意文字（可跨句、可选半句）直接提问；也可以直接点整句。
- **流式讲解**：回答边生成边显示；网关不支持流式时自动回退。
- **AI 丰富问题（可选）**：默认直接问。打开开关后，AI 先把你粗糙的问题改写成清晰问题（这一步会显示给你看），再作答。
- **风格与深度**：通俗 / 应试 / 严谨，配合 简短 / 标准 / 深入。
- **多轮追问**：就同一段连续追问，会带上前面的问答上下文。
- **自测题**：就选中内容出 2-3 道题＋答案解析。
- **术语表**：抽取本课术语，在字幕里高亮，点一下就讲。
- **搜索**：本集字幕内搜索（回车逐个跳）；跨分P全课搜索（找"这个概念在哪一集讲过"，点击自动跳集并定位到时间点）。
- **沉淀**：历史提问、标记本（没听懂的句子）、笔记（导出 Markdown）、字幕导出（.srt）。
- **讲解缓存**：同样的问题＋风格＋深度直接命中，不再消耗额度（仅内存，重启浏览器失效）。

## 安装

仓库里有两份代码，**JS 完全相同，只有 manifest 不同**（Firefox 的 MV3 后台是会被卸载的 event page，因此火狐版用 MV2 常驻后台页）：

| 目录 | 浏览器 | 说明 |
|---|---|---|
| `bili-course-companion/` | Chrome / Edge | MV3，`background.service_worker` |
| `bili-course-companion-firefox/` | Firefox | MV2，`background.scripts` + `persistent:true` |

**Chrome / Edge**
1. 打开 `chrome://extensions`，右上角开「开发者模式」
2. 「加载已解压的扩展程序」→ 选 `bili-course-companion`

**Firefox**
1. 打开 `about:debugging#/runtime/this-firefox`
2. 「加载临时附加组件」→ 选 `bili-course-companion-firefox/manifest.json`

> Firefox 每次重启浏览器后需要重新加载临时附加组件（这是 Firefox 临时安装的限制，不是 bug）。

## 配置

**必须先填自己的 API Key**，否则会提示「尚未配置 API Key」。

侧栏 ⚙ 按钮（或扩展选项页）里填三项：

| 项 | 说明 |
|---|---|
| 网关地址 | OpenAI 兼容的 `base_url`，例如 `https://myai.bupt.edu.cn/llm-gw/v1` |
| API Key | 你自己的 Key |
| 模型名 | 例如 `deepseek-v4-flash` |

配置保存在本机浏览器里，不会上传。

> 本项目**不内置任何 API Key**。如果看到历史版本里出现过 Key，请立即去对应平台吊销。

## 使用要点

1. **必须在该浏览器登录 B站**——拉字幕的接口需要 Cookie，未登录时拿不到字幕。
2. 打开视频播放页（`bilibili.com/video/BV...`），右侧出现面板。
3. 播放时当前句自动高亮。拖选不懂的文字 → 输入问题（可留空）→ 点「提问」或按回车。
4. 视频本身没有字幕时面板会明确提示，换一个带字幕 / AI 字幕的即可。

## 项目结构

```
bili-course-companion/
  manifest.json      # MV3（Chrome/Edge）
  background.js      # WBI 签名拉字幕、流式/非流式调用网关、缓存
  content.js         # 侧栏 UI、进度跟随、拖选提问、搜索、笔记与导出
  options.html/.js   # 设置页
bili-course-companion-firefox/
  manifest.json      # MV2（Firefox）
  （其余四个文件与上面完全一致）
sync-firefox.js      # 把共享的四个文件从 Chrome 目录同步到 Firefox 目录
```

改完代码后运行一次同步，避免两边不一致：

```
node sync-firefox.js
```

## 实现要点（给想改的人）

- **拉字幕**：`x/web-interface/wbi/view?bvid=` 拿 `cid` → `x/player/wbi/v2?bvid=&cid=` 拿字幕列表。两个坑：`player/v2` 不传 `cid` 会返回 `-400`；字幕数组字段是 `data.subtitle.subtitles`（不是 `.list`）。
- **WBI 签名**：`nav` 拿 `img_key/sub_key` → 按固定置换表生成 `mixinKey` → 参数按 key 排序后 `md5(query + mixinKey)` 得 `w_rid`。仓库里附了不依赖第三方的 md5 实现。
- **AI 字幕**：`lan` 为 `ai-zh`，文件域名 `aisubtitle.hdslb.com`（通配符权限已覆盖）。
- **公式显示**：提示词里明确禁止 LaTeX，要求用 Unicode 符号；前端另有 `latexClean()` 兜底，把残留的 `\varepsilon`、`\frac{a}{b}` 之类转成 ε、`(a)/(b)`。

## 已知限制

- 依赖 B站未公开接口，B站改版可能失效。
- 全课搜索最多扫 20 集、返回 80 条，超长课程会截断。
- 讲解缓存只存在内存里，重启浏览器即失效（历史、标记、笔记是持久化的）。
- 后台会 `console.warn` 打印字幕条目便于排查，觉得吵可以删掉 `background.js` 里那行。

## 许可

MIT，见 `LICENSE`。

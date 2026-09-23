// 选项页逻辑
const $ = (id) => document.getElementById(id);
const ext = (typeof browser !== 'undefined') ? browser : chrome;

(async function () {
  const d = await ext.storage.local.get(['baseUrl', 'apiKey', 'model']);
  $('baseUrl').value = d.baseUrl || 'https://myai.bupt.edu.cn/llm-gw/v1';
  $('apiKey').value = d.apiKey || '';
  $('model').value = d.model || 'deepseek-v4-flash';

  $('save').addEventListener('click', async () => {
    await ext.storage.local.set({
      baseUrl: $('baseUrl').value.trim() || 'https://myai.bupt.edu.cn/llm-gw/v1',
      apiKey: $('apiKey').value.trim(),
      model: $('model').value.trim() || 'deepseek-v4-flash'
    });
    const msg = $('msg');
    msg.textContent = '已保存 ✓';
    setTimeout(() => (msg.textContent = ''), 2000);
  });
})();

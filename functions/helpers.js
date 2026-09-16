/** 前台渲染辅助函数（同时供 EJS 模板作为 locals 使用） */

export function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function fmtPrice(p) {
  if (!p.price_min && !p.price_max) return '—';
  const a = Number(p.price_min) || 0;
  const b = Number(p.price_max) || 0;
  return `USD ${a.toFixed(2)} – ${b.toFixed(2)} / ${p.unit || 'kg'}`;
}

export function thumb(p, lang) {
  const name = lang === 'zh' ? (p.name_zh || p.name_en) : (p.name_en || p.name_zh);
  if (p.image) {
    return `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(name)}" loading="lazy">`;
  }
  return `<span class="ph-name">${escapeHtml(name)}</span><span class="ph-latin">${escapeHtml(p.latin_name)}</span>`;
}

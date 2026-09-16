/* ============================================================
   中药材外贸站 —— 后台管理逻辑
   ============================================================ */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let state = { view: 'dashboard', categories: [], products: [], inquiries: [], page: 1, q: '', cat: '', status: '' };

  /* ---------- 基础工具 ---------- */
  async function api(path, opts = {}) {
    const res = await fetch('/api/admin' + path, Object.assign({
      credentials: 'same-origin',
      headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    }, opts));
    if (res.status === 401) { showLogin(); throw new Error('未登录'); }
    if (opts.raw) return res;
    return res.json();
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(t._tm);
    t._tm = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  let saveHandler = null;
  function openModal(title, html, onSave) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    saveHandler = onSave;
    $('#modalMask').classList.remove('hidden');
  }
  function closeModal() { $('#modalMask').classList.add('hidden'); saveHandler = null; }
  $('#modalClose').onclick = closeModal;
  $('#modalCancel').onclick = closeModal;
  $('#modalMask').onclick = (e) => { if (e.target.id === 'modalMask') closeModal(); };
  $('#modalSave').onclick = () => { if (saveHandler) saveHandler(); };

  /* ---------- 登录 ---------- */
  function showLogin() {
    $('#appView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
  }
  function showApp(username) {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    $('#adminName').textContent = username || '';
    loadCategories().then(() => go('dashboard'));
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target).entries());
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data),
      }).then((x) => x.json());
      if (r.ok) { $('#loginErr').textContent = ''; showApp(r.username); }
      else $('#loginErr').textContent = r.msg || '登录失败';
    } catch (err) { $('#loginErr').textContent = '网络错误'; }
  });

  $('#logoutBtn').onclick = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    showLogin();
  };

  async function loadCategories() {
    const r = await api('/categories');
    state.categories = r.data || [];
  }

  /* ---------- 导航 ---------- */
  const TITLES = {
    dashboard: '仪表盘', products: '产品管理', categories: '分类管理', inquiries: '询盘管理',
    company: '公司信息', certificates: '资质证书', banners: '首页 Banner', i18n: '站点文案', password: '修改密码',
  };
  $$('.sb-nav a').forEach((a) => {
    a.onclick = () => {
      $$('.sb-nav a').forEach((x) => x.classList.remove('on'));
      a.classList.add('on');
      go(a.dataset.view);
    };
  });
  function go(view) {
    state.view = view;
    state.page = 1;
    $('#viewTitle').textContent = TITLES[view] || '';
    ({ dashboard, products, categories, inquiries, company, certificates, banners, i18n, password }[view] || dashboard)();
  }

  /* ============================================================
     仪表盘
     ============================================================ */
  async function dashboard() {
    const r = await api('/stats');
    const s = r;
    const statusTxt = { new: '未读', read: '已读', replied: '已回复', archived: '已归档' };
    $('#contentBody').innerHTML = `
      <div class="stats">
        <div class="stat"><b>${s.products}</b><span>产品总数（在售 ${s.active}）</span></div>
        <div class="stat"><b>${s.categories}</b><span>产品分类</span></div>
        <div class="stat warn"><b>${s.unread}</b><span>未读询盘</span></div>
        <div class="stat"><b>${s.inquiries}</b><span>询盘总数</span></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>最近询盘</h3><a class="btn-sm" onclick="document.querySelector('[data-view=\\'inquiries\\']').click()">查看全部</a></div>
        <table class="tbl">
          <thead><tr><th>时间</th><th>客户</th><th>公司</th><th>国家</th><th>询盘产品</th><th>状态</th></tr></thead>
          <tbody>
            ${s.recent.length ? s.recent.map((i) => `
              <tr>
                <td class="mono muted">${esc(i.created_at)}</td>
                <td><b>${esc(i.name)}</b><br><span class="muted">${esc(i.email)}</span></td>
                <td>${esc(i.company || '—')}</td>
                <td>${esc(i.country || '—')}</td>
                <td>${esc(i.product_name || '—')}</td>
                <td><span class="tag ${i.status === 'new' ? 'off' : 'on'}">${statusTxt[i.status] || i.status}</span></td>
              </tr>`).join('') : '<tr><td colspan="6" class="empty-row">暂无询盘</td></tr>'}
          </tbody>
        </table>
      </div>
      <div class="card">
        <div class="card-head"><h3>浏览量 Top 5</h3></div>
        <table class="tbl">
          <thead><tr><th>产品</th><th>英文名</th><th>浏览量</th></tr></thead>
          <tbody>${s.top.map((p) => `<tr><td><b>${esc(p.name_zh)}</b></td><td class="muted">${esc(p.name_en)}</td><td class="mono">${p.views}</td></tr>`).join('')}</tbody>
        </table>
      </div>`;
    refreshUnread(s.unread);
  }

  function refreshUnread(n) {
    const dot = $('#unreadDot');
    if (n > 0) { dot.textContent = n; dot.classList.add('show'); } else dot.classList.remove('show');
  }

  /* ============================================================
     产品管理
     ============================================================ */
  async function products() {
    const qs = new URLSearchParams();
    if (state.q) qs.set('q', state.q);
    if (state.cat) qs.set('cat', state.cat);
    const r = await api('/products?' + qs.toString());
    state.products = r.data || [];
    const PAGE = 15;
    const total = state.products.length;
    const pages = Math.max(1, Math.ceil(total / PAGE));
    const cur = Math.min(state.page, pages);
    const rows = state.products.slice((cur - 1) * PAGE, cur * PAGE);

    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>产品列表（${total}）</h3>
          <button class="btn-gold" id="addProduct">+ 新增产品</button>
        </div>
        <div class="toolbar">
          <input id="prodSearch" placeholder="搜索品名 / 拼音 / 拉丁名" value="${esc(state.q)}">
          <select id="prodCat">
            <option value="">全部分类</option>
            ${state.categories.map((c) => `<option value="${c.id}" ${String(state.cat) === String(c.id) ? 'selected' : ''}>${esc(c.name_zh)} / ${esc(c.name_en)}</option>`).join('')}
          </select>
          <button class="btn-ghost" id="prodReset">重置</button>
        </div>
        <table class="tbl">
          <thead><tr>
            <th>图</th><th>品名（中 / 英）</th><th>拉丁学名</th><th>分类</th><th>产地</th><th>参考价 (USD/kg)</th><th>状态</th><th>操作</th>
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map((p) => `
              <tr>
                <td>${p.image ? `<img class="tbl-media" src="${esc(p.image)}">` : `<span class="tbl-media-ph">${esc((p.name_zh || '').charAt(0))}</span>`}</td>
                <td><b>${esc(p.name_zh)}</b><br><span class="muted">${esc(p.name_en)}</span></td>
                <td class="mono muted" style="font-style:italic">${esc(p.latin_name)}</td>
                <td>${esc(p.cat_zh || '—')}</td>
                <td>${esc(p.origin_zh || '—')}</td>
                <td class="mono">${p.price_min} – ${p.price_max}</td>
                <td>
                  <span class="tag ${p.status === 'active' ? 'on' : 'off'}">${p.status === 'active' ? '在售' : '下架'}</span>
                  ${p.featured ? ' <span class="tag feat">主推</span>' : ''}
                </td>
                <td class="actions">
                  <button class="btn-sm" data-edit="${p.id}">编辑</button>
                  <button class="btn-sm del" data-del="${p.id}">删除</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="8" class="empty-row">没有匹配的产品</td></tr>'}
          </tbody>
        </table>
        ${pages > 1 ? `<div class="pager">${Array.from({ length: pages }, (_, i) => `<a class="${i + 1 === cur ? 'on' : ''}" data-page="${i + 1}">${i + 1}</a>`).join('')}</div>` : ''}
      </div>`;

    $('#addProduct').onclick = () => productForm(null);
    $('#prodSearch').onchange = (e) => { state.q = e.target.value; state.page = 1; products(); };
    $('#prodSearch').onkeydown = (e) => { if (e.key === 'Enter') { state.q = e.target.value; state.page = 1; products(); } };
    $('#prodCat').onchange = (e) => { state.cat = e.target.value; state.page = 1; products(); };
    $('#prodReset').onclick = () => { state.q = ''; state.cat = ''; state.page = 1; products(); };
    $$('[data-page]').forEach((a) => { a.onclick = () => { state.page = Number(a.dataset.page); products(); }; });
    $$('[data-edit]').forEach((b) => { b.onclick = () => productForm(Number(b.dataset.edit)); });
    $$('[data-del]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('确定删除这个产品？此操作不可恢复。')) return;
        await api('/products/' + b.dataset.del, { method: 'DELETE' });
        toast('已删除');
        products();
      };
    });
  }

  function productForm(id) {
    const p = id ? state.products.find((x) => x.id === id) : {};
    const v = (k, d = '') => esc(p[k] === undefined || p[k] === null ? d : p[k]);
    const fld = (name, label, opts = {}) => `
      <div class="fld">
        <label>${label}${opts.lang ? `<span class="lang ${opts.lang}">${opts.lang === 'zh' ? '中文' : 'EN'}</span>` : ''}</label>
        ${opts.type === 'textarea'
          ? `<textarea name="${name}">${v(name, opts.def)}</textarea>`
          : `<input name="${name}" value="${v(name, opts.def)}" ${opts.type ? `type="${opts.type}"` : ''}>`}
      </div>`;

    openModal(id ? `编辑产品 · ${p.name_zh}` : '新增产品', `
      <div class="form-grid">
        <div class="fsec">基本信息</div>
        <div class="fld">
          <label>所属分类</label>
          <select name="category_id">
            <option value="">— 未分类 —</option>
            ${state.categories.map((c) => `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${esc(c.name_zh)} / ${esc(c.name_en)}</option>`).join('')}
          </select>
        </div>
        ${fld('slug', 'URL 别名（英文短横线）', { def: '' })}
        ${fld('name_zh', '品名', { lang: 'zh' })}
        ${fld('name_en', '品名', { lang: 'en' })}
        ${fld('pinyin', '拼音')}
        ${fld('latin_name', '拉丁学名')}

        <div class="fsec">产地 · 规格</div>
        ${fld('origin_zh', '产地', { lang: 'zh' })}
        ${fld('origin_en', '产地', { lang: 'en' })}
        ${fld('part_zh', '药用部位', { lang: 'zh' })}
        ${fld('part_en', '药用部位', { lang: 'en' })}
        ${fld('grade_zh', '等级', { lang: 'zh' })}
        ${fld('grade_en', '等级', { lang: 'en' })}
        ${fld('spec_zh', '规格', { lang: 'zh' })}
        ${fld('spec_en', '规格', { lang: 'en' })}
        ${fld('moisture', '水分')}
        ${fld('ash', '总灰分')}
        ${fld('shelf_life', '保质期')}

        <div class="fsec">包装 · 价格</div>
        ${fld('package_zh', '包装方式', { lang: 'zh' })}
        ${fld('package_en', '包装方式', { lang: 'en' })}
        ${fld('moq', '起订量 MOQ')}
        ${fld('price_min', '最低价 (USD)', { type: 'number' })}
        ${fld('price_max', '最高价 (USD)', { type: 'number' })}
        ${fld('unit', '计价单位', { def: 'kg' })}

        <div class="fsec">图文详情</div>
        <div class="fld" style="grid-column:1/-1">
          <label>产品图片</label>
        <div class="img-row">
          <img class="img-preview" id="imgPrev" src="${p.image ? esc(p.image) : ''}" alt="">
          <input name="image" id="imageUrl" value="${v('image')}" placeholder="粘贴图片 URL（如 https://.../xxx.jpg）">
        </div>
        </div>
        <div class="fld" style="grid-column:1/-1"><label>产品描述 · 中文</label><textarea name="desc_zh">${v('desc_zh')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>产品描述 · English</label><textarea name="desc_en">${v('desc_en')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>功能与用途 · 中文</label><textarea name="usage_zh">${v('usage_zh')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>Functions & Uses · English</label><textarea name="usage_en">${v('usage_en')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>贮藏条件 · 中文</label><textarea name="storage_zh">${v('storage_zh')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>Storage · English</label><textarea name="storage_en">${v('storage_en')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>可提供的资质（逗号分隔）</label><input name="certs" value="${v('certs')}"></div>

        <div class="fsec">展示设置</div>
        <div class="fld"><label>状态</label>
          <select name="status"><option value="active" ${p.status !== 'draft' ? 'selected' : ''}>在售</option><option value="draft" ${p.status === 'draft' ? 'selected' : ''}>下架</option></select>
        </div>
        <div class="fld"><label>首页主推</label>
          <select name="featured"><option value="0" ${!p.featured ? 'selected' : ''}>否</option><option value="1" ${p.featured ? 'selected' : ''}>是</option></select>
        </div>
        <div class="fld"><label>排序（越小越靠前）</label><input name="sort_order" type="number" value="${v('sort_order', 0)}"></div>
      </div>`, async () => {
      const data = {};
      $$('#modalBody input[name], #modalBody select[name], #modalBody textarea[name]').forEach((el) => { data[el.name] = el.value; });
      if (!data.name_zh && !data.name_en) return toast('请填写产品名');
      data.category_id = data.category_id ? Number(data.category_id) : null;
      ['price_min', 'price_max', 'sort_order', 'featured'].forEach((k) => { data[k] = Number(data[k] || 0); });
      if (id) await api('/products/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/products', { method: 'POST', body: JSON.stringify(data) });
      closeModal();
      toast(id ? '已保存' : '已新增');
      products();
    });

    $('#imageUrl').oninput = (e) => { $('#imgPrev').src = e.target.value; };
  }

  /* ============================================================
     分类管理
     ============================================================ */
  async function categories() {
    const r = await api('/categories');
    const rows = r.data || [];
    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head"><h3>产品分类（${rows.length}）</h3><button class="btn-gold" id="addCat">+ 新增分类</button></div>
        <table class="tbl">
          <thead><tr><th>排序</th><th>中文名</th><th>English</th><th>别名(slug)</th><th>说明</th><th>操作</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((c) => `
              <tr>
                <td class="mono">${c.sort_order}</td>
                <td><b>${esc(c.name_zh)}</b></td>
                <td>${esc(c.name_en)}</td>
                <td class="mono muted">${esc(c.slug)}</td>
                <td class="muted" style="max-width:280px">${esc((c.desc_zh || '').slice(0, 40))}…</td>
                <td class="actions">
                  <button class="btn-sm" data-edit="${c.id}">编辑</button>
                  <button class="btn-sm del" data-del="${c.id}">删除</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="6" class="empty-row">暂无分类</td></tr>'}
          </tbody>
        </table>
      </div>`;
    $('#addCat').onclick = () => catForm(null, rows);
    $$('[data-edit]').forEach((b) => b.onclick = () => catForm(Number(b.dataset.edit), rows));
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('删除分类？该分类下的产品会变为「未分类」。')) return;
      await api('/categories/' + b.dataset.del, { method: 'DELETE' });
      toast('已删除'); loadCategories(); categories();
    });
  }

  function catForm(id, rows) {
    const c = id ? rows.find((x) => x.id === id) : {};
    const v = (k, d = '') => esc(c[k] == null ? d : c[k]);
    openModal(id ? '编辑分类' : '新增分类', `
      <div class="form-grid">
        ${['name_zh:中文名:zh', 'name_en:英文名:en'].map((s) => {
          const [n, l, lang] = s.split(':');
          return `<div class="fld"><label>${l}<span class="lang ${lang}">${lang === 'zh' ? '中文' : 'EN'}</span></label><input name="${n}" value="${v(n)}"></div>`;
        }).join('')}
        <div class="fld"><label>别名 slug</label><input name="slug" value="${v('slug')}"></div>
        <div class="fld"><label>排序</label><input name="sort_order" type="number" value="${v('sort_order', 0)}"></div>
        <div class="fld" style="grid-column:1/-1"><label>说明 · 中文</label><textarea name="desc_zh">${v('desc_zh')}</textarea></div>
        <div class="fld" style="grid-column:1/-1"><label>Description · EN</label><textarea name="desc_en">${v('desc_en')}</textarea></div>
      </div>`, async () => {
      const data = {};
      $$('#modalBody input[name], #modalBody textarea[name]').forEach((el) => { data[el.name] = el.value; });
      if (!data.name_zh && !data.name_en) return toast('请填写分类名');
      if (id) await api('/categories/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/categories', { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('已保存'); await loadCategories(); categories();
    });
  }

  /* ============================================================
     询盘管理
     ============================================================ */
  async function inquiries() {
    const qs = new URLSearchParams();
    if (state.status) qs.set('status', state.status);
    const r = await api('/inquiries?' + qs.toString());
    const rows = r.data || [];
    const ST = { new: '未读', read: '已读', replied: '已回复', archived: '已归档' };
    const tabs = [['', '全部'], ['new', '未读'], ['read', '已读'], ['replied', '已回复'], ['archived', '已归档']];
    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>询盘收件箱（${rows.length}）</h3>
          <a class="btn-ghost" href="/api/admin/inquiries/export">导出 CSV ↓</a>
        </div>
        <div class="toolbar">
          ${tabs.map(([k, label]) => `<button class="btn-sm ${state.status === k ? '' : ''}" data-st="${k}" style="${state.status === k ? 'background:var(--ink);color:#fff' : ''}">${label}</button>`).join(' ')}
        </div>
        <table class="tbl">
          <thead><tr><th>ID</th><th>时间</th><th>客户</th><th>公司 / 国家</th><th>询盘产品</th><th>数量</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((i) => `
              <tr>
                <td class="mono muted">#${i.id}</td>
                <td class="mono muted">${esc(i.created_at)}</td>
                <td><b>${esc(i.name)}</b><br><span class="muted">${esc(i.email)}</span></td>
                <td>${esc(i.company || '—')}<br><span class="muted">${esc(i.country || '—')}</span></td>
                <td>${esc(i.product_name || '—')}</td>
                <td>${esc(i.quantity || '—')}</td>
                <td><span class="tag ${i.status === 'new' ? 'off' : 'on'}">${ST[i.status] || i.status}</span></td>
                <td class="actions">
                  <button class="btn-sm" data-view-one="${i.id}">查看</button>
                  <button class="btn-sm del" data-del="${i.id}">删除</button>
                </td>
              </tr>`).join('') : '<tr><td colspan="8" class="empty-row">暂无询盘</td></tr>'}
          </tbody>
        </table>
      </div>`;
    $$('[data-st]').forEach((b) => b.onclick = () => { state.status = b.dataset.st; inquiries(); });
    $$('[data-view-one]').forEach((b) => b.onclick = () => inquiryDetail(Number(b.dataset.viewOne), rows));
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('删除该询盘？')) return;
      await api('/inquiries/' + b.dataset.del, { method: 'DELETE' });
      toast('已删除'); inquiries(); refreshStats();
    });
  }

  function inquiryDetail(id, rows) {
    const i = rows.find((x) => x.id === id);
    openModal(`询盘 #${i.id}`, `
      <div class="form-grid">
        <div class="fld"><label>客户姓名</label><input value="${esc(i.name)}" readonly></div>
        <div class="fld"><label>邮箱</label><input value="${esc(i.email)}" readonly></div>
        <div class="fld"><label>电话 / WhatsApp</label><input value="${esc(i.phone)}" readonly></div>
        <div class="fld"><label>公司</label><input value="${esc(i.company)}" readonly></div>
        <div class="fld"><label>国家 / 地区</label><input value="${esc(i.country)}" readonly></div>
        <div class="fld"><label>需求数量</label><input value="${esc(i.quantity)}" readonly></div>
        <div class="fld" style="grid-column:1/-1"><label>询盘产品</label><input value="${esc(i.product_name)}" readonly></div>
        <div class="fld" style="grid-column:1/-1"><label>详细需求</label><textarea readonly>${esc(i.message)}</textarea></div>
        <div class="fld"><label>处理状态</label>
          <select id="inqStatus">
            <option value="new" ${i.status === 'new' ? 'selected' : ''}>未读</option>
            <option value="read" ${i.status === 'read' ? 'selected' : ''}>已读</option>
            <option value="replied" ${i.status === 'replied' ? 'selected' : ''}>已回复</option>
            <option value="archived" ${i.status === 'archived' ? 'selected' : ''}>已归档</option>
          </select>
        </div>
        <div class="fld"><label>内部备注</label><input id="inqNote" value="${esc(i.note)}"></div>
      </div>
      <p class="muted" style="margin:14px 0 0;font-size:12.5px">提交时间：${esc(i.created_at)}</p>`, async () => {
      await api('/inquiries/' + id, {
        method: 'PATCH',
        body: JSON.stringify({ status: $('#inqStatus').value, note: $('#inqNote').value }),
      });
      closeModal(); toast('已更新'); inquiries(); refreshStats();
    });
  }

  async function refreshStats() {
    const s = await api('/stats');
    refreshUnread(s.unread);
  }

  /* ============================================================
     公司信息
     ============================================================ */
  async function company() {
    const r = await api('/company');
    const c = r.data || {};
    const v = (k, d = '') => esc(c[k] == null ? d : c[k]);
    const row = (n, l, lang) => `<div class="fld"><label>${l}${lang ? `<span class="lang ${lang}">${lang === 'zh' ? '中文' : 'EN'}</span>` : ''}</label><input name="${n}" value="${v(n)}"></div>`;
    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head"><h3>公司基本信息</h3><button class="btn-gold" id="saveCompany">保存修改</button></div>
        <div class="form-grid">
          <div class="fsec">公司名称</div>
          ${row('name_zh', '公司名', 'zh')}${row('name_en', 'Company Name', 'en')}
          <div class="fsec">公司简介</div>
          <div class="fld" style="grid-column:1/-1"><label>简介 · 中文</label><textarea name="intro_zh" style="min-height:130px">${v('intro_zh')}</textarea></div>
          <div class="fld" style="grid-column:1/-1"><label>Introduction · EN</label><textarea name="intro_en" style="min-height:130px">${v('intro_en')}</textarea></div>
          <div class="fsec">地址</div>
          ${row('address_zh', '地址', 'zh')}${row('address_en', 'Address', 'en')}
          <div class="fsec">联系方式</div>
          ${row('phone', '电话')}${row('whatsapp', 'WhatsApp')}${row('email', '邮箱')}${row('website', '官网')}
          ${row('worktime_zh', '工作时间', 'zh')}${row('worktime_en', 'Working Hours', 'en')}
          <div class="fsec">企业数据（前台「关于我们」展示）</div>
          ${row('year_founded', '成立年份')}${row('employees', '员工规模')}
          ${row('factory_area', '厂房面积')}${row('annual_output', '年产能')}
          <div class="fld" style="grid-column:1/-1">${''}<label>主要市场</label><input name="main_market" value="${v('main_market')}"></div>
        </div>
      </div>`;
    $('#saveCompany').onclick = async () => {
      const data = {};
      $$('#contentBody input[name], #contentBody textarea[name]').forEach((el) => { data[el.name] = el.value; });
      await api('/company', { method: 'PUT', body: JSON.stringify(data) });
      toast('已保存');
    };
  }

  /* ============================================================
     资质证书
     ============================================================ */
  async function certificates() {
    const r = await api('/certificates');
    const rows = r.data || [];
    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head"><h3>资质证书（${rows.length}）</h3><button class="btn-gold" id="addCert">+ 新增证书</button></div>
        <table class="tbl">
          <thead><tr><th>图</th><th>中文名称</th><th>English</th><th>发证机构</th><th>排序</th><th>操作</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((c) => `
              <tr>
                <td>${c.image ? `<img class="tbl-media" src="${esc(c.image)}">` : '<span class="tbl-media-ph">✓</span>'}</td>
                <td><b>${esc(c.name_zh)}</b></td><td>${esc(c.name_en)}</td>
                <td class="muted">${esc(c.issuer_zh)}</td>
                <td class="mono">${c.sort_order}</td>
                <td class="actions"><button class="btn-sm" data-edit="${c.id}">编辑</button><button class="btn-sm del" data-del="${c.id}">删除</button></td>
              </tr>`).join('') : '<tr><td colspan="6" class="empty-row">暂无证书</td></tr>'}
          </tbody>
        </table>
      </div>`;
    $('#addCert').onclick = () => certForm(null, rows);
    $$('[data-edit]').forEach((b) => b.onclick = () => certForm(Number(b.dataset.edit), rows));
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('删除该证书？')) return;
      await api('/certificates/' + b.dataset.del, { method: 'DELETE' });
      toast('已删除'); certificates();
    });
  }

  function certForm(id, rows) {
    const c = id ? rows.find((x) => x.id === id) : {};
    const v = (k, d = '') => esc(c[k] == null ? d : c[k]);
    openModal(id ? '编辑证书' : '新增证书', `
      <div class="form-grid">
        <div class="fld"><label>中文名称<span class="lang zh">中文</span></label><input name="name_zh" value="${v('name_zh')}"></div>
        <div class="fld"><label>English<span class="lang en">EN</span></label><input name="name_en" value="${v('name_en')}"></div>
        <div class="fld"><label>发证机构<span class="lang zh">中文</span></label><input name="issuer_zh" value="${v('issuer_zh')}"></div>
        <div class="fld"><label>Issuer<span class="lang en">EN</span></label><input name="issuer_en" value="${v('issuer_en')}"></div>
        <div class="fld"><label>排序</label><input name="sort_order" type="number" value="${v('sort_order', 0)}"></div>
        <div class="fld" style="grid-column:1/-1"><label>证书图片</label>
        <div class="img-row">
          <img class="img-preview" id="imgPrev" src="${c.image ? esc(c.image) : ''}">
          <input name="image" id="imageUrl" value="${v('image')}" placeholder="粘贴图片 URL">
        </div>
        </div>
      </div>`, async () => {
      const data = {};
      $$('#modalBody input[name]').forEach((el) => { data[el.name] = el.value; });
      if (id) await api('/certificates/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/certificates', { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('已保存'); certificates();
    });
  }

  /* ============================================================
     Banner
     ============================================================ */
  async function banners() {
    const r = await api('/banners');
    const rows = r.data || [];
    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head"><h3>首页 Banner 文案（${rows.length}）</h3><button class="btn-gold" id="addBan">+ 新增</button></div>
        <table class="tbl">
          <thead><tr><th>主标题 · 中文</th><th>主标题 · EN</th><th>副标题 · 中文</th><th>状态</th><th>排序</th><th>操作</th></tr></thead>
          <tbody>
            ${rows.length ? rows.map((b) => `
              <tr>
                <td><b>${esc(b.title_zh)}</b></td><td>${esc(b.title_en)}</td>
                <td class="muted">${esc(b.subtitle_zh)}</td>
                <td><span class="tag ${b.status ? 'on' : 'off'}">${b.status ? '显示' : '隐藏'}</span></td>
                <td class="mono">${b.sort_order}</td>
                <td class="actions"><button class="btn-sm" data-edit="${b.id}">编辑</button><button class="btn-sm del" data-del="${b.id}">删除</button></td>
              </tr>`).join('') : '<tr><td colspan="6" class="empty-row">暂无 Banner</td></tr>'}
          </tbody>
        </table>
      </div>`;
    $('#addBan').onclick = () => bannerForm(null, rows);
    $$('[data-edit]').forEach((b) => b.onclick = () => bannerForm(Number(b.dataset.edit), rows));
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('删除该 Banner？')) return;
      await api('/banners/' + b.dataset.del, { method: 'DELETE' });
      toast('已删除'); banners();
    });
  }

  function bannerForm(id, rows) {
    const b = id ? rows.find((x) => x.id === id) : {};
    const v = (k, d = '') => esc(b[k] == null ? d : b[k]);
    openModal(id ? '编辑 Banner' : '新增 Banner', `
      <div class="form-grid">
        <div class="fld"><label>主标题<span class="lang zh">中文</span></label><input name="title_zh" value="${v('title_zh')}"></div>
        <div class="fld"><label>Title<span class="lang en">EN</span></label><input name="title_en" value="${v('title_en')}"></div>
        <div class="fld"><label>副标题<span class="lang zh">中文</span></label><input name="subtitle_zh" value="${v('subtitle_zh')}"></div>
        <div class="fld"><label>Subtitle<span class="lang en">EN</span></label><input name="subtitle_en" value="${v('subtitle_en')}"></div>
        <div class="fld"><label>状态</label><select name="status"><option value="1" ${b.status !== 0 ? 'selected' : ''}>显示</option><option value="0" ${b.status === 0 ? 'selected' : ''}>隐藏</option></select></div>
        <div class="fld"><label>排序</label><input name="sort_order" type="number" value="${v('sort_order', 0)}"></div>
      </div>`, async () => {
      const data = {};
      $$('#modalBody input[name], #modalBody select[name]').forEach((el) => { data[el.name] = el.value; });
      data.status = data.status === '1' || data.status === 'true';
      if (id) await api('/banners/' + id, { method: 'PUT', body: JSON.stringify(data) });
      else await api('/banners', { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('已保存'); banners();
    });
  }

  /* ============================================================
     站点文案（i18n）
     ============================================================ */
  async function i18n() {
    const r = await api('/i18n');
    const ov = r.overrides || {};
    const rows = r.builtin || [];
    $('#contentBody').innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>站点文案（${rows.length} 条）</h3>
          <input id="i18nSearch" placeholder="搜索 key 或文案…" style="border:1px solid var(--line);padding:8px 11px;border-radius:4px;min-width:240px">
        </div>
        <p class="muted" style="margin-top:0">修改后点击对应行的「保存」即可覆盖全站显示，留空并保存可恢复默认文案。</p>
        <table class="tbl" id="i18nTable">
          <thead><tr><th style="width:210px">Key</th><th>中文</th><th>English</th><th style="width:120px">操作</th></tr></thead>
          <tbody>
            ${rows.map((it) => {
              const o = ov[it.key] || {};
              return `<tr data-key="${esc(it.key)}">
                <td class="mono muted">${esc(it.key)}</td>
                <td><input class="i18n-zh" value="${esc(o.zh || '')}" placeholder="${esc(it.zh)}" style="width:100%;border:1px solid var(--line);padding:6px 8px;border-radius:4px"></td>
                <td><input class="i18n-en" value="${esc(o.en || '')}" placeholder="${esc(it.en)}" style="width:100%;border:1px solid var(--line);padding:6px 8px;border-radius:4px"></td>
                <td><button class="btn-sm" data-save="${esc(it.key)}">保存</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
    $$('[data-save]').forEach((b) => {
      b.onclick = async () => {
        const tr = b.closest('tr');
        await api('/i18n', {
          method: 'PUT',
          body: JSON.stringify({
            key: tr.dataset.key,
            value_zh: $('.i18n-zh', tr).value,
            value_en: $('.i18n-en', tr).value,
          }),
        });
        toast('已保存：' + tr.dataset.key);
      };
    });
    $('#i18nSearch').oninput = (e) => {
      const kw = e.target.value.toLowerCase();
      $$('#i18nTable tbody tr').forEach((tr) => {
        tr.style.display = tr.textContent.toLowerCase().includes(kw) ? '' : 'none';
      });
    };
  }

  /* ============================================================
     修改密码
     ============================================================ */
  function password() {
    $('#contentBody').innerHTML = `
      <div class="card" style="max-width:520px">
        <div class="card-head"><h3>修改管理员密码</h3></div>
        <div class="form-grid one">
          <div class="fld"><label>原密码</label><input id="oldPw" type="password"></div>
          <div class="fld"><label>新密码（至少 6 位）</label><input id="newPw" type="password"></div>
          <div class="fld"><label>确认新密码</label><input id="newPw2" type="password"></div>
        </div>
        <button class="btn-gold" id="savePw" style="margin-top:16px">保存修改</button>
      </div>`;
    $('#savePw').onclick = async () => {
      const old_password = $('#oldPw').value, new_password = $('#newPw').value;
      if (new_password.length < 6) return toast('新密码至少 6 位');
      if (new_password !== $('#newPw2').value) return toast('两次输入不一致');
      const r = await api('/password', { method: 'PUT', body: JSON.stringify({ old_password, new_password }) });
      if (r.ok) { toast('密码已修改'); $('#oldPw').value = $('#newPw').value = $('#newPw2').value = ''; }
      else toast(r.msg || '修改失败');
    };
  }

  /* ---------- 启动 ---------- */
  (async function init() {
    try {
      const r = await api('/me');
      if (r.ok) showApp(r.username); else showLogin();
    } catch (e) { showLogin(); }
  })();
})();

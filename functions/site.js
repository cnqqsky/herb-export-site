/**
 * 前台 SSR 路由（Cloudflare Pages Functions catch-all）
 * 对应原 server/routes/site.js。所有页面服务端渲染（EJS），
 * 模板与数据已在 build-templates.mjs 阶段预编译为 functions/templates.cjs（真实函数，无运行时编译）。
 */
import tpl from './templates.cjs';
const { templates, productCardTemplate } = tpl;
import * as db from './db.js';
import { makeT, LANGS } from './i18n.js';
import { fmtPrice, thumb } from './helpers.js';
import { ensureReady } from './seed-data.js';

const PAGE_SIZE = 12;

function parseCookies(req) {
  const h = req.headers.get('cookie') || '';
  const out = {};
  h.split(';').forEach((s) => {
    const i = s.indexOf('=');
    if (i > -1) out[s.slice(0, i).trim()] = decodeURIComponent(s.slice(i + 1).trim());
  });
  return out;
}

function detectLang(req) {
  const c = parseCookies(req);
  if (c.lang === 'zh' || c.lang === 'en') return c.lang;
  const al = req.headers.get('accept-language') || '';
  if (/zh|cmn|han/i.test(al)) return 'zh';
  return 'en';
}

function htmlResp(html, status = 200) {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=30' },
  });
}

function baseFor(env, lang, t, company, categories, langUrl) {
  const base = { lang, t, company, categories, langUrl, thumb, fmtPrice };
  base.renderCard = (p) => productCardTemplate(Object.assign({}, base, { p }));
  return base;
}

async function layout404(env, lang, url) {
  const company = (await db.get(env, 'SELECT * FROM company WHERE id=1')) || {};
  const categories = await db.all(env, 'SELECT * FROM categories ORDER BY sort_order, id');
  const t = makeT(lang, {});
  const langUrl = (l) => `/${l}`;
  const base = baseFor(env, lang, t, company, categories, langUrl);
  const html = templates['404'](base);
  return htmlResp(html, 404);
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  let path = decodeURIComponent(url.pathname);
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  // 根路径 → 语言重定向（cookie > Accept-Language > 默认英文）
  if (path === '/' || path === '') {
    return Response.redirect(`${url.origin}/${detectLang(request)}`, 302);
  }
  // 后台入口
  if (path === '/admin') {
    return Response.redirect(`${url.origin}/admin.html`, 302);
  }

  const segs = path.split('/').filter(Boolean);
  const lang = segs[0];
  if (!LANGS.includes(lang)) return layout404(env, 'en', url);

  const rest = '/' + segs.slice(1).join('/'); // '/products' 或 '/'
  const langUrl = (l) => `/${l}${rest === '/' ? '' : rest}`;

  await ensureReady(env);

  const company = (await db.get(env, 'SELECT * FROM company WHERE id=1')) || {};
  const categories = await db.all(env, 'SELECT * FROM categories ORDER BY sort_order, id');
  const i18nRows = await db.all(env, 'SELECT * FROM i18n');
  const overrides = {};
  for (const r of i18nRows) overrides[r.key] = lang === 'zh' ? r.value_zh : r.value_en;
  const t = makeT(lang, overrides);
  const base = baseFor(env, lang, t, company, categories, langUrl);

  const page = segs[1] || 'home';
  try {
    if (page === 'home' || page === '') return await renderHome(env, base, lang, url);
    if (page === 'products') return await renderProducts(env, base, lang, url);
    if (page === 'product') return await renderProduct(env, base, lang, segs[2], url);
    if (page === 'about') return await renderAbout(env, base, lang, url);
    if (page === 'certificates') return await renderCerts(env, base, lang, url);
    if (page === 'contact') return await renderContact(env, base, lang, url);
  } catch (e) {
    return htmlResp(`<h1>500</h1><pre>${String(e && e.stack || e).replace(/[<>&]/g, '')}</pre>`, 500);
  }
  return layout404(env, lang, url);
}

async function renderHome(env, base, lang, url) {
  const featured = await db.all(env, `SELECT p.*, c.slug AS cat_slug, c.name_zh AS cat_zh, c.name_en AS cat_en
    FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.status='active' AND p.featured=1 ORDER BY p.sort_order, p.id LIMIT 8`);
  const latest = await db.all(env, `SELECT p.*, c.slug AS cat_slug FROM products p LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.status='active' ORDER BY p.id DESC LIMIT 4`);
  const certs = await db.all(env, 'SELECT * FROM certificates ORDER BY sort_order, id LIMIT 6');
  const banners = await db.all(env, 'SELECT * FROM banners WHERE status=1 ORDER BY sort_order, id');
  const html = templates.home(Object.assign({}, base, {
    featured, latest, certs, banners,
    title: `${base.company['name_' + lang] || '中药材出口'} | ${base.t('hero.title')}`,
    active: 'home',
  }));
  return htmlResp(html);
}

async function renderProducts(env, base, lang, url) {
  const cat = url.searchParams.get('cat') || '';
  const q = url.searchParams.get('q') || '';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
  const where = ["p.status='active'"];
  const params = [];
  if (cat) { where.push('c.slug = ?'); params.push(cat); }
  if (q.trim()) {
    where.push('(p.name_zh LIKE ? OR p.name_en LIKE ? OR p.pinyin LIKE ? OR p.latin_name LIKE ? OR p.desc_zh LIKE ? OR p.desc_en LIKE ?)');
    const like = `%${q.trim()}%`;
    for (let i = 0; i < 6; i++) params.push(like);
  }
  const wsql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = await db.get(env, `SELECT COUNT(*) AS n FROM products p LEFT JOIN categories c ON c.id=p.category_id ${wsql}`, params);
  const total = totalRow ? totalRow.n : 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const cur = Math.min(page, pageCount);
  const products = await db.all(env, `SELECT p.*, c.slug AS cat_slug, c.name_zh AS cat_zh, c.name_en AS cat_en
    FROM products p LEFT JOIN categories c ON c.id=p.category_id ${wsql}
    ORDER BY p.sort_order, p.id LIMIT ? OFFSET ?`, [...params, PAGE_SIZE, (cur - 1) * PAGE_SIZE]);
  const html = templates.products(Object.assign({}, base, {
    products, total, pageCount, cur, cat, q,
    title: `${base.t('nav.products')} | ${base.company['name_' + lang] || ''}`,
    active: 'products',
  }));
  return htmlResp(html);
}

async function renderProduct(env, base, lang, slug, url) {
  if (!slug) return layout404(env, lang, url);
  const p = await db.get(env, `SELECT p.*, c.slug AS cat_slug, c.name_zh AS cat_zh, c.name_en AS cat_en
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.slug=?`, [slug]);
  if (!p) return layout404(env, lang, url);
  await db.run(env, 'UPDATE products SET views = views + 1 WHERE id=?', [p.id]);
  const related = await db.all(env, `SELECT * FROM products WHERE status='active' AND category_id=? AND id<>? ORDER BY sort_order, id LIMIT 4`, [p.category_id, p.id]);
  const d = lang === 'zh' ? (p.desc_zh || p.desc_en) : (p.desc_en || p.desc_zh);
  const html = templates.product(Object.assign({}, base, {
    p, related,
    title: `${p['name_' + lang]} | ${p.latin_name || ''}`,
    description: String(d || '').slice(0, 150),
    active: 'products',
  }));
  return htmlResp(html);
}

async function renderAbout(env, base, lang, url) {
  const certs = await db.all(env, 'SELECT * FROM certificates ORDER BY sort_order, id');
  const html = templates.about(Object.assign({}, base, {
    certs,
    title: `${base.t('about.title')} | ${base.company['name_' + lang] || ''}`,
    active: 'about',
  }));
  return htmlResp(html);
}

async function renderCerts(env, base, lang, url) {
  const certs = await db.all(env, 'SELECT * FROM certificates ORDER BY sort_order, id');
  const html = templates.certificates(Object.assign({}, base, {
    certs,
    title: `${base.t('cert.title')} | ${base.company['name_' + lang] || ''}`,
    active: 'certificate',
  }));
  return htmlResp(html);
}

async function renderContact(env, base, lang, url) {
  const productId = url.searchParams.get('product') || '';
  let product = null;
  if (productId) product = await db.get(env, 'SELECT * FROM products WHERE id=?', [Number(productId)]);
  const html = templates.contact(Object.assign({}, base, {
    product,
    title: `${base.t('contact.title')} | ${base.company['name_' + lang] || ''}`,
    active: 'contact',
  }));
  return htmlResp(html);
}

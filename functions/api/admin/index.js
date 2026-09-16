/**
 * 后台 API 路由（Cloudflare Pages Functions catch-all）
 * 对应原 server/routes/admin.js。鉴权改用 HMAC-SHA256 Token（HttpOnly cookie），
 * 数据库走 D1（异步）。图片上传改为「图片 URL」字段（R2 对象存储接入前先用 URL）。
 */
import crypto from 'node:crypto';
import * as db from '../../db.js';
import { ensureReady } from '../../seed-data.js';
import { T } from '../../i18n.js';

const COOKIE = 'admin_token';
// SECRET 必须在请求作用域内求值（env 仅 onRequest 内可用），此处先给默认值，onRequest 里再覆盖
let SECRET = (process.env && process.env.ADMIN_SECRET) || 'CHANGE_ME_ADMIN_SECRET';

function makeToken(user) {
  const exp = Date.now() + 7 * 864e5;
  const body = `${user}.${exp}`;
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyToken(tok) {
  if (!tok) return null;
  const parts = String(tok).split('.');
  if (parts.length !== 3) return null;
  const [user, exp, sig] = parts;
  if (!user || !exp || !sig) return null;
  if (Date.now() > Number(exp)) return null;
  const body = `${user}.${exp}`;
  const s = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return s === sig ? user : null;
}
function parseCookies(req) {
  const h = req.headers.get('cookie') || '';
  const out = {};
  h.split(';').forEach((s) => {
    const i = s.indexOf('=');
    if (i > -1) out[s.slice(0, i).trim()] = decodeURIComponent(s.slice(i + 1).trim());
  });
  return out;
}
function setCookie(user) {
  const tok = makeToken(user);
  return `${COOKIE}=${tok}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 86400}`;
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8' }, headers),
  });
}
async function bodyOf(req) {
  try { return await req.json(); } catch (_) { return {}; }
}
function slugify(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9一-龥]+/g, '-').replace(/^-|-$/g, '') || `item-${Date.now()}`;
}

const PRODUCT_FIELDS = [
  'slug', 'category_id', 'name_zh', 'name_en', 'pinyin', 'latin_name',
  'origin_zh', 'origin_en', 'part_zh', 'part_en', 'grade_zh', 'grade_en',
  'spec_zh', 'spec_en', 'moisture', 'ash', 'package_zh', 'package_en',
  'moq', 'price_min', 'price_max', 'unit', 'shelf_life',
  'storage_zh', 'storage_en', 'desc_zh', 'desc_en', 'usage_zh', 'usage_en',
  'certs', 'image', 'featured', 'status', 'sort_order',
];

export async function onRequest(context) {
  const { request, env } = context;
  SECRET = (env && env.ADMIN_SECRET) || (process.env && process.env.ADMIN_SECRET) || 'CHANGE_ME_ADMIN_SECRET';
  await ensureReady(env);

  const sp = (context.params.path || '').replace(/^\/+|\/+$/g, '');
  const parts = sp ? sp.split('/') : [];
  const head = parts[0] || '';
  const method = request.method.toUpperCase();

  // 公开接口
  if (head === 'login' && method === 'POST') {
    const b = await bodyOf(request);
    const u = await db.get(env, 'SELECT * FROM admins WHERE username=?', [b.username]);
    if (!u) return json({ ok: false, msg: '账号或密码错误' }, 401);
    const hash = crypto.scryptSync(String(b.password || ''), u.salt, 64).toString('hex');
    if (hash !== u.password_hash) return json({ ok: false, msg: '账号或密码错误' }, 401);
    return json({ ok: true, username: u.username }, 200, { 'Set-Cookie': setCookie(u.username) });
  }
  if (head === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'Set-Cookie': `${COOKIE}=; Path=/; HttpOnly; Max-Age=0` });
  }
  if (head === 'me' && method === 'GET') {
    const u = verifyToken(parseCookies(request)[COOKIE]);
    if (!u) return json({ ok: false }, 401);
    return json({ ok: true, username: u });
  }
  if (head === 'upload' && method === 'POST') {
    return json({ ok: false, msg: '请改用图片 URL（R2 对象存储暂未接入）' }, 400);
  }

  // 其余接口需登录
  const user = verifyToken(parseCookies(request)[COOKIE]);
  if (!user) return json({ ok: false, msg: '未登录或登录已过期' }, 401);

  try {
    /* ---------- 仪表盘 ---------- */
    if (head === 'stats' && method === 'GET') {
      const products = (await db.get(env, 'SELECT COUNT(*) n FROM products')).n;
      const active = (await db.get(env, "SELECT COUNT(*) n FROM products WHERE status='active'")).n;
      const categories = (await db.get(env, 'SELECT COUNT(*) n FROM categories')).n;
      const inquiries = (await db.get(env, 'SELECT COUNT(*) n FROM inquiries')).n;
      const unread = (await db.get(env, "SELECT COUNT(*) n FROM inquiries WHERE status='new'")).n;
      const recent = await db.all(env, 'SELECT * FROM inquiries ORDER BY id DESC LIMIT 6');
      const top = await db.all(env, 'SELECT id,name_zh,name_en,views FROM products ORDER BY views DESC LIMIT 5');
      return json({ ok: true, products, active, categories, inquiries, unread, recent, top });
    }

    /* ---------- 产品 ---------- */
    if (head === 'products') {
      if (method === 'GET') {
        const q = urlParam(request, 'q');
        const cat = urlParam(request, 'cat');
        const status = urlParam(request, 'status');
        const where = [];
        const params = [];
        if (q) {
          where.push('(p.name_zh LIKE ? OR p.name_en LIKE ? OR p.pinyin LIKE ? OR p.latin_name LIKE ?)');
          const like = `%${q}%`;
          params.push(like, like, like, like);
        }
        if (cat) { where.push('p.category_id=?'); params.push(Number(cat)); }
        if (status) { where.push('p.status=?'); params.push(status); }
        const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const rows = await db.all(env, `SELECT p.*, c.name_zh AS cat_zh, c.name_en AS cat_en
          FROM products p LEFT JOIN categories c ON c.id=p.category_id ${w} ORDER BY p.sort_order, p.id DESC`, params);
        return json({ ok: true, data: rows });
      }
      if (method === 'POST') {
        const b = await bodyOf(request);
        if (!b.name_zh && !b.name_en) return json({ ok: false, msg: '请填写产品名' }, 400);
        let slug = slugify(b.slug || b.name_en || b.name_zh);
        let k = 2;
        while (await db.get(env, 'SELECT 1 FROM products WHERE slug=?', [slug])) slug = `${slugify(b.slug || b.name_en)}-${k++}`;
        const vals = PRODUCT_FIELDS.map((f) => {
          if (f === 'slug') return slug;
          if (f === 'category_id') return b.category_id ? Number(b.category_id) : null;
          if (['price_min', 'price_max', 'sort_order', 'featured'].includes(f)) return Number(b[f] || 0);
          return b[f] === undefined ? '' : b[f];
        });
        const info = await db.run(env, `INSERT INTO products (${PRODUCT_FIELDS.join(',')}) VALUES (${PRODUCT_FIELDS.map(() => '?').join(',')})`, vals);
        return json({ ok: true, id: info.lastInsertRowid, slug });
      }
    }
    if (head === 'products' && parts[1] && method === 'GET') {
      const row = await db.get(env, 'SELECT * FROM products WHERE id=?', [Number(parts[1])]);
      if (!row) return json({ ok: false, msg: '不存在' }, 404);
      return json({ ok: true, data: row });
    }
    if (head === 'products' && parts[1] && method === 'PUT') {
      const b = await bodyOf(request);
      const exists = await db.get(env, 'SELECT id,slug FROM products WHERE id=?', [Number(parts[1])]);
      if (!exists) return json({ ok: false, msg: '不存在' }, 404);
      const sets = [];
      const vals = [];
      PRODUCT_FIELDS.forEach((f) => {
        if (f === 'slug') return;
        if (b[f] === undefined) return;
        let v = b[f];
        if (f === 'category_id') v = v ? Number(v) : null;
        if (['price_min', 'price_max', 'sort_order', 'featured'].includes(f)) v = Number(v || 0);
        sets.push(`${f}=?`);
        vals.push(v);
      });
      if (b.slug && b.slug !== exists.slug) { sets.push('slug=?'); vals.push(slugify(b.slug)); }
      if (!sets.length) return json({ ok: true });
      sets.push("updated_at=datetime('now')");
      await db.run(env, `UPDATE products SET ${sets.join(',')} WHERE id=?`, [...vals, Number(parts[1])]);
      return json({ ok: true });
    }
    if (head === 'products' && parts[1] && method === 'DELETE') {
      await db.run(env, 'DELETE FROM products WHERE id=?', [Number(parts[1])]);
      return json({ ok: true });
    }

    /* ---------- 分类 ---------- */
    if (head === 'categories' && method === 'GET') {
      return json({ ok: true, data: await db.all(env, 'SELECT * FROM categories ORDER BY sort_order, id') });
    }
    if (head === 'categories' && method === 'POST') {
      const b = await bodyOf(request);
      if (!b.name_zh && !b.name_en) return json({ ok: false, msg: '请填写分类名' }, 400);
      let slug = slugify(b.slug || b.name_en || b.name_zh);
      let k = 2;
      while (await db.get(env, 'SELECT 1 FROM categories WHERE slug=?', [slug])) slug = `${slug}-${k++}`;
      const info = await db.run(env, 'INSERT INTO categories (slug,name_zh,name_en,desc_zh,desc_en,icon,sort_order) VALUES (?,?,?,?,?,?,?)',
        [slug, b.name_zh || '', b.name_en || '', b.desc_zh || '', b.desc_en || '', b.icon || 'leaf', Number(b.sort_order) || 0]);
      return json({ ok: true, id: info.lastInsertRowid, slug });
    }
    if (head === 'categories' && parts[1] && method === 'PUT') {
      const b = await bodyOf(request);
      await db.run(env, 'UPDATE categories SET slug=?, name_zh=?, name_en=?, desc_zh=?, desc_en=?, icon=?, sort_order=? WHERE id=?',
        [slugify(b.slug) || undefined, b.name_zh || '', b.name_en || '', b.desc_zh || '', b.desc_en || '',
          b.icon || 'leaf', Number(b.sort_order) || 0, Number(parts[1])]);
      return json({ ok: true });
    }
    if (head === 'categories' && parts[1] && method === 'DELETE') {
      await db.run(env, 'UPDATE products SET category_id=NULL WHERE category_id=?', [Number(parts[1])]);
      await db.run(env, 'DELETE FROM categories WHERE id=?', [Number(parts[1])]);
      return json({ ok: true });
    }

    /* ---------- 询盘 ---------- */
    if (head === 'inquiries' && method === 'GET') {
      const status = urlParam(request, 'status');
      const q = urlParam(request, 'q');
      const where = [];
      const params = [];
      if (status) { where.push('status=?'); params.push(status); }
      if (q) {
        where.push('(name LIKE ? OR email LIKE ? OR company LIKE ? OR message LIKE ?)');
        const like = `%${q}%`;
        params.push(like, like, like, like);
      }
      const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
      return json({ ok: true, data: await db.all(env, `SELECT * FROM inquiries ${w} ORDER BY id DESC`, params) });
    }
    if (head === 'inquiries' && parts[1] === 'export' && method === 'GET') {
      const rows = await db.all(env, 'SELECT * FROM inquiries ORDER BY id DESC');
      const esc = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
      const head = ['ID', 'Date', 'Product', 'Name', 'Email', 'Phone', 'Company', 'Country', 'Qty', 'Message', 'Status'];
      const lines = [head.join(',')];
      rows.forEach((r) => lines.push([r.id, r.created_at, r.product_name, r.name, r.email, r.phone, r.company, r.country, r.quantity, r.message, r.status].map(esc).join(',')));
      return new Response('﻿' + lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="inquiries.csv"',
        },
      });
    }
    if (head === 'inquiries' && parts[1] && method === 'PATCH') {
      const b = await bodyOf(request);
      const sets = [];
      const vals = [];
      ['status', 'note'].forEach((f) => { if (b[f] !== undefined) { sets.push(`${f}=?`); vals.push(b[f]); } });
      if (!sets.length) return json({ ok: true });
      await db.run(env, `UPDATE inquiries SET ${sets.join(',')} WHERE id=?`, [...vals, Number(parts[1])]);
      return json({ ok: true });
    }
    if (head === 'inquiries' && parts[1] && method === 'DELETE') {
      await db.run(env, 'DELETE FROM inquiries WHERE id=?', [Number(parts[1])]);
      return json({ ok: true });
    }

    /* ---------- 公司信息 ---------- */
    if (head === 'company' && method === 'GET') {
      return json({ ok: true, data: (await db.get(env, 'SELECT * FROM company WHERE id=1')) || {} });
    }
    if (head === 'company' && method === 'PUT') {
      const b = await bodyOf(request);
      const FIELDS = ['name_zh', 'name_en', 'intro_zh', 'intro_en', 'address_zh', 'address_en',
        'phone', 'whatsapp', 'email', 'website', 'worktime_zh', 'worktime_en',
        'year_founded', 'employees', 'factory_area', 'main_market', 'annual_output'];
      const sets = FIELDS.filter((f) => b[f] !== undefined).map((f) => `${f}=?`);
      if (!sets.length) return json({ ok: true });
      const vals = FIELDS.filter((f) => b[f] !== undefined).map((f) => b[f]);
      await db.run(env, `UPDATE company SET ${sets.join(',')}, updated_at=datetime('now') WHERE id=1`, vals);
      return json({ ok: true });
    }

    /* ---------- 证书 ---------- */
    if (head === 'certificates' && method === 'GET') {
      return json({ ok: true, data: await db.all(env, 'SELECT * FROM certificates ORDER BY sort_order, id') });
    }
    if (head === 'certificates' && method === 'POST') {
      const b = await bodyOf(request);
      const info = await db.run(env, 'INSERT INTO certificates (name_zh,name_en,issuer_zh,issuer_en,image,sort_order) VALUES (?,?,?,?,?,?)',
        [b.name_zh || '', b.name_en || '', b.issuer_zh || '', b.issuer_en || '', b.image || '', Number(b.sort_order) || 0]);
      return json({ ok: true, id: info.lastInsertRowid });
    }
    if (head === 'certificates' && parts[1] && method === 'PUT') {
      const b = await bodyOf(request);
      await db.run(env, 'UPDATE certificates SET name_zh=?, name_en=?, issuer_zh=?, issuer_en=?, image=?, sort_order=? WHERE id=?',
        [b.name_zh || '', b.name_en || '', b.issuer_zh || '', b.issuer_en || '', b.image || '', Number(b.sort_order) || 0, Number(parts[1])]);
      return json({ ok: true });
    }
    if (head === 'certificates' && parts[1] && method === 'DELETE') {
      await db.run(env, 'DELETE FROM certificates WHERE id=?', [Number(parts[1])]);
      return json({ ok: true });
    }

    /* ---------- Banner ---------- */
    if (head === 'banners' && method === 'GET') {
      return json({ ok: true, data: await db.all(env, 'SELECT * FROM banners ORDER BY sort_order, id') });
    }
    if (head === 'banners' && method === 'POST') {
      const b = await bodyOf(request);
      const info = await db.run(env, 'INSERT INTO banners (title_zh,title_en,subtitle_zh,subtitle_en,image,sort_order,status) VALUES (?,?,?,?,?,?,?)',
        [b.title_zh || '', b.title_en || '', b.subtitle_zh || '', b.subtitle_en || '', b.image || '',
          Number(b.sort_order) || 0, b.status === false ? 0 : 1]);
      return json({ ok: true, id: info.lastInsertRowid });
    }
    if (head === 'banners' && parts[1] && method === 'PUT') {
      const b = await bodyOf(request);
      await db.run(env, 'UPDATE banners SET title_zh=?, title_en=?, subtitle_zh=?, subtitle_en=?, image=?, sort_order=?, status=? WHERE id=?',
        [b.title_zh || '', b.title_en || '', b.subtitle_zh || '', b.subtitle_en || '', b.image || '',
          Number(b.sort_order) || 0, b.status === false ? 0 : 1, Number(parts[1])]);
      return json({ ok: true });
    }
    if (head === 'banners' && parts[1] && method === 'DELETE') {
      await db.run(env, 'DELETE FROM banners WHERE id=?', [Number(parts[1])]);
      return json({ ok: true });
    }

    /* ---------- 站点文案 ---------- */
    if (head === 'i18n' && method === 'GET') {
      const rows = await db.all(env, 'SELECT * FROM i18n');
      const map = {};
      rows.forEach((r) => { map[r.key] = { zh: r.value_zh, en: r.value_en }; });
      const builtin = Object.entries(T).map(([key, v]) => ({ key, zh: v.zh, en: v.en }));
      return json({ ok: true, builtin, overrides: map });
    }
    if (head === 'i18n' && method === 'PUT') {
      const b = await bodyOf(request);
      if (!b.key) return json({ ok: false }, 400);
      await db.run(env, `INSERT INTO i18n (key, value_zh, value_en) VALUES (?,?,?)
        ON CONFLICT(key) DO UPDATE SET value_zh=excluded.value_zh, value_en=excluded.value_en`,
        [b.key, b.value_zh || '', b.value_en || '']);
      return json({ ok: true });
    }
    if (head === 'i18n' && parts[1] && method === 'DELETE') {
      const key = decodeURIComponent(parts[1]);
      await db.run(env, 'DELETE FROM i18n WHERE key=?', [key]);
      return json({ ok: true });
    }

    /* ---------- 修改密码 ---------- */
    if (head === 'password' && method === 'PUT') {
      const b = await bodyOf(request);
      const u = await db.get(env, 'SELECT * FROM admins WHERE username=?', [user]);
      if (!u) return json({ ok: false }, 404);
      if (crypto.scryptSync(String(b.old_password || ''), u.salt, 64).toString('hex') !== u.password_hash) {
        return json({ ok: false, msg: '原密码不正确' }, 400);
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(String(b.new_password || ''), salt, 64).toString('hex');
      await db.run(env, 'UPDATE admins SET salt=?, password_hash=? WHERE id=?', [salt, hash, u.id]);
      return json({ ok: true });
    }

    return json({ ok: false, msg: 'not_found' }, 404);
  } catch (e) {
    return json({ ok: false, msg: String(e && e.message || e) }, 500);
  }
}

function urlParam(request, name) {
  return new URL(request.url).searchParams.get(name) || '';
}

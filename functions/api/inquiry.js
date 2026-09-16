/**
 * 公开询盘提交接口 —— POST /api/inquiry
 * 前台联系表单调用；不鉴权。
 */
import * as db from '../db.js';

export async function onRequestPost(context) {
  const env = context.env;
  const req = context.request;
  let body = {};
  try {
    body = await req.json();
  } catch (_) {
    body = {};
  }
  const { name, email, phone, company, country, quantity, message, product_id } = body || {};

  if (!name || !String(name).trim() || !email || !String(email).trim()) {
    return json({ ok: false, msg: 'missing_fields' }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email))) {
    return json({ ok: false, msg: 'bad_email' }, 400);
  }

  let productName = '';
  if (product_id) {
    const p = await db.get(env, 'SELECT name_zh, name_en FROM products WHERE id=?', [Number(product_id)]);
    if (p) productName = `${p.name_zh} / ${p.name_en}`;
  }

  await db.run(
    env,
    `INSERT INTO inquiries (product_id, product_name, name, email, phone, company, country, quantity, message)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [
      product_id ? Number(product_id) : null, productName, name, email, phone || '',
      company || '', country || '', quantity || '', message || '',
    ]
  );
  return json({ ok: true });
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

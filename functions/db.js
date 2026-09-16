/**
 * 数据库层：Cloudflare D1（边缘 SQLite，异步 API）
 * 对上层暴露 db.get / db.all / db.run / db.exec（全部 async），
 * 参数统一为位置参数数组，上层无需关心底层实现。
 *
 * D1 与本地 SQLite 的差异：
 *  - 所有操作都是异步的（返回 Promise）
 *  - 单值 / 多值 / 写操作分别用 first() / all() / run()
 *  - run() 的结果在 meta 里：last_row_id / changes
 *  - 不支持一次性 exec 多条语句，exec() 已做拆分
 */

function norm(p) {
  if (p === undefined || p === null) return null;
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (typeof p === 'number' && !Number.isFinite(p)) return null;
  return p;
}
const params = (arr) => (Array.isArray(arr) ? arr : [arr]).map(norm);

/** 查询单行，无结果返回 null */
export async function get(env, sql, p = []) {
  const r = await env.DB.prepare(sql).bind(...params(p)).first();
  return r || null;
}

/** 查询多行，返回数组 */
export async function all(env, sql, p = []) {
  const r = await env.DB.prepare(sql).bind(...params(p)).all();
  return (r && r.results) || [];
}

/** 写操作，返回 { changes, lastInsertRowid } */
export async function run(env, sql, p = []) {
  const r = await env.DB.prepare(sql).bind(...params(p)).run();
  return {
    changes: (r && r.meta && r.meta.changes) || 0,
    lastInsertRowid: Number((r && r.meta && r.meta.last_row_id) || 0),
  };
}

/** 拆分执行多条 DDL/DML（D1 不支持单语句 exec 批量） */
export async function exec(env, sql) {
  const stmts = String(sql).split(';')
    .map((s) => s.trim())
    .filter((s) => s && !/^PRAGMA/i.test(s) && !/^--/.test(s));
  for (const s of stmts) {
    await env.DB.prepare(s).run();
  }
}

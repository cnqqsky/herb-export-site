/**
 * Cloudflare Worker 入口
 * --------------------------------------------------------------------------
 * 把原先的 Cloudflare Pages Functions（functions/site.js、functions/api/admin、
 * functions/api/inquiry）统一到一个「Worker + Assets」部署里，从而：
 *   - 支持前台 SSR（EJS 服务端渲染）
 *   - 支持后台管理 API（HMAC Token 鉴权）
 *   - 支持静态资源（admin.html / css / js / 图片，走 ASSETS 绑定）
 *   - 数据库走 D1（env.DB）
 *
 * 路由：
 *   /api/inquiry*        → functions/api/inquiry.js  (POST，公开)
 *   /api/admin*          → functions/api/admin/index.js（部分公开，部分需登录）
 *   带扩展名的路径        → 静态资源（env.ASSETS）
 *   其余（/、/zh/*、/en/*）→ 前台 SSR（functions/site.js）
 */
import { onRequest as siteHandler } from './functions/site.js';
import { onRequest as adminHandler } from './functions/api/admin/index.js';
import { onRequestPost as inquiryHandler } from './functions/api/inquiry.js';

const ADMIN_PREFIX = '/api/admin';
const INQUIRY_PREFIX = '/api/inquiry';

/** 路径最后一段是否带文件扩展名（用于区分静态资源与 SSR 路由） */
function hasFileExt(pathname) {
  const seg = pathname.split('/').pop() || '';
  return seg.includes('.');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 1) 公开询盘接口
    if (path === INQUIRY_PREFIX || path.startsWith(INQUIRY_PREFIX + '/')) {
      if (request.method.toUpperCase() !== 'POST') {
        return json({ ok: false, msg: 'method_not_allowed' }, 405);
      }
      return inquiryHandler({ request, env, params: {} });
    }

    // 2) 后台 API（login / logout / me 为公开端点，其余在 handler 内鉴权）
    if (path === ADMIN_PREFIX || path.startsWith(ADMIN_PREFIX + '/')) {
      const sub = path.slice(ADMIN_PREFIX.length); // '/stats' | '/products/12' | ''
      const sp = sub.startsWith('/') ? sub.slice(1) : sub;
      return adminHandler({ request, env, params: { path: sp } });
    }

    // 3) 静态资源（admin.html / css / js / 图片等带扩展名）
    if (hasFileExt(path)) {
      const asset = await env.ASSETS.fetch(request);
      if (asset && asset.status < 400) return asset;
      return new Response('Not Found', {
        status: 404,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    // 4) 前台 SSR
    return siteHandler({ request, env, params: {} });
  },
};

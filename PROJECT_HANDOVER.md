# herb-export-site 项目交接文档

> 中药材出口外贸中英双语站。**已上线生产**，本文件供新会话快速接手继续开发。
> 最后更新：2026-09-16

---

## 1. 项目目标

面向海外买家的**中药材出口外贸官网 + 运营后台**：

- **前台**：中英双语 SSR 页面（首页 / 产品列表+搜索+分页 / 产品详情 / 关于 / 证书 / 联系询盘），语言自动识别 + 手动切换。
- **后台**：单页 SPA，管理产品 CRUD、分类、询盘 Inbox（含 CSV 导出）、公司信息、证书、Banner、UI 文案（i18n 覆盖）、改密码。
- **形态**：纯 Cloudflare 原生，无传统服务器。已从最早的 Express + SQLite 全栈迁移完毕。

**线上地址**：`https://herb-export-site.hailangi.workers.dev`
**当前生产版本**：`db17f85a-95fc-4c31-8fb2-d55e47cc808c`
**后台入口**：`/admin` → 302 → `/admin.html`，账号 `admin` / `admin123`（**上线后应改密码**）

---

## 2. 当前目录结构

```
herb-export-site/
├── worker.js                    # Worker 入口：路由分发（API / 静态 / SSR）
├── wrangler.toml                # CF 配置：D1 绑定 + Assets 绑定
├── build-templates.mjs          # 构建：views/*.ejs → functions/templates.cjs
├── init.sql                     # 生产 D1 播种 SQL（已执行，可复现）
├── package.json                 # ⚠ scripts 已过期（仍写 wrangler pages），勿用
│
├── views/                       # 【构建源】EJS 模板，改这里必须重跑 build-templates.mjs
│   ├── home/products/product/about/certificates/contact/404.ejs
│   └── partials/{head,foot,product-card}.ejs
│
├── functions/                   # 【部署代码】运行时被 worker.js 引入
│   ├── templates.cjs            # 构建产物（145KB，勿手改，勿提交手工编辑）
│   ├── site.js                  # 前台 SSR 路由 + 渲染
│   ├── seed-data.js             # 表结构 SCHEMA + 演示数据（已 export 常量）
│   ├── db.js                    # D1 封装：db.get/all/run/exec(env, sql, params)
│   ├── i18n.js                  # 双语字典 + makeT()
│   ├── helpers.js               # fmtPrice / thumb
│   └── api/
│       ├── inquiry.js           # POST 公开询盘
│       └── admin/index.js       # 后台全部 API（17KB，路由见下）
│
├── public/                      # 【静态资源】走 ASSETS 绑定
│   ├── admin.html               # 后台 SPA 外壳
│   ├── css/{site,admin}.css
│   └── js/{site,admin}.js       # admin.js = 后台全部逻辑（35KB）
│
├── data/ + server/ + test_region.js   # 【遗留】旧 Express+SQLite 版，.gitignore 已排除，不再部署
└── cleanup_done.txt / kill.txt / net.txt / server.log   # 垃圾文件，可删
```

**GitHub 备份仓库**：`https://github.com/cnqqsky/herb-export-site`（分支 `main`）

---

## 3. 已完成的功能

**前台（SSR，全站双语）**
| 路由 | 说明 |
|---|---|
| `/` | 按 cookie → Accept-Language 重定向到 `/zh` 或 `/en`（302） |
| `/{lang}` | 首页：Banner + 推荐产品 + 最新产品 + 证书 |
| `/{lang}/products` | 列表：`?cat=` 分类筛选、`?q=` 关键词搜索（名称/拼音/拉丁名/描述）、`?page=` 分页（12/页） |
| `/{lang}/product/{slug}` | 详情：参数、描述、用途、相关产品、浏览量 +1 |
| `/{lang}/about` `/certificates` `/contact` | 关于 / 证书 / 联系（`?product=id` 带产品询盘） |

**后台 API**（`functions/api/admin/index.js`，HMAC Cookie 鉴权）
- 公开：`POST /login`、`POST /logout`、`GET /me`；`POST /upload` → **返回 400 未实现**
- 需登录：`GET /stats`；`products` `categories` `certificates` `banners` `i18n` 的 GET/POST/PUT/:id/DELETE/:id；`inquiries` 的 GET（含筛选）、`GET /export`（CSV）、PATCH、DELETE；`company` GET/PUT；`PUT /password`

**其他**
- 公开询盘 `POST /api/inquiry` → 写入 D1 `inquiries` 表
- 数据：7 分类 + **47 味中药材**完整双语资料 + 6 证书 + 3 Banner + 公司信息 + 78 条 UI 文案
- 无产品图时用 CSS「标本卡」占位（分类配色 + 中文名 + 拉丁名），不依赖外部图片

---

## 4. 正在开发的功能

**当前无进行中的开发**——已交付并上线。以下为**已知半成品**：

- **图片上传**：`POST /api/admin/upload` 是 stub，固定返回 `400 请改用图片 URL（R2 对象存储暂未接入）`。目前产品图只能填外链 URL。
- **i18n 后台编辑**：接口齐全，但仅覆盖 `i18n` 表内的 key，硬编码在模板里的文案改不了。

---

## 5. 关键技术栈

| 层 | 选型 |
|---|---|
| 运行时 | Cloudflare **Worker** + `[assets]`（`run_worker_first=true`） |
| 数据库 | Cloudflare **D1**（边缘 SQLite），绑定名 `env.DB` |
| 渲染 | EJS —— **构建期预编译**为真实 JS 函数（详见第 9 节） |
| 鉴权 | HMAC-SHA256 签名 cookie `admin_token`（HttpOnly）；密码 `crypto.scryptSync` 加盐哈希 |
| 前端 | 原生 JS，无框架；后台 SPA 单页 |
| 部署 | `wrangler deploy`（**不是** `wrangler pages deploy`） |
| 兼容标志 | `compatibility_date = 2024-09-23` + `nodejs_compat` |

**D1**：`database_name = herb_export_site`，`id = 8e1efab3-9da9-492c-902e-a6cf7db0074a`

---

## 6. 重要文件说明

| 文件 | 关键点 |
|---|---|
| `worker.js` | 路由分发顺序：`/api/inquiry` → `/api/admin` → **带扩展名**→ASSETS → 其余→SSR。改路由看这里。 |
| `wrangler.toml` | `html_handling="none"` 与 `not_found_handling="none"` **不可改**（见第 9 节）。 |
| `build-templates.mjs` | 把 `views/*.ejs` 编译成 `functions/templates.cjs`。**改任何 EJS 后必须重跑**。 |
| `functions/templates.cjs` | 预编译产物，`exports.templates` + `exports.productCardTemplate`。**不要手改**。 |
| `functions/seed-data.js` | `SCHEMA` 建表语句 + 演示数据；`maybeSeed()` 在 `products=0` 时才播种（生产已预播种，实际走不到）。7 个常量已 `export` 供复用。 |
| `functions/db.js` | 所有方法**第一个参数是 `env`**：`db.get(env, sql, params)`。调用别漏 `env`。 |
| `init.sql` | 生产 D1 播种文件（schema + 全部数据 + admin）。重建环境时 `--remote --file=init.sql` 一把梭。 |
| `public/js/admin.js` | 后台全部交互逻辑（35KB），改后台功能主要动这里 + `admin/index.js`。 |

---

## 7. 已知问题

1. **`package.json` scripts 已过期**：仍写 `wrangler pages dev/deploy`。实际部署用 `wrangler deploy`。勿直接 `npm run deploy`。
2. **图片上传未实现**：R2 未接入，只能填图片 URL（见第 4 节）。
3. **`views/` 目录容易被误删**：它不是旧版残留，是 `build-templates.mjs` 的**构建源**。
4. **管理密码仍为默认** `admin123`，公开站点应尽快改。
5. **`data/` `server/` 是死代码**：旧 Express 版，已被 `.gitignore` 排除，不参与部署，但占本地空间。
6. 本地遗留垃圾文件：`cleanup_done.txt` / `kill.txt` / `net.txt` / `server.log`。

---

## 8. 下一步要做什么（按优先级）

1. **改默认密码**：登录后 `PUT /api/admin/password`，或重跑 `init.sql` 前改掉 `admin123`。
2. **接入 R2 做图片上传**：替换 `admin/index.js` 里 `upload` 的 stub（第 94 行附近），补 R2 绑定 + `wrangler.toml` `[[r2_buckets]]`。
3. **修正 `package.json` scripts**：改成 `wrangler dev` / `wrangler deploy`，并加 `predeploy: node build-templates.mjs`。
4. **补真实产品图**：目前靠标本卡占位，外贸站需要真实图。
5. **清理遗留**：删 `data/`、`server/`、`test_region.js` 及几个 txt 垃圾文件。
6. **（可选）绑定自定义域名** + CF 控制台连 Git 获得 push-to-deploy（当前是手动 `wrangler deploy`）。
7. **（可选）清理 GitHub 仓库里的旧 `views/` 包袱**：注意现在 `views/` 是构建源，**不能删**，应保留并确认是最新的。

---

## 9. 不能改动 / 需要注意的约束

### 🔴 硬约束（改了就崩）

1. **禁止 EJS 运行时渲染**。Cloudflare Workers 禁 `new Function` / `eval`（抛 `EvalError: Code generation from strings disallowed`），且 esbuild 强制 ESM 后 `with` 语句也非法。
   → 必须用 `build-templates.mjs` 在**构建期**预编译（`_with:false` + `destructuredLocals` 解构式）。
   → **改完 `views/*.ejs` 必须执行 `node build-templates.mjs`，否则线上不生效。**
2. **`wrangler.toml` 的 `html_handling` / `not_found_handling` 必须保持 `"none"`**。
   曾用默认 `auto-trailing-slash` 导致 `/admin` → `/admin.html` 与 Worker 的 `/admin`→`/admin.html` **重定向死循环**。
3. **Workers 无持久文件系统**。`functions/` 里不能用 `fs` 写盘（已确认无 fs 引用，不要引入）；文件存储必须走 R2。
4. **`db.js` 所有方法首参是 `env`**。历史上 `seed-data.js` 的 admin 插入漏传 `env` 导致后台永远 401。
5. **产品 slug 由英文名生成**：`name_en.toLowerCase().replace(/[^a-z0-9]+/g,'-')`。
   例：`Ginseng Root (White Ginseng)` → `ginseng-root-white-ginseng`，**不是** `ginseng`。调试 404 先查 slug。
6. **部署命令是 `wrangler deploy`**（Worker + Assets），不是 Pages。

### 🟡 环境约束（本机）

- **代理 `HTTPS_PROXY` 只放行白名单**：`api.cloudflare.com`、`api.github.com` 通，但 **`*.workers.dev` 返回 502**。
  → 沙箱内**无法 curl 线上 URL 自测**，需用户在自己浏览器验证。
  → `wrangler d1 execute --remote` **可用**（走 api.cloudflare.com）。
- **`git push` 走不通**（`github.com:443` 被挡）。推 GitHub 用 `gh api` Contents API（JSON 走 `--input -` 传 stdin，避 Windows 32KB 参数上限）。
- **Bash 工具残缺**：`cd`/`dirname`/`cat`/`head` 不可用，统一用 `node -e` + 原生 Windows 路径（`D:/...`）。
- 用**系统 Node** `D:/软件/nodejs/node.exe`（托管 Node 路径会错乱）；wrangler 在 `C:/Users/haila/AppData/Roaming/npm/node_modules/wrangler/bin/wrangler.js`。

### 🟢 部署 / 验证速查

```bash
# 改模板后必跑
node build-templates.mjs

# 本地预览（本地 D1）
wrangler dev --config wrangler.toml          # 端口 8791

# 生产部署
wrangler deploy --config wrangler.toml

# 远程 D1 查询 / 播种
wrangler d1 execute herb_export_site --remote --command="SELECT COUNT(*) FROM products"
wrangler d1 execute herb_export_site --remote --file=init.sql
```

**生产 D1 当前状态（已播种，非首次访问触发）**：
products 47 / categories 7 / admins 1 / certificates 6 / banners 3 / company 1
→ `maybeSeed()` 检测到 `products>0` 会直接跳过，首访不会重新建表。

**`ADMIN_SECRET`** 已通过 `wrangler secret put` 设置（随机 32B），`wrangler secret list` 可确认。

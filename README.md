# 中药材外贸中英双语站 · 前后台一体（Cloudflare 原生版）

> Chinese Herbal Export Website — 面向海外采购商的中药材原料 / 饮片外贸官网，含完整后台管理系统。
> **技术栈（Cloudflare 原生）**：Cloudflare **Worker + [assets] 静态资源** + D1（边缘 SQLite）+ EJS 服务端渲染（构建期预编译）。
> 原 Express + better-sqlite3 版本、以及早期 Pages Functions 版本均已迁移走，无需任何 Node 服务器，`git push` 即上线。

---

## 一、架构总览

| 层 | 实现 |
|---|---|
| 请求入口 | `worker.js`（`run_worker_first = true`）：API → 静态资源 → SSR 三级分发 |
| 静态资源（CSS/JS/后台页） | `[assets]` 绑定托管 `public/` |
| 前台页面（SSR） | `functions/site.js` 用预编译后的 EJS 渲染 |
| 后台 API | `functions/api/admin/index.js` + `functions/api/inquiry.js`（HMAC cookie 鉴权） |
| 数据库 | Cloudflare D1（异步 SQLite），绑定名 `DB` |
| 登录鉴权 | HMAC-SHA256 Token，HttpOnly cookie（替代原 Express session） |
| 图片 | 改为「图片 URL」字段（R2 对象存储接入前先填 URL，避免 CF 无磁盘的限制） |

---

## 二、本地开发

```bash
# 1. 安装依赖（只需要 ejs）
npm install

# 2. 预编译 EJS 模板（部署前必跑；生成 functions/templates.cjs）
npm run build

# 3. 本地预览（需先 wrangler login）
npm run dev          # = node build-templates.mjs && wrangler dev（端口 8791）
```

> 本地预览依赖一个本地 D1：先在 `wrangler.toml` 填好 database_id（见下方「部署」），
> `wrangler pages dev` 会自动建本地库并首次访问时自动灌入演示数据。

入口（部署后）：

| 入口 | 地址 |
|---|---|
| 前台中文站 | `/zh` |
| 前台英文站 | `/en` |
| 管理后台 | `/admin`（会重定向到 `/admin.html`） |

后台账号：**admin / admin123**（登录后请在「修改密码」里改掉）。

---

## 三、前台功能

| 页面 | 路由 | 说明 |
|---|---|---|
| 首页 | `/zh` `/en` | Banner 轮播、药用部位分类、主推产品、四大优势、公司简介、证书 |
| 产品中心 | `/zh/products` | 分类筛选 + 关键词搜索（品名/拼音/拉丁学名）+ 分页 |
| 产品详情 | `/zh/product/:slug` | 规格参数表、中英文描述、功效用途、贮藏、相关产品、询盘入口 |
| 关于我们 | `/zh/about` | 公司简介（中英）、企业数据、资质列表 |
| 资质认证 | `/zh/certificates` | GMP / ISO / HACCP / 有机认证等展示 |
| 联系我们 | `/zh/contact` | 联系信息 + 询盘表单（可从产品页带入产品名） |

- 双语通过 URL 前缀切换（`/zh/…` 与 `/en/…`）；根路径 `/` 按 cookie / `Accept-Language` 自动跳转。
- 所有界面文案集中在后台「站点文案」可改，不需要动代码。
- 页面服务端渲染（EJS），title / description / keywords 自动双语生成，已输出 `hreflang` 标签利于 SEO。

---

## 四、后台功能

侧边栏九个模块：仪表盘、产品管理、分类管理、询盘管理（含导出 CSV）、公司信息、资质证书、首页 Banner、站点文案、修改密码。API 一览（均需登录 cookie）：

- `POST /api/admin/login` / `logout`、`GET /me`、`PUT /password`
- `GET /stats`
- `GET|POST /products`、`GET|PUT|DELETE /products/:id`
- `GET|POST /categories`、`PUT|DELETE /categories/:id`
- `GET /inquiries`、`PATCH|DELETE /inquiries/:id`、`GET /inquiries/export`
- `GET|PUT /company`
- `GET|POST /certificates`、`PUT|DELETE /certificates/:id`
- `GET|POST /banners`、`PUT|DELETE /banners/:id`
- `GET|PUT /i18n`、`DELETE /i18n/:key`

---

## 五、部署到 Cloudflare Workers（push 即上线）

仓库：`https://github.com/cnqqsky/herb-export-site`（生产分支 `main`）

### 方式 A：Workers Builds 连 Git（推荐，零密钥）

1. Cloudflare 控制台 → **Workers & Pages** → 选中 `herb-export-site`
2. **Settings → Builds → Connect** → 授权 GitHub → 选 `cnqqsky/herb-export-site`
3. 构建设置：
   - Git branch：`main`
   - Build command：`npm install && npm run build`
   - Deploy command：`npx wrangler deploy`
   - Root directory：留空
4. 保存后 push 一次即触发构建部署（Cloudflare 会自动生成并托管所需的 API token，无需手动配置）

> ⚠️ 控制台里的 Worker 名必须与 `wrangler.toml` 的 `name = "herb-export-site"` 一致，否则构建失败。

### 方式 B：GitHub Actions（手动兜底，需一个 CF API Token）

仓库里已内置 `.github/workflows/deploy.yml`。主链路走方式 A，为避免重复部署，该 workflow **默认只在 Actions 页面手动 Run workflow 时执行**（如需 push 自动触发，去掉文件里 `push:` 触发器的注释）。

```bash
gh secret set CLOUDFLARE_API_TOKEN -R cnqqsky/herb-export-site   # 粘贴 CF API Token
gh secret set CLOUDFLARE_ACCOUNT_ID -R cnqqsky/herb-export-site  # 已配置
```

未设置 token 时该 workflow 会**自动跳过**（不会红叉）。

### 方式 C：本地 CLI 直推（不走 Git）

```bash
npm run deploy       # = node build-templates.mjs && wrangler deploy
```

> 注意：本项目是 **Worker + Assets**，部署命令是 `wrangler deploy`，**不是** `wrangler pages deploy`。

---

## 六、目录结构

```
herb-export-site/
├─ worker.js                  # Worker 入口：/api → 静态资源 → SSR 三级路由分发
├─ wrangler.toml              # Worker + [assets] + D1 绑定配置
├─ build-templates.mjs        # 把 views/*.ejs 预编译为 functions/templates.cjs
├─ init.sql                   # 生产 D1 播种 SQL（schema + 全量数据）
├─ .github/workflows/deploy.yml  # GitHub Actions 自动部署（方式 B）
├─ scripts/github-api-push.mjs   # 本机 github.com:443 被封锁时的 API 推送兜底脚本
├─ functions/                 # 部署代码（运行时被 worker.js 引入）
│  ├─ site.js                 # 前台 SSR 路由 + 渲染
│  ├─ templates.cjs           # 由 build-templates.mjs 生成的预编译模板（勿手改）
│  ├─ seed-data.js            # 建表 SCHEMA + 演示数据
│  ├─ db.js                   # D1 封装（所有方法首参为 env）
│  ├─ i18n.js                 # 双语字典 + makeT()
│  ├─ helpers.js              # fmtPrice / thumb
│  └─ api/
│     ├─ inquiry.js           # 公开询盘提交
│     └─ admin/index.js       # 后台全部 API
├─ views/                     # EJS 模板源（改后必须 npm run build）
└─ public/                    # 静态资源（走 [assets] 绑定）
   ├─ css/site.css  admin.css
   ├─ js/site.js  admin.js
   └─ admin.html
```

---

## 七、上线前必做

1. **改密码**：后台「修改密码」把 admin123 换掉。
2. **设 ADMIN_SECRET**：生产环境在 Pages 变量里设置 `ADMIN_SECRET`（否则用默认弱密钥，token 可被伪造）。
3. **换真实资料**：公司信息、联系方式、证书图片、产品图（现在图片填 URL）。
4. **核对价格**：库中 FOB 价格区间为**演示参考值**，务必在「产品管理」中更新。
5. **合规提示**：冬虫夏草等涉及 CITES 濒危物种的品种，出口需办理许可文件。

---

## 八、与原 Express 版的区别

| 项 | 原版（Express） | 本版（Cloudflare 原生） |
|---|---|---|
| 运行 | 自有 Node 服务器 | Cloudflare 边缘，无服务器 |
| 数据库 | 本地 SQLite（better-sqlite3） | D1（边缘 SQLite，异步） |
| 鉴权 | express-session | HMAC token + HttpOnly cookie |
| 图片 | 服务器磁盘上传 | 图片 URL（R2 待接入） |
| 部署 | npm start + PM2 | git push → Pages 自动构建上线 |
| 模板 | 运行时读 .ejs | 构建期预编译进 templates.js |

旧版 `server/` 目录已不再使用（已在 `.gitignore` 中忽略）。

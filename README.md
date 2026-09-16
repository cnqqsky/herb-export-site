# 中药材外贸中英双语站 · 前后台一体（Cloudflare 原生版）

> Chinese Herbal Export Website — 面向海外采购商的中药材原料 / 饮片外贸官网，含完整后台管理系统。
> **技术栈（Cloudflare 原生）**：Cloudflare Pages + Pages Functions + D1（边缘 SQLite）+ EJS 服务端渲染。
> 原 Express + better-sqlite3 版本已迁移走，无需任何 Node 服务器，`git push` 即上线。

---

## 一、架构总览

| 层 | 实现 |
|---|---|
| 静态资源（CSS/JS/后台页） | Cloudflare Pages 直接托管（`public/`），构建输出目录 `public` |
| 前台页面（SSR） | `functions/[[path]].js` 用 EJS 渲染，模板预编译进 `functions/templates.js` |
| 后台 API | `functions/api/admin/[[path]].js` + `functions/api/inquiry.js`（HMAC cookie 鉴权） |
| 数据库 | Cloudflare D1（异步 SQLite），绑定名 `DB` |
| 登录鉴权 | HMAC-SHA256 Token，HttpOnly cookie（替代原 Express session） |
| 图片 | 改为「图片 URL」字段（R2 对象存储接入前先填 URL，避免 CF 无磁盘的限制） |

---

## 二、本地开发

```bash
# 1. 安装依赖（只需要 ejs）
npm install

# 2. 预编译 EJS 模板（部署前必跑；生成 functions/templates.js）
npm run build

# 3. 本地预览（需先 wrangler login）
wrangler pages dev .
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

## 五、部署到 Cloudflare Pages（push 即上线）

### 方式 A：连接 Git 仓库（推荐，自动部署）

1. **登录 wrangler**（一次性，用于建 D1 库）：
   ```bash
   wrangler login
   ```
2. **创建 D1 数据库**：
   ```bash
   wrangler d1 create herb_export_site
   ```
   把返回的 `database_id` 填进 `wrangler.toml` 的 `database_id`。
3. **推送到 GitHub**：
   ```bash
   git add -A && git commit -m "feat: CF-native herb export site" && git push
   ```
4. **Cloudflare 控制台** → Pages → 创建项目 → 连接该 GitHub 仓库，构建设置：
   - 构建命令：`npm run build`
   - 构建输出目录：`public`
   - 框架预设：无（None）
5. **绑定 D1**：Pages 项目 → 设置 → 函数 → D1 数据库绑定，变量名填 `DB`，选择 `herb_export_site`。
   （也可直接用 `wrangler.toml` 里的 `[[d1_databases]]` 配置。）
6. **首次访问即自动建表 + 灌入演示数据**（代码里 `ensureReady` 会处理），无需手动 migrate。

之后每次 `git push` 都会触发重新构建并上线。

### 方式 B：CLI 直接部署（不连 Git）

```bash
npm run build
wrangler pages deploy          # 按提示选择 / 创建项目
```

---

## 六、目录结构

```
herb-export-site/
├─ functions/                 # Pages Functions（边缘运行）
│  ├─ [[path]].js             # 前台 SSR 路由（catch-all）
│  ├─ templates.js            # 由 build-templates.mjs 生成的 EJS 模板（自动）
│  ├─ db.js                   # D1 异步封装（get/all/run/exec）
│  ├─ i18n.js                 # 内置中英文案字典
│  ├─ helpers.js              # 渲染辅助（escapeHtml / fmtPrice / thumb）
│  ├─ seed-data.js            # D1 建表 + 演示数据（自动灌库）
│  ├─ api/
│  │  ├─ inquiry.js          # 公开询盘提交
│  │  └─ admin/
│  │     └─ [[path]].js       # 后台全部 API（catch-all）
├─ views/                     # EJS 模板源（构建时编译进 functions/templates.js）
├─ public/                    # 静态资源（构建输出目录）
│  ├─ css/site.css  admin.css
│  ├─ js/site.js  admin.js
│  └─ admin.html
├─ build-templates.mjs        # 把 views/*.ejs 编译为 functions/templates.js
├─ wrangler.toml             # Pages + D1 绑定配置
└─ package.json              # type:module，依赖仅 ejs
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

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
herb-export-site 备份打包脚本
产出: 一份 zip，含已跟踪源码 + 生产 D1 导出 + 恢复说明
用法: python scripts/backup.py
"""
import os
import io
import sys
import zipfile
import subprocess
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(os.path.dirname(ROOT), "backups")
os.makedirs(OUT_DIR, exist_ok=True)

stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
zip_path = os.path.join(OUT_DIR, f"herb-export-site-backup-{stamp}.zip")

# ---------- 1. 元信息 ----------
def sh(args, **kw):
    return subprocess.run(args, cwd=ROOT, capture_output=True, text=True,
                          encoding="utf-8", errors="replace", **kw).stdout.strip()

commit = sh(["git", "rev-parse", "HEAD"])
commit_short = sh(["git", "rev-parse", "--short", "HEAD"])
branch = sh(["git", "rev-parse", "--abbrev-ref", "HEAD"])
remote = sh(["git", "config", "--get", "remote.origin.url"])
dirty = sh(["git", "status", "--porcelain"])

# ---------- 2. 已跟踪文件列表 ----------
files = [f for f in sh(["git", "ls-files", "-z"]).split("\0") if f]
files.sort()

# ---------- 3. 生产 D1 导出 ----------
db_sql = ""
export_note = ""
sql_src = os.path.join(os.path.dirname(ROOT), "output", "d1-remote-export.sql")
if os.path.exists(sql_src):
    with open(sql_src, "r", encoding="utf-8", errors="replace") as fh:
        db_sql = fh.read()
    tables = sorted(set(l.split("(")[0].replace("CREATE TABLE", "").strip()
                        for l in db_sql.splitlines() if l.startswith("CREATE TABLE")))
    inserts = sum(1 for l in db_sql.splitlines() if l.startswith("INSERT INTO"))
    export_note = f"- 生产 D1 导出：{len(db_sql):,} 字节，{len(tables)} 张表，{inserts} 条 INSERT\n"
    export_note += "- 表清单：" + "、".join(tables) + "\n"
else:
    export_note = "- ⚠️ 生产 D1 导出缺失（未找到 output/d1-remote-export.sql）\n"

init_sql = ""
init_path = os.path.join(ROOT, "init.sql")
if os.path.exists(init_path):
    with open(init_path, "r", encoding="utf-8", errors="replace") as fh:
        init_sql = fh.read()

# ---------- 4. 恢复说明 ----------
info = f"""# herb-export-site 备份

- **备份时间**：{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}
- **本地 commit**：`{commit_short}`（{branch}）{"（有未提交改动，未包含在 source/ 中）" if dirty else "（工作区干净）"}
- **远端仓库**：{remote or "(未配置)"}
- **线上地址**：https://herb-export-site.hailangi.workers.dev/zh （大陆需代理，`*.workers.dev` 被 DNS 污染）
- **后台**：/admin —— admin / admin123（建议尽快改）

## 包内容

```
source/                     # 全部已跟踪源码（{len(files)} 个文件，已排除 node_modules/.wrangler）
database/d1-remote-{stamp[:8]}.sql   # 生产 D1 全量导出
database/init.sql           # 本地 D1 初始化脚本
BACKUP_INFO.md              # 本文件
```

{export_note}
## 恢复方式

### A. 从源码重建站点

```bash
cd herb-export-site
npm install
npm run build                 # 预编译 EJS -> functions/templates.cjs（部署前必跑）
wrangler d1 execute herb_export_site --local --file=init.sql   # 灌本地库
wrangler dev --ip 127.0.0.1 --port 8791                        # 本地预览
```

### B. 恢复生产数据（危险，会覆盖线上）

```bash
# 1) 先用包里的导出做一次回滚点确认，再执行
wrangler d1 execute herb_export_site --remote \\
  --file=database/d1-remote-{stamp[:8]}.sql
```

> D1 的 `execute --file` 会逐条执行；库里已有同名主键会报 UNIQUE 冲突。
> 若要整库替换，先 `wrangler d1 execute herb_export_site --remote --command="DROP TABLE IF EXISTS <表名>"` 逐表删除，再导入。

### C. 仅恢复某张表

把 SQL 里对应的 `CREATE TABLE` + `INSERT INTO` 段抠出来单独执行即可。

## 部署

- 主链路：Cloudflare Workers Builds（push 到 GitHub main 自动构建部署）
- 兜底：`gh workflow run deploy.yml -R cnqqsky/herb-export-site`（需配 `CLOUDFLARE_API_TOKEN`）
- 手动：`wrangler deploy`

## 硬约束（改代码前必读）

1. **EJS 模板里用到的全局对象，必须先登记进 `build-templates.mjs` 的 `GLOBALS` 白名单再 build**，
   否则预编译会把它们解构成局部变量导致 `X is not a constructor`（已踩过 `URLSearchParams` 的坑）。
2. `wrangler.toml` 里 `html_handling` / `not_found_handling` 必须为 `none`，否则 SSR 路由被静态资源劫持。
3. D1 调用统一 `db(env).all(...)` 形式，首参必须是 `env`。
4. 推送代码别用 `git push`（`github.com:443` 被代理挡），用 `node scripts/github-api-push.mjs --message "..."`。

## 未包含在此备份中的内容

- `node_modules/`（用 `npm install` 重建）
- `.wrangler/`（本地 D1 状态，可用 `init.sql` 重建）
- 生产 secret（`ADMIN_SECRET` 等）只存在于 Cloudflare，无法导出，需重新 `wrangler secret put`
"""

# ---------- 5. 打包 ----------
with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for rel in files:
        fp = os.path.join(ROOT, rel)
        if os.path.isfile(fp):
            z.write(fp, "source/" + rel.replace("\\", "/"))
    if db_sql:
        z.writestr(f"database/d1-remote-{stamp[:8]}.sql", db_sql)
    if init_sql:
        z.writestr("database/init.sql", init_sql)
    z.writestr("BACKUP_INFO.md", info)

size = os.path.getsize(zip_path)
print(f"OK: {zip_path}")
print(f"files={len(files)}  size={size:,} bytes ({size/1024/1024:.2f} MB)")
print(f"commit={commit_short} dirty={'yes' if dirty else 'no'}")

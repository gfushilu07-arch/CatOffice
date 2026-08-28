# 上游同步策略（CatOffice ⇄ genspark-ai/genoffice）

## 结论

采用**合并跟踪式硬分叉**：本地改动直接提交为正常代码，周期性 `git merge upstream/main` 同步。
**不使用补丁队列**（patch 对旧基线漂移、碎片化、AI 难以操作），也**不定期 rebase**（hash 重写、同一冲突反复重解）。

分支拓扑：

```
upstream (genspark-ai/genoffice)  ← 只读镜像，不 push
   │ fetch
main ── merge 提交串接上游快照 ──  CatOffice 集成分支（开发主线）
   │ push
origin (自建仓库)
```

``bash
git fetch upstream
git checkout main
git merge upstream/main
pnpm run sync-gate # 门禁：typecheck + 测试 + 构建冒烟（见下）
git tag fork-YYYYMMDD # 记录一次成功同步点
git push origin main --tags

````

若上游变更巨大想先观察再整合，可建 `integration/xxx` 临时分支演练 merge，绿了再快进 main。

## 三条降冲突原则（按优先级执行）

1. **新增优先于修改**。新能力一律放新文件/新包（范式：`packages/catspark` 接缝包、`tools/catoffice-setup.mjs`）。与上游结构性零冲突。
2. **必改的内联改动压到最小行数**，每个偏离点登记进《fork 决策表》。
3. **文案走覆盖层**（待办）：品牌 i18n 文案迁移到独立数据包，装载时合并；届时恢复上游 strings 原样，品牌文本成为零冲突数据资产。

## fork 决策表

解冲突时对照此表判断：**这条 diff 是我们的意图还是上游的新变更？** 上游改动了表中行 → 读「合并取舍」栏。

| 文件 | 偏离内容 | 合并取舍 |
| --- | --- | --- |
| `.npmrc` / `pnpm-workspace.yaml` | pnpm 配置 + 缓存外置卷 | 我方文件为主；上游新增依赖不需要动它们 |
| `package.json`(根) | name、postinstall 追加 setup 脚本、新增 `sync-gate` 一键门禁、test/typecheck 链尾追加 `@catoffice/compat-lab` | postinstall、sync-gate、链尾 compat-lab 项保我方；其余脚本随上游 |
| `tools/gen-third-party-notices.mjs` | 标题 CatOffice 化；import 扫描豁免 `@catoffice/*`；licenseText 收录包内全部 LICENSE* 文件（PDFium 等捆绑二进制要求重现全部版权声明）；cargo 路径回退（CARGO_HOME / ~/.cargo/bin） | 保我方四处小改；上游对生成逻辑的其余改动照常收 |
| `tools/check-english-comments.mjs` | 文档扫描豁免 fork 文档（`README.catoffice.md`、`docs/catoffice/`——刻意中文且永不回传上游） | 保我方两行；上游对其余扫描逻辑的改动照常收 |
| `tools/catoffice-setup.mjs` | 新增 | 全保留 |
| `apps/shell/electron-builder.cjs` | appId/productName/linux 元数据约 6 行 | 身份四行保我方；上游新功能照常收 |
| 各应用 `strings*.ts` | 约 560 处品牌值（键名未动） | 冲突时按 key 逐条合入上游改动并保留 Catspark 文案；高频冲突源，待覆盖层后归零 |
| 主窗口标题 / userData / 默认保存目录 / PDF 作者 | 点状值替换 | 保我方值；上游逻辑变更照常收 |
| `packages/catspark/*` 及各端点调用处 | 新增包 + 单行 import/函数替换 | 保我方接线；上游若重构该行为 → 参照 catspark API 平移 |
| `packages/electron-utils/src/default-save-dir.ts` 等 | 回退目录 `CatOffice` | 保我方值 |
| 字体家族名 / PDF 数据键 / provider 存储键 `genspark` | 有意不改 | 永远保上游 |

## 双 lockfile 治理

pnpm 用 `pnpm-lock.yaml` 安装依赖，但上游的三件许可证工具（`tools/check-licenses.mjs`、`tools/gen-third-party-notices.mjs`）读取 npm 的 `package-lock.json`，两者必须并存：

- **合并 upstream 后**：冲突时对 package-lock.json 取 theirs（上游刚生成的那份本来就是最新的），必要时再重建；
- **我们自行增删依赖后**：跑一次 `npm install --package-lock-only --ignore-scripts` 刷新 package-lock.json 并一并提交——不提交会导致许可证门禁看不到新依赖。

## 同步门禁 sync-gate

根脚本一条命令跑完全部等价检查：

```bash
pnpm run sync-gate
````

（= typecheck 全 workspace + catspark tsc + 全量测试 + build:all；测试前自动把 cargo 加入 PATH。）

合并完成后必须全绿才算同步完成，等价命令手工跑也可以：

```bash
pnpm run typecheck
pnpm --filter @catoffice/catspark exec tsc --noEmit
pnpm test                                   # 已知 3 个环境性失败见 README，可豁免：
                                            # remote-image(fake-IP DNS)/system-fonts(系统字体)/pivot-roundtrip(无 LibreOffice)
env PATH="/Volumes/fushilu/.cargo/bin:$PATH" pnpm --filter @genoffice/sheets run test
pnpm run build:all
```

## 相关文档

- [product-plan.md](product-plan.md) — 战略基准（含 30 天清单与风险）
- [catspark-feature-list.md](catspark-feature-list.md) — 后端功能需求清单
- [catspark-integration.md](catspark-integration.md) — 客户端↔后端接口契约

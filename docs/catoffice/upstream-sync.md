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

```bash
git fetch upstream
git checkout main
git merge upstream/main
pnpm run sync-gate # 门禁：typecheck + 测试 + 构建冒烟（见下）
git tag fork-YYYYMMDD # 记录一次成功同步点
git push origin main --tags

```

若上游变更巨大想先观察再整合，可建 `integration/xxx` 临时分支演练 merge，绿了再快进 main。

## 三条降冲突原则（按优先级执行）

1. **新增优先于修改**。新能力一律放新文件/新包（范式：`packages/catspark` 接缝包、`tools/catoffice-setup.mjs`）。与上游结构性零冲突。
2. **必改的内联改动压到最小行数**，每个偏离点登记进《fork 决策表》。
3. **文案走覆盖层** ✅ 完成（2026-09-04）：品牌 i18n 文案已迁移到独立数据包
   `apps/docs/src/renderer/i18n/strings-brand.ts`（7 键 × 19 语言：app 三键 +
   ai 面板/登录/积分 + ribbon 助手名），装载入口 `strings-merged.ts` 按语言浅
   合并（覆盖层最后展开，`as typeof upstream` 保持键集类型检查），`locale.tsx`
   仅改一行 import。**strings-app/ai/ribbon/editor 的品牌值已全部还原上游原文**
   （与 0a2c25d 快照逐键值零偏离，`strings-brand-overlay.test.ts` 含同步冲突
   守卫）。键名保留 Genspark 拼写（aiGsk*/appGenspark*）——它们是上游 API 面，
   与「设置键 genspark 刻意保留」同一决策。

## fork 决策表

解冲突时对照此表判断：**这条 diff 是我们的意图还是上游的新变更？** 上游改动了表中行 → 读「合并取舍」栏。

| 文件 | 偏离内容 | 合并取舍 |
| --- | --- | --- |
| `.npmrc` / `pnpm-workspace.yaml` | pnpm 配置 + 缓存外置卷 | 我方文件为主；上游新增依赖不需要动它们 |
| `package.json`(根) | name、postinstall 追加 setup 脚本、新增 `sync-gate` 一键门禁、test/typecheck 链尾追加 `@catoffice/compat-lab` | postinstall、sync-gate、链尾 compat-lab 项保我方；其余脚本随上游 |
| `tools/gen-third-party-notices.mjs` | 标题 CatOffice 化；import 扫描豁免 `@catoffice/*`；licenseText 收录包内全部 LICENSE* 文件（PDFium 等捆绑二进制要求重现全部版权声明）；cargo 路径回退（CARGO_HOME / ~/.cargo/bin） | 保我方四处小改；上游对生成逻辑的其余改动照常收 |
| `tools/check-english-comments.mjs` | 文档扫描豁免 fork 文档（README.catoffice.md、docs/catoffice/、compat/、assets/brand/——刻意中文且永不回传上游） | 保我方两行；上游对其余扫描逻辑的改动照常收 |
| `apps/docs/src/renderer/i18n/locale.tsx` | 仅 1 行：`strings` 改从 `./strings-merged` 装入（品牌覆盖层入口，见原则 3） | 保我方 1 行；上游对其余 locale 逻辑的改动照常收 |
| `tools/catoffice-setup.mjs` | 新增 | 全保留 |
| `assets/brand/*` + `tools/build-catoffice-icons.mjs` + `apps/shell/build/icon.*`/`icons/` + 渲染层 `app-icon.png`/`catoffice-logo.svg` | 猫系图标全套（我们的产物，覆盖上游同名二进制）；`Home.tsx` lockup import 一行 | 全保我方；上游若改 electron-builder 图标引用结构 → 重新对齐产物路径 |
| `apps/shell/src/renderer/src/assets/genoffice-logo.svg` | 已删除（被 catoffice-logo.svg 取代） | 上游若恢复/引用该文件 → 保留删除并改回我方文件 |
| `apps/shell/electron-builder.cjs` | appId/productName/linux 元数据约 6 行 | 身份四行保我方；上游新功能照常收 |
| 各应用 `strings*.ts` | 约 560 处品牌值（键名未动） | 冲突时按 key 逐条合入上游改动并保留 Catspark 文案；高频冲突源，待覆盖层后归零 |
| 主窗口标题 / userData / 默认保存目录 / PDF 作者 | 点状值替换 | 保我方值；上游逻辑变更照常收 |
| `packages/catspark/*` 及各端点调用处 | 新增包 + 单行 import/函数替换 | 保我方接线；上游若重构该行为 → 参照 catspark API 平移 |
| `packages/electron-utils/src/default-save-dir.ts` 等 | 回退目录 `CatOffice` | 保我方值 |
| 字体家族名 / PDF 数据键 / provider 存储键 `genspark` | 有意不改 | 永远保上游 |

### 2026-09-18 同步新增的偏离点

| 文件 | 偏离内容 | 合并取舍 |
| --- | --- | --- |
| `pnpm-workspace.yaml` | 新增 override `'@types/node': ^24.10.1` | 全保我方：vite/vitest 的 peer 会拉进第二份 `@types/node`（25.x），两份副本使 ambient `node:*` 模块声明二义化，tsc 会静默丢弃它们（表现为 sheets/ai-provider/cli 报「找不到模块 node:readline」）。上游若自行升级 Node 类型 → 同步抬高此版本号 |
| `packages/cli/src/resources.ts` | `repoRoot()` 的包名判定接受 `genoffice` 或 `catoffice` | 保我方两行：上游 CLI 靠根 `package.json` 的 `name` 定位仓库根来解析捆绑资源（`skills/genoffice/SKILL.md`、pdfium.wasm、sidecar），fork 根包名是 `catoffice`，只认 `genoffice` 会让所有 CLI 资源探测失败（exit code 4） |
| `packages/cli/tests/render.test.ts` | contact-sheet 用例加 `{ timeout: 240_000 }` | 保我方一行：该用例两次 spawn 假 app，macOS 上「新写入脚本的首次执行」要 15–60s，全量套件并行时超默认 60s。属环境性 flake，非逻辑缺陷 |
| `apps/docs/src/renderer/i18n/**`（每语言一文件） | fork 键值迁入上游的 `i18n/{ai,app,ribbon}/<lang>.ts` 结构，含上游新增的 `cs` | 结构随上游；fork 键按语言逐个迁移。上游再重构 i18n 目录 → 照搬结构重迁 |
| `packages/docx-engine/src/parse.ts`/`generate.ts`/`parse-styles.ts` | 采纳上游 `charIndents` 为唯一解析产物；fork 的 `indentLeftChars`/`indentFirstLineChars` 改为**派生态**（`parse-styles.ts` 的样式层 + `apps/docs/.../convert.ts` 的 `charUnitIndents()` 从 `charIndents` 折算有符号对） | 上游模型为准：引擎不再写 fork 字段（否则上游 15 个 char-unit 测试全红），渲染层在边界处派生。生成侧仍保留 fork 的 `*Chars` 发射与上游 `charIndents` 取消属性，两模型共存 |
| `apps/shell/src/main/index.ts` | 保留 fork 的 MCP 辅助块、`newSlideTab` 模板分支 + `bindPendingDir('slide')`、`ProjectStore` 导入、19 语言 pdfDocx 键、`before-quit` 同时调 `auditAppQuit()` 与 `stopMcpSync()` | 逐块保留；上游若重构标签页创建 → 参照 `newSlideTab` 分支平移模板逻辑 |
| `apps/docs/src/renderer/line-metrics.ts` | CJK 变体分支保留 fork 的 T4 平台分派（`macSubstitution` 才查 `missingLocally()`，Windows/Linux 保持声明分类） | 保我方语义：合并时曾误将上游的 `missingLocally() && !sansSub` 与 fork 的 `macSubstitution` 叠加，导致 `Noto Sans CJK SC` 在 win32/linux 丢字面头且类被强制成 serif；`font-platform`/`font-chain-matrix` 快照是守卫 |
| `apps/docs/tests/fixtures/font-chains/*.json` | 随上游新增捆绑别名重生成（Aptos/Consolas/MS Gothic/MS Mincho/Meiryo 的 `* GO` 面 + hangul 尾链） | 快照随上游逻辑更新，非 fork 偏离；重生成命令见测试头注释 |

## 双 lockfile 治理

pnpm 用 `pnpm-lock.yaml` 安装依赖，但上游的三件许可证工具（`tools/check-licenses.mjs`、`tools/gen-third-party-notices.mjs`）读取 npm 的 `package-lock.json`，两者必须并存：

- **合并 upstream 后**：冲突时对 package-lock.json 取 theirs（上游刚生成的那份本来就是最新的），必要时再重建；
- **我们自行增删依赖后**：跑一次 `npm install --package-lock-only --ignore-scripts` 刷新 package-lock.json 并一并提交——不提交会导致许可证门禁看不到新依赖。

## 同步门禁 sync-gate

根脚本一条命令跑完全部等价检查：

```bash
pnpm run sync-gate
```

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

# 办公猫 · Cat Office

基于开源项目 [GenOffice](https://github.com/genspark-ai/genoffice)（Apache-2.0）二次开发的 AI 原生办公套件。品牌为「办公猫 / Cat Office」，上游为 GenOffice / Mainfunc, Inc.（商标归其所有，本项目按其 LICENSE 要求使用自己的品牌）。

**产品路线**：以 [docs/catoffice/product-plan.md](docs/catoffice/product-plan.md) 为战略基准（v0.1 规划稿）。仓库现状与规划的对照见文末「Phase 0 差距看板」。品牌决策（2026-08-27）：中文名 **办公猫**，英文名 **CatOffice**。云端后端使用自研 **Catspark**（Rust/axle 研发）：功能清单见 [docs/catoffice/catspark-feature-list.md](docs/catoffice/catspark-feature-list.md)，客户端对接契约见 [docs/catoffice/catspark-integration.md](docs/catoffice/catspark-integration.md)，上游同步策略见 [docs/catoffice/upstream-sync.md](docs/catoffice/upstream-sync.md)，依赖许可证审计见 [docs/catoffice/license-audit.md](docs/catoffice/license-audit.md)。

## 本地约定

- **缓存与产物一律放外接卷 `/Volumes/fushilu/.caches`**（主盘空间有限）。pnpm 的 store/cache/state 由仓库 `.npmrc` 指向 `.caches/pnpm/*`；Electron 二进制、electron-builder 缓存通过环境变量指向 `.caches/electron*`。
- **构建产物目录用符号链接落到外接卷**（已建好，clone 后无需手动操作）：
  - `apps/shell/release` → `/Volumes/fushilu/.caches/catoffice/release`（dmg/zip 安装包）
  - `apps/sheets/native/xlsx-engine/target` → `/Volumes/fushilu/.caches/catoffice/build/xlsx-engine-target`（Rust sidecar 编译产物）
- 包管理使用 **pnpm**；根脚本的 `npm run xxx -w …` 形式照常工作（pnpm 会透传 npm 风格的脚本，也可以直接写 `pnpm run fixtures`，由 pnpm 解析 `-w` 参数）。

## 环境要求

- Node ≥ 22.12、pnpm ≥ 10、Rust toolchain（cargo，Sheets sidecar 需要）、Xcode CLT（macOS 上 swiftc 会即时编译 OCR helper）
- 可选环境变量（写在 shell profile 或每次命令前缀）：`ELECTRON_CACHE=/Volumes/fushilu/.caches/electron`、`ELECTRON_BUILDER_CACHE=/Volumes/fushilu/.caches/electron-builder`、`PLAYWRIGHT_BROWSERS_PATH=/Volumes/fushilu/.caches/ms-playwright`

## 常用命令

```bash
pnpm install                      # 安装依赖（postinstall 自动下载 Electron 并做打包路径自检）
pnpm run fixtures                 # 生成测试 .docx 夹具
pnpm test                         # 引擎与应用单元测试
pnpm run typecheck                # 全 workspace tsc --noEmit
pnpm run dev                      # 五个编辑器 + shell 全部起 Vite dev server
pnpm run dev:docs                 # 单个应用
pnpm run sync-gate                # 上游合并后的全套门禁（typecheck + 测试 + build:all）
pnpm --filter @catoffice/compat-lab run golden   # 重建 compat/golden 语料（有意变更后）

# 打包（产物在 apps/shell/release）
pnpm run dist:mac

# 许可证合规（增删依赖后手动跑；dist:* 已自动串 notices）
pnpm run licenses                 # 生产依赖 SPDX 白名单门禁
pnpm run notices                  # 重新生成安装包内 THIRD-PARTY-NOTICES.txt
```

## 相对上游的关键改动（合并 upstream 时注意保留）

| 文件                                                | 改动                                                                                                                                                                                                                                |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.npmrc` / `pnpm-workspace.yaml`                    | pnpm 工作区：registry 官方源、store/cache/state 指向外接卷、shamefully-hoist、overrides 与 onlyBuiltDependencies                                                                                                                    |
| `package.json`                                      | 项目名 `catoffice`；postinstall 追加 `tools/catoffice-setup.mjs`；新增 `sync-gate` 门禁脚本                                                                                                                                         |
| `tools/catoffice-setup.mjs`                         | 新增：补出 electron-builder 依赖的 `@genspark/cli` 嵌套 commander 目录；pnpm 布局下把根提升的 harfbuzzjs 指向 slides 的 1.x 副本（slides 主进程深导入根路径 `dist/`，见 shaped-metrics.ts）；打包路径自检                           |
| `tools/gen-third-party-notices.mjs`                 | 标题 CatOffice 化、豁免 `@catoffice/*` 一方包、收录包内全部 LICENSE* 文件（PDFium 归属）、cargo 路径回退                                                                                                                            |
| `tools/check-english-comments.mjs`                  | 文档扫描豁免 fork 文档（README.catoffice.md、docs/catoffice/，刻意中文）                                                                                                                                                            |
| `assets/brand/` + `tools/build-catoffice-icons.mjs` | 新增：猫系图标设计源（完整版+小尺寸简化版 SVG）与全套产物构建脚本；`apps/shell/build/icon.*`、`icons/`、渲染层 `app-icon.png` 为其产物；Home lockup 改名 `catoffice-logo.svg`（原 genoffice-logo.svg 删除，Home.tsx import 同步改） |
| `apps/shell/electron-builder.cjs`                   | appId `com.catoffice.app`、productName `CatOffice`、linux executableName/deb/rpm 名称与维护者                                                                                                                                       |
| `apps/shell/src/renderer/src/strings.ts`            | 界面文案：中文区「办公猫」，其余语言 "Cat Office"                                                                                                                                                                                   |
| `apps/shell/src/main/index.ts` 等                   | 主窗口标题「办公猫」、userData 目录 `CatOffice Dev`                                                                                                                                                                                 |
| `packages/electron-utils/src/default-save-dir.ts`   | 默认保存目录回退 `<Documents>/CatOffice`                                                                                                                                                                                            |
| `apps/pdf/src/main/save-pdf.ts` 等                  | PDF 批注默认作者 `Cat Office`                                                                                                                                                                                                       |

**有意保留**的 `GenOffice` 字样：捆绑字体家族名（`GenOffice Sans KR` 等，改了会破坏渲染回退链）、写入 PDF 的数据格式键（`GenOfficeStaticFormFills` / `GenOfficeFormField` / 视觉签名字符串前缀）、内部包名 `@genoffice/*` 及其 import 路径、Tiptap 扩展存储键。这些改动会破坏数据兼容或制造无谓的上游冲突。

云服务（登录/LLM/搜索/积分）由自研 **Catspark** 后端承担：客户端所有端点收敛在 `packages/catspark` 接缝包内，默认仍指上游服务保证开发可用，设 `CATSPARK_API_BASE` 即切到自有网关。

## 许可

引擎代码遵循上游 Apache-2.0（见 `LICENSE`）；上游预留的 `ee/` 目录适用单独的企业许可，未经授权不要用于发布。

## Phase 0 差距看板（对照 product-plan.md 第 3/22/23 节）

| 规划事项                                      | 状态        | 说明                                                                                                                                                                                                                                                           |
| --------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fork、换品牌、换包身份、更新通道              | ✅ 已完成   | appId/productName/artifactName/userData 目录已换；更新服务器尚无（GENOFFICE_UPDATE_URL 未设则自动禁用内置更新）                                                                                                                                                |
| 内部日构建可用                                | ✅          | pnpm install → typecheck/test/build:all 全绿；dist:mac 待签名证书                                                                                                                                                                                              |
| 图标 / 关于页 / User-Agent 换肤               | ◐ 图标完成  | 猫系图标全套已落地：设计源 `assets/brand/`（「文件即猫」mark + 小尺寸简化版），`node tools/build-catoffice-icons.mjs` 产出 icns/ico/png 全套替换 `apps/shell/build/`；Home lockup 换 `catoffice-logo.svg`（办公猫字标）；关于页与 User-Agent 仍待换            |
| Catspark 对接 / Genspark 解耦                 | ◐ 接缝完成  | 全部端点收敛至 `packages/catspark`（登录/LLM 代理/tool_cli/云项目/积分/图片 CDN），`CATSPARK_API_BASE` 一换即切；约 560 处用户可见文案已改 Catspark；过渡期安装包仍内置上游 @genspark/cli（`GSK_CLI_PATH` 可热替换）；设置存储键 `genspark` 保留以兼容既有配置 |
| 接国产模型 + 本地端点                         | ◐ 部分继承  | ai-provider BYOK 已含 DeepSeek/Qwen/GLM/Kimi 等；provider 显示名已切 Catspark，企业网关模式由 catspark 配置承担                                                                                                                                                |
| 依赖许可证审计（Univer/Tiptap Pro/字体/WASM） | ✅ 已完成   | 结论绿灯：314 npm 包 + 144 crate 全过门禁，IronCalc 为 MIT OR Apache-2.0；PDFium 归属缺口已修复；黄灯过渡项与律师清单见 [docs/catoffice/license-audit.md](docs/catoffice/license-audit.md)；Noto CJK 确认为 OFL 子集内嵌于 apps/docs、apps/slides 渲染资产     |
| Compat Lab 黄金语料                           | ✅ 框架落地 | `compat/golden/` 10 个必过文件 + 20 条 vitest 门禁（读取快照 + pptx/pdf 往返 + xlsx 重建一致），随 `pnpm test` 执行；详见 [compat/README.md](compat/README.md)；真实世界脏样本为后续扩充方向                                                                   |
| 中文排版引擎层（避头尾/标点挤压/回退链）      | ⬜ 未做     | i18n 文案中文已全量（strings.ts zh-CN/zh-TW）；`apps/docs/src/renderer/line-metrics.ts` 已有字体回退链骨架（GenOffice Sans/Songti 等），是中文排版的挂载点                                                                                                     |
| ee/ 企业许可隔离                              | ✅ 无风险   | `ee/` 仅含 LICENSE+README，无代码、不在 workspace 构建路径                                                                                                                                                                                                     |

> 基线勘误：规划稿假设上游「v0.4.x Alpha」，实际基线为 2026-08-26 snapshot（shell v0.8.0），较规划假设新——部分 Alpha 缺口可能已收窄，执行前应先以本基线复测。

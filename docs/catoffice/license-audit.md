# 依赖许可证审计（2026-08-27）

> 基线：上游快照 `0a2c25d`（2026-08-26）+ fork 四个提交；Node 22 / pnpm 10 / Rust stable。
> 方法：实测三道上游既有门禁在本仓库的运行结果 + 对高风险组件逐项人工核查（本文只记录核查结论，不复制许可全文——全文见 `apps/shell/build/THIRD-PARTY-NOTICES.txt` 与各包内 LICENSE 文件）。

## 结论

**整体绿灯。** 314 个生产 npm 包、144 个 Rust crate、全部捆绑字体与 WASM 二进制均落在宽松许可内，无 GPL/LGPL/AGPL/SSPL 等强传染性组件。发现并已修复 1 个真实合规缺口（PDFium 二进制归属缺失，见黄灯 #1）；另有 1 条需要引入 Catspark 后收敛的过渡项（捆绑 @genspark/cli）。

## 三道门禁（上游既有，实测在本 fork 下全部可用）

| 门禁                                                                       | 覆盖范围                                                                                                                                                                                                    | 本次实测                                                                                  |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `tools/check-licenses.mjs`（`pnpm run licenses`）                          | package-lock.json 中全部生产 npm 依赖的 SPDX 白名单                                                                                                                                                         | ✅ 通过（例外：@univerjs/telemetry 无 license 字段，人工核为 Apache-2.0）                 |
| `apps/sheets/native/xlsx-engine/deny.toml`（cargo-deny）                   | Rust sidecar 全部 crate                                                                                                                                                                                     | ✅ 通过（MIT / Apache-2.0 / BSD / 0BSD / Zlib / Unicode-3.0 / Unlicense / CC0 / BSL-1.0） |
| `tools/gen-third-party-notices.mjs`（`pnpm run notices`，dist 前自动执行） | 聚合 314 npm 包 + 144 crates + 字体 + UCD 数据 → `THIRD-PARTY-NOTICES.txt`（1087 KB），经 electron-builder extraResources 打进 app `Contents/Resources/`；Chromium 全文 `LICENSES.chromium.html` 同路径并排 | ✅ 生成成功                                                                               |

门禁读取的是 npm 的 package-lock.json（非 pnpm-lock.yaml）。双 lockfile 的刷新规则见 [upstream-sync.md](upstream-sync.md)「双 lockfile 治理」——**我们增删依赖后必须刷新 package-lock.json，否则许可门禁看不见新依赖。**

## 绿灯明细（人工核查过的关键组件）

| 组件                                                                                                                                                                                                        | 版本          | 许可                                                           | 核查备注                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Univer 全家（`@univerjs/*`）                                                                                                                                                                                | 0.25.1 ×15 包 | Apache-2.0                                                     | 许可门禁白名单内；telemetry/protocol 两包缺字段或缺文件，均按 Apache-2.0 处理                                                                                                                                                                                  |
| Tiptap 全家（`@tiptap/*`）                                                                                                                                                                                  | ×12 包        | MIT                                                            | —                                                                                                                                                                                                                                                              |
| Electron 运行时                                                                                                                                                                                             | 随上游        | MIT                                                            | Chromium 归属由 `LICENSES.chromium.html` 单独承载                                                                                                                                                                                                              |
| Rust sidecar（含 **IronCalc** 0.7.1、calamine 0.36）                                                                                                                                                        | 144 crates    | MIT OR Apache-2.0（ironcalc）/ MIT（calamine）                 | 曾担心的传染性许可不存在；cargo-deny 白名单自动取 OR 的有利分支                                                                                                                                                                                                |
| vendored emf-converter（`packages/docx-engine/src/vendor/`）                                                                                                                                                | —             | Apache-2.0                                                     | 目录内带 LICENSE 全文                                                                                                                                                                                                                                          |
| harfbuzzjs（HarfBuzz 形状引擎 WASM）                                                                                                                                                                        | 1.x           | MIT                                                            | 包内带 LICENSE；构建期子集化用，wasm 亦随包分发                                                                                                                                                                                                                |
| @embedpdf/pdfium 包装层 + `pdfium.wasm`                                                                                                                                                                     | 2.15.0        | MIT（包装层，CloudPDF/Ji Chang）+ BSD-3 风格（PDFium Authors） | 见黄灯 #1，已修复                                                                                                                                                                                                                                              |
| @genspark/cli（gsk 工具 CLI，过渡期捆绑）                                                                                                                                                                   | 1.7.0         | MIT                                                            | 见黄灯 #2                                                                                                                                                                                                                                                      |
| 捆绑字体：Carlito / Liberation Sans/Serif/Mono / Noto Sans & Serif CJK SC 子集 / Noto Naskh & Sans Arabic 子集 / KaTeX webfonts / GenOffice Sans·Serif·Che Latin KR / GenOffice Gothic KR / GenOffice Tamil | —             | SIL OFL-1.1（Caladea 为 Apache-2.0）                           | 实体文件在 `apps/docs/src/renderer/fonts/` 与 `apps/slides/src/renderer/fonts/`；OFL 全文随包（`LICENSE-OFL.txt` 聚合进 NOTICES）。KR 派生字体按 OFL RFN 要求已改名，改字距/描边的构建脚本留在 `tools/build-*-font.py`、`patch-carlito-vi.py` 等处作为改造凭证 |
| Unicode Character Database 17.0.0（`apps/pdf/src/shared/radicals.ts` 派生映射）                                                                                                                             | —             | Unicode-3.0                                                    | `LICENSE-UNICODE.txt`，聚合进 NOTICES                                                                                                                                                                                                                          |

## 黄灯事项（合规但需行动或观察）

1. **PDFium 二进制归属（已修复）**：`@embedpdf/pdfium` 包内 `dist/pdfium.wasm` 是 PDFium（Chromium 项目）编译产物，其 BSD 条款要求**二进制再分发时必须重现版权声明**，但包根另有最短的 `LICENSE`（MIT 包装层）——上游生成器只收录最短的那个文件，导致安装包内声明缺 PDFium 版权行。已在 `gen-third-party-notices.mjs` 改为收录包内**全部** `LICENSE*` 文件（去重拼接），重新生成后已含 "Copyright 2014 PDFium Authors"。此改动同时惠及未来任何带 `LICENSE.<component>` 附属声明的依赖。
2. **捆绑 @genspark/cli（过渡项）**：MIT 允许再分发，NOTICES 已含其版权行；但安装包里放着带 Genspark 商标的第三方 CLI。Catspark 的 tool_cli（P0 的 T1–T8）上线后应移除该捆绑（`GSK_CLI_PATH` 环境变量已支持热替换验证）。在此之前每次发版提醒一次。
3. **双 lockfile 漂移**：check-licenses 读 package-lock.json 而 pnpm 实际安装按 pnpm-lock.yaml。已定规则：上游 merge 取 theirs；自改依赖后跑 `npm install --package-lock-only --ignore-scripts` 刷新提交。
4. **13 个已发布包缺 LICENSE 文件**（`@univerjs/protocol`、`saxes`、`emoji-regex`、`franc-min` 等）：NOTICES 按「SPDX + 仓库 URL」回退表述，是生态常见做法；如内部合规要求全文收录，可用生成器的 `NOTE` 映射手工补充（`@fluentui/react-icons`、`@genspark/cli` 已是先例）。
5. **OFL 字体改造链**：GenOffice* KR 系列是 Noto/NanumGothic 的子集+度量改造派生（OFL RFN 已合规改名）。保持 `tools/build-*.py` 脚本在库即满足「保留改造凭证」的惯例，无进一步动作。

## 红线（不是违规项，是行动边界）

- **`ee/` 目录**：适用 GenOffice Enterprise License（Mainfunc, Inc.）——仅限开发测试用途，生产使用/托管服务/分发均需企业协议。当前仓库内只有 LICENSE + README 两个文件（空壳预留）。**永不**把 `ee/` 下的任何东西引入构建路径或产品；若未来需要企业能力，与 Mainfunc 签约或自研置于其他目录。
- **商标**：用户可见面（应用名/窗口标题/安装包身份/界面文案/关于页路径）已全部切换为 办公猫/CatOffice/CatOffice App。刻意保留的 `GenOffice` 字样只在不可见的内部标识符里（字体家族名、PDF 数据格式键、provider 存储键、`@genoffice/*` 包 scope）——不构成商标性使用。转公开前再做一次可见面扫描即可。

## 转公开（public）前的 Apache-2.0 义务清单

仓库现为私有；对外开源时逐条勾选：

- [ ] 根 `LICENSE` 保留 Mainfunc, Inc. 版权行，追加我方版权行（格式请律师确认，见下清单 #6）
- [ ] `THIRD-PARTY-NOTICES.txt` 随二进制分发（已由 extraResources 保证）且重新生成至最新
- [ ] README/NOTICE 层面声明对本项目的修改（README.catoffice.md 已是载体，公开时并入正式 README）
- [ ] 确认仓库不含 `ee/` 产物、CI 不构建 `ee/`
- [ ] 若 C 源码文件带上游版权头，保留原头
- [ ] Apache-2.0 §3 专利条款随许可证自动生效，无需额外文件；如需 NOTICE 文件再评估

## 律师确认清单（人工待办）

1. `pdfium.wasm` 的 BSD 归属现已随 MIT 文本并列收录——措辞是否满足「reproduce the above copyright notice in the documentation and/or other materials」请过目。
2. 商业产品捆绑 MIT 的第三方 CLI（@genspark/cli）在目标分发渠道（App Store 直达分发/企业 MDM）是否有额外政策约束。
3. 「办公猫 / CatOffice」中英文商标在第 9 类（软件）与第 42 类（SaaS）的注册计划。
4. OFL 派生字体的改造凭证（tools/build-*.py）与 NOTICES 中的声明是否足以满足 RFN 惯例要求。
5. 13 个无 LICENSE 文件包的「SPDX + URL」回退是否满足公司合规标准（或需 NOTE 全文补充）。
6. 转公开时根 LICENSE 追加版权行的具体格式与主体名称（以公司注册实体为准）。
7. Catspark 服务端是否开源、与客户端 Apache-2.0 的边界表述（影响未来仓库声明）。

## 维护流程（何时重跑）

- **上游 merge 后**：package-lock.json 随合并更新 → `pnpm run licenses` 重跑门禁。
- **自行增删任何依赖后**：`npm install --package-lock-only --ignore-scripts` → `pnpm run licenses` → `pnpm run notices`。
- **每次发版前**：`dist:*` 脚本已串 `pnpm run notices`，无需手工步骤；发版 checklist 增加一条「黄灯 #2 是否仍适用」。
- **本审计文档**：依赖结构大变（如 Univer/Tiptap 大版本升级、Catspark 替换 @genspark/cli 完成）时更新一轮。

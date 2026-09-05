# 开发路线图（Roadmap）

> 状态基准：2026-09-04。本文档是**唯一的总执行顺序**——汇总所有规划文档与
> 平台账账的开放项，按依赖关系、用户价值、阻塞状态排序。各专项细节见对应
> 文档；每完成一项回填本表状态并列对应文档的执行进度。未完成项的统一清单见
> 「一·六 未完成总清单」。

## 〇、当前状态快照

**已完成**：M1（CI 三平台）/M2（W1/W2 起步）/M3（T3/L1/L2 代码/L3/L4 代码）/
M4（T5 三件套闭环+打印翻转/T6 收口）/M5（GB/T 9704 全链：版心+红头+印章弧形字+
主题词版记）/素材中心 A1/A2/A3 客户端+SA 设计/S1/S2/S3（16 内置模板）/
AI 公文套版工具/六 flake 治理/**M6 国际化排版（IL1 SEA 断词 + IL2 RTL 审计修复 +
IL4 泰/梵/希伯来字体链）**/**合规 C1 审计日志 + C2 上传同意 + C3 会话锁定 +
C4 SM3 + C5 加密半边（SM4 容器 + 按文档算法选择）**/**SA1 印章检测 +
SA2 素材章登记层**（检测→入库→插入的库层闭环；管理 UI 待做）/SA3.0 静态探针
（全 workspace 7904 绿，2026-09-04 快照）。

**阻塞性事实**：Windows/Linux 真机验证、CatSpark 服务端、W3 签名资质、
CA 测试证书、WPS 国密加密样本——均非本地可解，已各自台账化。本地可开发
面见下。

## 一、开发顺序（本地可执行项）

### 第一梯队：合规地基（政务客户验收硬需求，纯本地）

| 序 | 项 | 为什么在这个位置 | 工作量预估 | 文档 |
| --- | --- | --- | --- | --- |
| 1 | **C1 本地安全审计日志** ✅ 完成（f75eb51+4f11278） | 等保最大缺口；C2 的数据源；政务客户真实验收项。纯本地、测试夹具清晰 | 3–5 天 | [compliance-plan.md](compliance-plan.md) |
| 2 | **C2 上传同意体系** ✅ 完成（c31e32e+c5741a3） | 依赖 C1 的事件流；transport 门控是既有单通道小改；mock 路由先行可完整测试 | 3–4 天 | 同上 |
| 3 | **C3 会话锁定 + 剩余信息文档** ✅ 完成（296b7e8） | 小刀，等保对标补全；可与 1/2 并行穿插 | 1–2 天 | 同上 |

### 第二梯队：功能差异化（素材线延伸 + 检测能力）

| 序 | 项 | 为什么在这个位置 | 工作量 | 文档 |
| --- | --- | --- | --- | --- |
| 4 | **SA1 印章边缘检测** ✅ 完成（510c7fe） | 衔接 A1 占位章→真章的用户路径；夹具现成；演示价值高 | 4–6 天 | [asset-center-plan.md](asset-center-plan.md) SA 节 |
| 5 | **SA2 印章素材库（签章管理模式·素材章层级）** ◐ 库层完成（6a96c71）/管理 UI 待做（见清单 N3） | 依赖 SA1（检测→入库→插入闭环）；统一签章管理面登记 + 元数据 CRUD + 骑年盖月替换；可升级 CA 背书签章 | 2–3 天 | [seal-signing-plan.md](seal-signing-plan.md) |
| 5b | **SA3.0 电子签章格式探针** | **本地静态探底已完成**（pdf-lib 无签名 API、视觉签名是贴图——见 [sa3-probe.md](sa3-probe.md)）；动态部分（真实 CA 样本解析）等测试证书 | 报告已出；动态等证书 | [sa3-probe.md](sa3-probe.md) |
| 6 | **P1 品类继续扩充**（发票模板 docx 版/投标书/培训 deck 等） | 管线全通，纯增量；穿插在大项间隙做 | 每品类 0.5–1 天 | 同上执行进度 |

### 第三梯队：排版正确性（修真 bug，小而准）

| 序 | 项 | 为什么在这个位置 | 工作量 | 文档 |
| --- | --- | --- | --- | --- |
| 7 | **IL1 SEA 断行移植** ✅ 完成（3d4b473） | 泰/老/高棉文档断行错误是可见 bug；Segmenter 参照现成；M6 首刀 | 2–3 天 | [i18n-typography-plan.md](i18n-typography-plan.md) |
| 8 | **IL2 RTL 审计** ✅ 完成（6f6f041，[rtl-audit.md](rtl-audit.md)） | 审计报告先行，修不修看缺口大小 | 1–2 天（审计） | 同上 |
| 9 | **IL4 多语言字体链** ✅ 完成（2848726） | 并入 T4 分派体系；新语料进快照 | 2 天 | 同上 + cross-platform-plan |

### 第四梯队：国密与 OFD（需要业务决策后启动）

| 序 | 项 | 为什么在最后 | 工作量 | 文档 |
| --- | --- | --- | --- | --- |
| 10 | **C4 SM3** ✅ 完成（9a0fc74） | 独立无依赖，但单独价值有限（审计哈希链可选算法） | 1–2 天 | [compliance-plan.md](compliance-plan.md) |
| 11 | **C5 SM4/OFD + SA3 电子签章** ◐ SM4 加密+算法选择完成（4ac8b5a）/OFD 与 SA3 动态等决策+CA 证书 | **决策点**：OFD 工程量数倍于单纯国密加密；签章需第三方 CA 合作（CFCA 模式）——SA3.0 探针（5b）产出决策依据 | 探针已前移；OFD 立项另议 | [compliance-plan.md](compliance-plan.md) + [seal-signing-plan.md](seal-signing-plan.md) |

### 第五梯队：OA 集成线（桌面端侧，无配置即不存在）

> OA（审批 / CRM / 任务等，客户内网自部署的独立服务端产品）的规划见
> 独立项目仓 [CatOfficeOA](../../CatOfficeOA/)；桌面端能力补充方案见
> [oa-plan.md](oa-plan.md)。桌面端只做
> 发现 / 宿主 / 文档桥三件事，OA 新增模块桌面端零发版。

| 序 | 项 | 为什么在这个位置 | 工作量 | 文档 |
| --- | --- | --- | --- | --- |
| 12 | **W0 桥与契约**（`catoffice://` 深链 + 桥客户端 + contracts 包 + 审计事件增补） | 深链与桥对第三方来源（钉钉导出文件、WebDAV）也立刻有用；mock-first 可本地端到端 | 4–6 天 | [oa-plan.md](oa-plan.md) |
| 13 | **W1 工作台**（oa_base 配置链 + manifest 启动器 + 沙箱 Web 宿主 + 设备码登录复用） | 依赖 W0 与 W2 服务端最小集；个人版零增量是硬验收 | 4–6 天 | 同上 |

OA 服务端（OA-0 底座 → OA-1 审批/套版/归档 → OA-2 CRM/任务/连接器）在
[CatOfficeOA](../../CatOfficeOA/) 独立开发，排期不占本表；入口见
[CatOfficeOA/docs/product-plan.md](../../CatOfficeOA/docs/product-plan.md) 第 5 节。

### 一·六 未完成总清单（2026-09-04 盘点，全部开放项的唯一索引）

**A. 本地可开发（按建议顺序）**

| # | 项 | 位置/文档 | 说明 |
| --- | --- | --- | --- |
| N1 | **SA2 管理面 UI**：签章管理面板（素材章层级）——库列表/导入（含 SA1 检测直通）/重命名/删除/插入落章 | seal-library.ts 已有 CRUD；缺 shell 设置页或 docs 侧入口 + 骑年盖月替换接线 | 「签章管理模式」的可见面；SA3 未来同面板挂 CA 层 |
| N2 | **P1 品类继续扩充**：投标书/培训 deck/更多表格预设 | asset-center-plan 执行进度 | 每品类 0.5–1 天，穿插填充项 |
| N3 | **upstream-sync 文案覆盖层**：品牌 i18n 迁独立数据包（零冲突数据资产） | upstream-sync.md 待办#3 | 与上游同步冲突面归零，中等工作量 |
| N4 | **OA W0 桥与契约**：`catoffice://` 深链 + 桥客户端 + contracts 包 | oa-plan.md（第五梯队序 12） | mock-first 可本地端到端；依赖 OA 仓立项节奏 |

**B. 等外部输入（就绪即插队，见外部依赖表）**

| # | 项 | 等什么 |
| --- | --- | --- |
| N5 | A3 真实云目录切换验收 | CatSpark 服务端实现 catspark-integration 第六/七节契约 |
| N6 | T2 Windows 行高因子校准 | 真机 measurements.json（工具链已就绪 tools/word-lineheight-probe） |
| N7 | T5 行首/行尾压缩面 | Word 真机探针语义（同 N6 一趟机器） |
| N8 | T3 测量跨平台校验 | 真 Linux CI 跑 measure-font-linebox（等 CI 配额） |
| N9 | SA3.0 动态探针（真实 CA 样本解析）+ SA3 签章层 | CA 测试证书 |
| N10 | C5-OFD 立项 / WPS 国密容器互操作探针 | 业务决策 + WPS 加密真实样本 |
| N11 | W3 Windows 签名 | Azure Trusted Signing 资质 |
| N12 | L2 arm64 打包首跑 / dist-linux 验证 | CI 配额或真机 |
| N13 | Linux 真机走查（SUID/Wayland/桌面集成/云 OCR 冒烟）+ Windows 走查（T7 中文路径/W5 OCR helper） | 真机（清单见 linux-desktop-checklist.md / windows-issues.md） |

**C. 明确不做（已记录取舍，防重复讨论）**：IL3 harfbuzzjs 动态测量（条件项未触发）、
IL5 拼写词典下载（独立功能项）、rtlGutter（引擎无 gutter 建模）、sheets 显式
readingOrder 渲染（依赖 Univer 上游）、docs run 级 w:rtl 视觉嵌入（浏览器原生
UAX#9 已覆盖真实文本）——各自文档有完整理由。

### 持续线（穿插，不占独立排期）

- **P1 品类扩充**（见 6）：任何间隙的填充项。
- **CI 观察期**：test-windows 绿率跟踪、dist-linux 首跑验证（等 CI 配额）。
- **真机台账执行**（不阻塞本地开发，随时可并行安排）：
  - Windows：T2 行高探针跑批、T7 中文路径走查、W5 OCR helper 验证
    → [windows-issues.md](windows-issues.md)
  - Linux：arm64 dist 首跑、SUID/Wayland/桌面集成走查、云 OCR 冒烟
    → [linux-issues.md](linux-issues.md)

### 外部依赖项（不排期，等输入）

| 项 | 等什么 | 就绪后动作 |
| --- | --- | --- |
| A3 真实云目录 | CatSpark 服务端实现第六节契约 | 客户端零改动，切 `CATSPARK_API_BASE` 验收 |
| OA-0 服务端最小集 | OA 仓立项并交付底座 + manifest + 桥端点 | 桌面端 W1 切 `CATOFFICE_OA_BASE` 真实验收 |
| T2 行高因子校准 | 真机 measurements.json | reduce diff → win32 分派 |
| T5 行首/行尾压缩 | 真机探针语义 | 校准 punctuation-squeeze 扩展 |
| W3 签名 | Azure Trusted Signing 资质 | builder win 块加签名配置 |
| SA3.0 动态探针 | CA 测试证书（真实 PKCS#7 签名样本） | sa3-probe.md 动态节补测 → C5/SA3 决策依据 |
| WPS 国密互操作探针 | WPS 国密加密 docx 真实样本 | C5 互操作探针 → 容器兼容或桥接 |

## 二、节奏约定

- 每个工作项按既有节奏切刀：探底 → 实现 → 测试 → 提交 → 本表与专项文档
  双向回填。
- 大项（C1/C2/SA1）之间穿插小项（P1 扩充/C3）保持交付节奏。
- 任何真机/CI 输入到达时，对应外部依赖项插队到当前大项之后。

## 三、变更记录

| 日期 | 变更 |
| --- | --- |
| 2026-09-03 | 初版：四梯队 11 项 + 持续线 + 外部依赖清单 |
| 2026-09-04 | **第一梯队完成**：C1 审计日志（@catoffice/audit 包 8 测试 + shell 单写者接线 + 埋点 open/save/print/export/password/privacy/app + 设置页 read/verify IPC）；C2 上传同意（catspark upload-consent/telemetry 子路径 + ai:stream 门控 + 19 locale 分层弹窗 + mock 路由 22 测试）；C3 空闲锁定（idle-lock 清密钥 + 覆盖层 + 审计）。全 workspace 7887/7887 绿。第二梯队（SA1 印章检测）为下一项 |
| 2026-09-03 | 增补第五梯队 OA 集成线（W0 桥与契约 / W1 工作台）；新增
  [oa-plan.md](oa-plan.md) 与 OA 规划文档（产品 / 架构 / 契约） |
| 2026-09-04 | OA 规划文档迁出主仓至同级独立项目仓
  [CatOfficeOA](../../CatOfficeOA/)（docs-only，未编码） |

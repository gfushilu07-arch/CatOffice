# OA 集成与工作台：桌面端能力补充方案

> 状态：**规划**（本文只规划、不编码）。OA 系统（审批 / 客户 / 任务 / 员工管理等）
> 定位为**独立的服务端产品**，由客户部署在自有内网；客户已有的第三方系统
> （钉钉 / 企微 / 泛微 / 既有 CRM / 工单）通过连接器接入。本文档只规划
> **当前仓库（桌面端）需要补充的能力**；OA 自身的功能规划、架构设计与对接
> 契约见独立项目仓 [CatOfficeOA](../../CatOfficeOA/)（位于本仓库同级目录）。
>
> 总原则：**无配置即不存在**。未配置 OA 实例地址时，本文全部能力在桌面端
> 零 UI、零代码路径激活——个人版包体与体验不受任何影响。任何 OA 业务概念
> （CRM 字段、审批状态、任务看板）出现在桌面端代码中即视为架构违规。

## 一、定位与边界

桌面端对 OA 只承担三种角色，除此之外不承担任何 OA 功能：

| 角色 | 内容 | 桌面端新增物 |
| --- | --- | --- |
| **发现** | 知道内网里有一个 OA 实例 | 配置链（策略 > 用户配置 > 无） |
| **宿主** | 把 OA 的 Web 模块装进沙箱窗口 | manifest 启动器 + 沙箱 WebContentsView |
| **文档桥** | OA 的文件用真编辑器打开、保存回去 | `catoffice://` 深链 + 桥客户端 |

**防膨胀条款**（评审任何新需求前逐条对照）：

1. 桌面端不写 OA 业务代码——桌面端只认识 manifest、桥协议和 Web 视图。
2. OA 侧新增模块时桌面端不许发版——启动器由服务端清单驱动。
3. OA → 本地文件的每次写入必须用户显式确认，审计必记。
4. 无配置即不存在：`oa_base` 未配置时工作台代码路径完全不激活。

## 二、能力总览与顺序

| 项 | 内容 | 前置 | 状态 |
| --- | --- | --- | --- |
| W0.1 | `catoffice://` 深链协议 | 无 | 规划 |
| W0.2 | 桥客户端 `@catoffice/bridge` | W0.1 | 规划 |
| W0.3 | 契约包 `@catoffice/contracts` | 无（可与 W0.1 并行） | 规划 |
| W0.4 | 审计事件增补 | C1（已交付） | 规划 |
| W1.1 | `oa_base` 配置链 | W0.3 | 规划 |
| W1.2 | manifest 客户端与降级 | W1.1 | 规划 |
| W1.3 | 工作台启动器 UI | W1.2 | 规划 |
| W1.4 | 沙箱 Web 宿主 | W1.1 | 规划 |
| W1.5 | OA 设备码登录复用 | W1.1 | 规划 |

执行顺序：**W0 桥先行 → W1 工作台**。W0 在 mock 下即可端到端测试，且
（对 WebDAV / 钉钉导出文件等第三方来源）立刻有用。排期见
[roadmap.md](roadmap.md) 第五梯队。

> 范围说明：场景准入判据（吸收 / 桥接 / 拒绝）下「吸收类」能力——文件工具箱
> （压缩 / 批量水印 / OCR）、邮件合并与数据源——已有 P1 落点在
> [product-plan.md](product-plan.md) 9.2 / 12.2 节，本文只覆盖 OA 集成的
> **新增**能力。

## 三、W0 详细方案

### W0.1 `catoffice://` 深链协议

- 三平台协议注册（Windows 注册表 / macOS scheme / Linux desktop file），
  单实例路由到已运行窗口。
- 参数 zod schema：`open`（`base` + `doc` + `mode=edit|view`）、
  `create`（`base` + `template` + `data` 引用）。
- **安全**：深链不带长期凭据；`base` 必须命中已配置 origin 白名单
  （策略下发或用户添加），否则拒绝并提示。`create` 的 `data` 只接受
  URL 引用或尺寸受限的 base64 JSON（上限 64 KiB）。
- 工程落点：shell 主进程协议模块；参数校验沿用 IPC zod 惯例。

### W0.2 桥客户端 `@catoffice/bridge`（新包，纯 TS）

- 职责：凭已登录 OA 会话换取**短时效、单文档**桥 token → 下载文件 →
  交编辑器打开 → 登记会话 → 回传。协议细节见
  [CatOfficeOA/docs/contracts.md](../../CatOfficeOA/docs/contracts.md)。
- 回传前**必须经桌面端确认对话框**（列出目标文档名与 OA 实例），确认后
  执行并审计；OA 网页永远不能静默触发对本地文件的写。
- 与编辑器解耦：桥包只负责「取文件 / 交文件 / 记会话」；编辑器以既有
  「打开文件」入口接入（等价于打开一个本地临时副本，保存时触发回传）。
- 测试：token 交换 / 过期 / 单文档绑定 / 确认拦截 / 断网降级；mock OA
  服务器先行（见 [CatOfficeOA/docs/contracts.md](../../CatOfficeOA/docs/contracts.md) 第零节）。

### W0.3 契约包 `@catoffice/contracts`

- zod schema：manifest、桥 API 请求与响应、深链参数、错误码表。
- 桌面端与 OA 仓共用同一包，schema 即契约，杜绝两侧漂移；OA 仓建仓后
  以契约测试对齐（mock-first 模式，同 catspark 惯例）。

### W0.4 审计事件增补（进 C1 事件清单）

| action | 触发点 | detail 约束 |
| --- | --- | --- |
| `bridge.doc.open` | 桥打开 OA 文档成功 | OA 实例 origin、docId、文件大小（不含内容） |
| `bridge.doc.save` | 桥回传成功 | docId、新增/修改/删除字数（不记内容） |
| `workbench.module.open` | 工作台打开模块 | module id |
| `workbench.config.change` | oa_base 配置变化 | 新 origin（不含凭据） |

C1 红线不变：任何事件不得携带文档内容、AI prompt/回复、凭据。

## 四、W1 详细方案

### W1.1 `oa_base` 配置链

优先级（高 → 低）：

1. **企业策略下发**（托管配置文件 / GPO / plist，字段 `oa.base`、`oa.disabled`）；
2. **设置页用户配置**（手动添加内网地址，校验 http(s) 与可达性）；
3. **环境变量 `CATOFFICE_OA_BASE`**（开发与 mock 用）；
4. 未配置 → **工作台整体不存在**：首页不渲染分区、设置页不出现入口；
   `CATOFFICE_OA_DISABLED=1` 时连配置入口都移除（政务隔离交付形态）。

### W1.2 manifest 客户端与降级

- `GET {oa_base}/api/manifest`，zod 校验；任何失败（网络 / 非 200 /
  坏字段）→ 工作台显示「不可达」占位并允许重试，**绝不阻塞编辑器主流程**
  （语义对齐 asset_center 客户端：失败降级、resolve 空）。
- manifest 完整语义见
  [CatOfficeOA/docs/contracts.md](../../CatOfficeOA/docs/contracts.md)。

### W1.3 工作台启动器 UI

- 壳首页新增「工作台」分区：manifest 驱动的模块卡片（图标 / 名称 /
  描述），**通用渲染，不理解任何具体模块 id**。
- 点击模块 → 打开沙箱宿主窗口；未登录 → 先走设备码登录，回来续流程。

### W1.4 沙箱 Web 宿主

- 独立 `WebContentsView`：独立 session 分区、`contextIsolation`、无 Node、
  外链走既有白名单门。
- **OA 页面按敌对内容处理**：SSO 凭据只注入 manifest 声明的 origin；
  不向页面暴露任何 elevated IPC；下载 / 剪贴板等能力默认关闭。
- 宿主窗口与编辑器窗口同壳不同分区，可并排使用。

### W1.5 OA 设备码登录复用

- 复用既有设备码流实现（`packages/ai-search/src/genoffice-auth.ts` 的流程，
  抽取共用），对接 OA 的 `/api/auth/device_code` + `/api/auth/token`
  （契约见 oa/contracts.md 第二节，与 catspark 同构）。
- 登录态独立于 CatSpark 账号（OA 是客户的实例）；凭据只存本机。

## 五、环境变量（契约表）

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `CATOFFICE_OA_BASE` | OA 实例地址（设置即激活工作台；开发 / 真实验收用） | 未设置 = 工作台不存在 |
| `CATOFFICE_OA_DISABLED` | `1` 整体禁用（政务隔离交付，配置入口也不出现） | — |
| `CATOFFICE_OA_MOCK` | `1` 强制内嵌 mock OA（开发 / e2e） | — |

## 六、验收口径

1. **个人版零增量**：不配置任何变量时，首页 / 设置页无工作台痕迹，
   包体积增量 < 50 KB。
2. mock OA 下端到端：设置页添加地址 → 工作台出卡片 → 打开模块 →
   桥打开文档 → 编辑保存 → 回传成功 → 审计链完整可校验。
3. 深链安全：未配置 origin 的 `catoffice://` 调用被拒绝并提示。
4. 宿主隔离：OA 页面无法访问编辑器 IPC 与本地文件系统（自动化断言 +
   人工走查）。
5. 降级：manifest 不可达时编辑器主流程零影响，工作台可重试。

## 七、与既有规划的接口

| 文档 | 关系 |
| --- | --- |
| [roadmap.md](roadmap.md) | W0 / W1 列入第五梯队（OA 集成线） |
| [compliance-plan.md](compliance-plan.md) | C1 事件表随 W0.4 增补；C2「写入必确认」原则在桥上延续 |
| [catspark-integration.md](catspark-integration.md) | 设备码登录流复用；mock-first 契约开发模式复用 |
| [asset-center-plan.md](asset-center-plan.md) | manifest「元数据驱动 + 失败降级」语义的先例 |
| [CatOfficeOA](../../CatOfficeOA/) | OA 独立项目仓：产品规划 / 架构设计 / 对接契约 |

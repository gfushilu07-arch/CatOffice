# CatOffice OA · 对接契约（v0 草案）

> 状态：**草案**（只规划、不编码）。本契约是桌面端（主仓）与 OA 服务端
> （新仓）之间的稳定接缝，落地时固化为 `@catoffice/contracts`（zod schema，
> 双仓共享）。开发模式沿用 catspark 惯例：**mock-first**——桌面端对 mock OA
> 完整实现并联测，真实服务端实现契约后仅需切换 `CATOFFICE_OA_BASE`。

## 零、mock OA

- 内嵌 mock 服务器（`@catoffice/oa-mock` 或并入 catspark mock 服务器，
  立项定），零 npm 依赖，node:http 实现，端口默认 `45918`
  （`CATOFFICE_OA_MOCK_PORT` 覆盖，健康探测 `/mock/health`）。
- 覆盖面：manifest / 设备码登录全流 / 桥三端点 / 审计上报接收。
- 桥文件下载返回真 docx 夹具（`docx-engine` 生成器产出，与 catspark
  mock 的 deck-fixture 同法再生）。

## 一、manifest（模块发现）

```
GET {oa_base}/api/manifest
→ 200
{
  "suite": "catoffice-oa",
  "version": "1.2.0",                      // 服务端版本
  "modules": [
    {
      "id": "approval",                     // 稳定 id；桌面端不理解其语义
      "label": "审批",
      "description": "公文签发 / 合同会签",
      "icon": "…",                          // 数据 URL 或相对路径（经 oa_base 解析）
      "url": "/flow/"                       // 模块 Web 入口（相对 oa_base）
    }
  ],
  "auth": { "deviceCode": "/api/auth/device_code", "token": "/api/auth/token" },
  "bridge": { "base": "/api/bridge" }
}
```

语义要点：

- **清单驱动**：桌面端通用渲染 modules，新增模块桌面端零发版。
- 校验失败 / 非 200 / 网络错误 → 工作台显示「不可达」可重试，不阻塞
  编辑器主流程（对齐 asset_center 失败降级语义）。

## 二、认证（设备码，与 catspark 同构）

| 方法与路径 | 请求 | 必需响应字段 |
| --- | --- | --- |
| `POST {oa_base}/api/auth/device_code` | 无 body | `{device_code, auth_url, expires_in?, poll_interval?}` |
| `GET {oa_base}/api/auth/token?code={device_code}` | 轮询至 approved | `{status: "pending"\|"approved", access_token}` |
| `POST {oa_base}/api/auth/revoke` | `Authorization: Bearer` | best-effort，登出用 |

- `auth_url` 在 OA Web 上展示码并批准；浏览器同源内网可达。
- 登录态独立于 CatSpark 账号；凭据只存本机（userData，不上云）。
- 复用桌面端既有设备码流实现（`packages/ai-search/src/genoffice-auth.ts`
  流程抽取共用），**不发明新登录流**。

## 三、文档桥（桌面端真编辑器 × OA 文件）

桥 token 模型：**短时效（默认 5 分钟）、单文档、单操作**；由桌面端持
access_token 换取，OA Web 前端不得直接获取（它只生成深链，token 由桌面端
自行向 OA 索取）。

| 方法与路径 | 请求 | 必需响应字段 |
| --- | --- | --- |
| `POST {bridge}/session` | `{doc_id, intent: "edit"\|"view"\|"create"}` + Bearer | `{session_id, doc_meta: {name, version, size, mime}, download: {url, expires_in}, upload: {url, expires_in}}` |
| `GET {download.url}`（签名直链，免额外鉴权） | — | 文件字节流 |
| `PUT {upload.url}` | 文件字节流 | `{version}`（新版本号，不覆盖历史） |

会话语义：

- `session_id` 登记「谁在何时取走哪个版本」；他人已持活跃 edit 会话时
  新 edit 请求返回 `409 {active_session}`（只读不受限）。
- `upload.url` **仅绑定该 session**；过期 / 未确认回传即作废。
- 回传前桌面端必须弹确认（目标文档名 + OA 实例 origin）；确认与回传
  结果均落审计（桌面 W0.4 事件 + 服务端审计汇聚）。
- 冲突：回传时服务端校验 `session_id` 仍活跃且版本基线未变，否则
  `409 {version_ahead}`——回传转为新副本建议，不静默合并。

## 四、深链协议（`catoffice://`）

| 动作 | 形式 | 行为 |
| --- | --- | --- |
| 打开 | `catoffice://open?base={origin}&doc={doc_id}&mode=edit\|view` | 桌面端校验 base 命中已配置白名单 → 取 access_token（未登录则先登录）→ 桥 session → 下载 → 编辑器打开 |
| 新建 | `catoffice://create?base={origin}&template={id}&data={url\|base64}` | 模板套版（服务端或本地生成器）→ 编辑器打开 → 保存回传为新文档 |

安全约束（完整版见 [../oa-plan.md](../oa-plan.md) W0.1）：

- `base` 必须命中已配置 origin（策略下发 / 用户添加），否则拒绝。
- 深链不携带长期凭据；`data` 引用上限 64 KiB。
- OA Web 侧「用办公猫打开」按钮 = 生成深链；桌面端未安装时降级 Web 预览
  （按钮组件由 OA 前端实现，桌面端无感知）。

## 五、审计上报（服务端汇聚，M0）

| 方法与路径 | 请求 | 响应 |
| --- | --- | --- |
| `POST {oa_base}/api/audit/report` | 批量 JSONL 事件（桌面 C1 格式，含哈希链）+ Bearer | `{accepted: n}` |

- 内容红线与 C1 相同：不含文档内容 / prompt / 凭据；仅 `ai.session.*`、
  `bridge.*`、`workbench.*` 等白名单 action 前缀可上报。
- 企业策略可强制开启上报（等保「覆盖每个用户」）；隔离网 `oa.disabled`
  时无此端点调用。
- 服务端汇聚侧落自有哈希链并支持断链定位（同 C1 校验工具语义）。

## 六、错误码表（桥与 manifest 通用）

| code | HTTP | 语义 | 桌面端行为 |
| --- | --- | --- | --- |
| `unauthorized` | 401 | access_token 失效 | 重走设备码登录 |
| `forbidden_base` | 403 | base 未在白名单 | 提示拒绝，不入配置 |
| `doc_not_found` | 404 | doc_id 无效 | 提示并终止 |
| `active_session` | 409 | 他人编辑中 | 提示只读打开或稍后 |
| `version_ahead` | 409 | 版本基线变化 | 建议另存新副本 |
| `session_expired` | 410 | 桥 token 过期 | 重新建会话 |
| `manifest_unreachable` | — | 实例不可达 | 工作台占位可重试 |

## 七、验收（契约层）

1. mock 下桌面端端到端：加配置 → 登录 → manifest 渲染 → 桥打开 → 编辑
   → 确认回传 → 版本 +1 → 审计链可校验（双端事件齐全）。
2. 契约测试：OA 仓实现以 `@catoffice/contracts` schema 跑同一套例；桌面端
   测试不依赖具体 origin（同 catspark 验收第 2 条语义）。
3. 安全用例：未配置 base 的深链拒绝；OA Web 无法获取桥 token；
   `active_session` / `version_ahead` 冲突路径不产生静默覆盖。
4. 隔离：`CATOFFICE_OA_DISABLED=1` 时零调用、零 UI。

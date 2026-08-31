# CatSpark 后端对接契约

办公猫客户端已把**全部云端调用收敛到一个接缝包 `packages/catspark`**。后端把下列接口实现完，桌面端只需改环境变量即完成切换，无需改代码。

## 零、Mock 模式（当前默认）

真实 CatSpark 服务端（Rust/axle）就绪之前，客户端默认运行在 **mock 模式**：无需任何配置和后端部署即可端到端跑通。`cloudOrigin()` 指向**内嵌 mock 服务器**（`@catoffice/catspark/mock`，零 npm 依赖，node:http 实现），由每个主进程入口启动（`void startMockCloud()`，端口 `45917`，被占时健康探测 `/mock/health` 复用兄弟进程实例）。

| 覆盖面 | mock 方式 |
| --- | --- |
| 设备码登录 → 铸 key（`~/.genoffice/auth.json`） | HTTP 全仿真：`/mock/approve?code=…` 打开即自动批准，轮询 1 次即 approved，key 形如 `gsk-mock-…` |
| LLM 代理（anthropic / gemini / openai 兼容） | 返回**完整 JSON 消息**（三条协议客户端都原生兼容非 SSE 响应，见 ai-provider `jsonBodyInsteadOfSse`），正文为标注 `[CatSpark mock]` 的演示回复并回显模型名与最后一条用户消息 |
| tool_cli `slide_generate` + `file/download` | NDJSON 心跳+结果；pptx_url 指向内置夹具（`@genoffice/pptx-engine createBlankPptx` 生成的 16:9 单页，slides 导入器必然可开） |
| gsk CLI 系功能（搜索/图搜/图生/云项目列表/账号信息/转写/媒体分析） | **JS 层罐头数据**（`@catoffice/catspark/mock` 的 `mock*` 函数），CLI 子进程在 mock 模式下绝不启动；图生/图搜返回 mock 服务器现生成的真 PNG（node:zlib 手工编码） |
| PDF→Word 云转换 | **明确报错**（伪造 DOCX 会与真实转换故障无法区分） |
| 积分用量页 | mock 服务器 HTML 页（余额 ∞） |
| SSRF 守卫 | `fetchWithSsrfGuard` 在 mock 模式放行且仅放行 mock 源这一个环回 origin |

模式判定（`isMockMode()`）：`CATSPARK_MOCK=1` 强制开（压过一切）；否则配置了 `CATSPARK_API_BASE` / `GSK_BASE_URL` 即关（直连真实后端/上游）；`CATSPARK_MOCK=0` 恢复旧默认（无配置时直连上游 `https://www.genspark.ai`）；vitest 下默认关（存量测试保持上游语义），mock 行为测试用 `CATSPARK_MOCK=1` 显式开启。

端口与多进程：默认 `45917`，`CATSPARK_MOCK_PORT` 覆盖；shell 以模块方式内嵌五个编辑器，shell 主入口与各独立入口各调一次 `startMockCloud()`，靠单例 + 健康探测去重。

## 切换开关（部署时设置）

| 环境变量 | 作用 | 默认值（开发期 = 内嵌 mock 服务器） |
| --- | --- | --- |
| `CATSPARK_API_BASE` | **总开关**：登录、LLM 代理、云项目、积分页全部派生自它；设置后自动脱离 mock | mock 源 `http://127.0.0.1:45917` |
| `CATSPARK_MOCK` | `1` 强制 mock（压过 API_BASE，调试用）；`0` 恢复「无配置即直连上游」的旧默认 | — |
| `CATSPARK_MOCK_PORT` | 内嵌 mock 服务器端口 | `45917` |
| `CATSPARK_LLM_ANTHROPIC_BASE` / `_GEMINI_` / `_OPENAI_` | 覆盖单个协议的 LLM 代理地址（混合部署时用） | `$CATSPARK_API_BASE/api/anthropic` 等 |
| `CATSPARK_TOOL_CLI_BASE` | 结构化工具调用端点 | `$CATSPARK_API_BASE/api/tool_cli` |
| `CATSPARK_AGENT_TYPE` | 自定义网关的计费归因头（`X-Agent-Type`）；默认源固定 `genoffice`，mock 源不带该头 | — |
| `CATSPARK_CREDIT_USAGE_URL` | 设置页打开的用量页 | `$CATSPARK_API_BASE/credit-usage` |
| `CATSPARK_IMAGE_HOSTS` | 图片下载附加 Referer 的自定义 CDN 域名列表（逗号分隔） | — |
| `CATSPARK_GITHUB_REPO` | GitHub 仓库（`owner/repo`）：About 页星数仓库与全部 Star CTA（设置页字段、Star 提示卡、Onboarding）的数据源；置空即全禁用 | `cat-office/catoffice` |

兼容性说明：旧变量 `GSK_BASE_URL`（上游 CLI 引导）仍然生效，优先级在 `CATSPARK_API_BASE` 之后。

## 一、设备码登录（app_type=genoffice，存储于 ~/.genoffice/auth.json）

实现参考：`packages/ai-search/src/genoffice-auth.ts`。

| 方法与路径 | 请求 | 必需响应字段 |
| --- | --- | --- |
| `POST {base}/api/office_addin_auth/device_code?app_type=genoffice` | 无 body | `{device_code, auth_url, expires_in?, poll_interval?}` |
| `GET {base}/api/office_addin_auth/token?code={device_code}` | 轮询直到 approved | `{status: "pending"\|"approved", access_token}`（approved 且无 token 视为过期） |
| `POST {base}/api/office_addin_auth/session` | `Authorization: Bearer {access_token}` | 成功 + `Set-Cookie`（会话 cookie） |
| `POST {base}/api/api_tokens/create` | Cookie + JSON `{key_name: "genoffice"}` | `{data: {token, key_id}, message?}`；token 即后续 API key |
| `POST {base}/api/api_tokens/revoke` | Cookie + JSON `{key_id}` | 仅 best-effort，登出用 |

注意：非浏览器请求会被 Cloudflare 类质询拦截，所以客户端走 Chromium `net.fetch`；CatSpark 网关需对这三个 `/api/office_addin_auth/*` 路径放行程序化客户端或做等价校验。超时 30s。

## 二、LLM 代理（三种协议共用一个 api key）

| 协议 | Base（默认派生） |
| --- | --- |
| Anthropic | `{base}/api/anthropic`（含 `/v1/messages` 由客户端拼接） |
| Gemini | `{base}/api/llm_proxy/gemini/v1beta` |
| OpenAI 兼容 | `{base}/api/llm_proxy/v1`（`chat/completions`） |

- 鉴权：gsk API key（`X-Api-Key` 或各协议原生鉴权头，与上游一致）。
- 计费归因：凡 baseUrl 在本源前缀下都带 `X-Agent-Type`；直连厂商 API 不带。模型 id 使用代理自有命名（claude-opus-4-8 / gpt-5.6 / gemini-3.7-flash 等，见 `packages/ai-provider/src/providers.ts`），CatSpark 网关需支持同一套别名映射。

## 三、tool_cli（结构化云工具）

`POST {base}/api/tool_cli/{tool}`：

- 头：`X-Api-Key`、`Content-Type: application/json`、`X-Agent-Type`。
- 体：JSON 参数（如 slide_generate 的 `{brief, deck_context, images, width, height, tier}`）。
- 响应：**NDJSON 流**，心跳行为普通 JSON 行，最后一行形如 `{"status":"ok"|"error","message":...,"data":...}`（解析器 `parseToolCliNdjson`）。
- 客户端另以子进程方式使用 `@genspark/cli`（search/img/media analysis/upload/transcription/download）。过渡期安装包仍内置上游 CLI；CatSpark 提供同参数界面的 CLI 后通过 `GSK_CLI_PATH` 热插拔或直接换打包资源（对应规划文档中的「自有代理」线）。

### 文件直链

生成结果里的 `/api/files/…` 包裹链接返回 403，需提供免鉴权直链换取能力：CLI `download <url>` 返回 `{download_url}`（签名直链）。若 CatSpark 的文件服务天然支持匿名 GET，可省略该交换并在上传时直接返回可下载 URL。

## 四、Web 资源

- 云项目打开：`{GENSPARK_ORIGIN}{project_url}`（origin 来自 `cloudOrigin()`）。
- 用量页：`creditUsageUrl()`。
- 图片 CDN：AI 生图/搜索图落在本域或 *.genspark.ai 时会带 `Referer: {origin}/`——自有 CDN 域名用 `CATSPARK_IMAGE_HOSTS` 登记，否则裸取可能被拒。

## 五、验收

1. mock 模式：`pnpm --filter @catoffice/catspark test && pnpm --filter @genoffice/ai-search test`（登录流/三协议/slide_generate 端到端 + 罐头数据分支全绿）；应用侧 `pnpm run dev` 启动后设置页登录（mock 秒批）→ 模型对话返回 `[CatSpark mock]` 演示回复 → 首页出现样例云项目。
2. 真实网关：设 `CATSPARK_API_BASE=https://your.gateway` 跑 `pnpm --filter @catoffice/catspark exec tsc --noEmit && pnpm --filter @genoffice/ai-search test && pnpm --filter @genoffice/ai-provider test`（全部应绿：测试不依赖具体 origin，只依赖接缝语义；vitest 下 mock 默认关，回归上游语义）。
3. 手动冒烟（真实网关）：设置页登录 → 模型对话流式输出 → PDF→Word 云转换 → 首页云项目列表。mock 模式下 PDF→Word 有意报错（见第零节）。

### mock 夹具再生

`packages/catspark/src/mock/deck-fixture.ts` 为生成文件（pptx-engine 空白演示 → gzip → base64）。pptx-engine 夹具结构变更后用一次性脚本再生成：`node --experimental-strip-types` 执行「`import { createBlankPptx }` → `gzipSync` → 逐 96 列 base64 写入 `deck-fixture.ts`」即可，勿手改。

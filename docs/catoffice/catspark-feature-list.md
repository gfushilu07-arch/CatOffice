# CatSpark 功能需求清单 v0.1

> 供后续基于自研 Rust 框架 **axle** 开发使用。本文只定「要什么」，不定实现方式。
> 客户端契约细节（请求/响应字段、NDJSON 流格式）见 [catspark-integration.md](catspark-integration.md)；
> 分级沿用产品规划（product-plan.md §14/§19/§20）：**P0** = 对齐上游、桌面端今天就在用；**P1** = 自有网关差异化与对外发布前置；**P2** = 企业与远期。

优先级判定原则：P0 缺一件，办公猫对应云功能即瘫；P1 是对外公开发布前必须补齐的合规与商业化件；P2 不阻塞任何桌面端功能。

---

## 一、账号与认证（P0）

| # | 功能 | 说明 | 客户端契约锚点 | 验收要点 |
| --- | --- | --- | --- | --- |
| A1 | 设备码登录流程 | `device_code → 浏览器授权 → token 轮询 → session cookie → API key 签发` 五端点；`app_type=genoffice` 隔离客户端流量 | integration.md 一节五端点表 | 全程无浏览器指纹要求（程序化客户端可直接过）；30s 超时内应答 |
| A2 | API key 管理 | 按用户签发/吊销命名 key（`key_name="genoffice"`→billing_tag）；同 key 重登自动换发 | `/api/api_tokens/create` `/revoke` | key 列表页可见、可手动吊销；重登旧 key 自动失效 |
| A3 | 登录信息查询 | 返回 `email` / `plan` / `creditBalance`（余额缺失时客户端静默隐藏 UI） | CLI 子命令 `login-info` ↔ `GskLoginInfo` | 三字段齐全才显示设置页账户区 |
| A4 | 会话与程序化访问 | 登录三端点需放行非浏览器客户端（上游用 Cloudflare 质询挡，CatSpark 用自有风控替代即可） | net.fetch 直连 | 无 JS 质询、无浏览器环境探测 |

## 二、LLM 网关（P0 核心计费点）

| # | 功能 | 说明 | 契约锚点 | 验收要点 |
| --- | --- | --- | --- | --- |
| B1 | 三协议入口 | Anthropic messages、Gemini generateContent、OpenAI chat/completions 同一 key 通用 | `$base/api/anthropic`、`/api/llm_proxy/gemini/v1beta`、`/api/llm_proxy/v1` | 办公猫 ai-provider 三条路由零修改可用 |
| B2 | 流式响应 | SSE/chunked 全链路流式透传，端到端首 token < 上游 +500ms | stream.test.ts 断言的 header 行为 | 打字机效果不卡顿 |
| B3 | 模型别名映射 | `claude-opus-4-8`、`gpt-5.6`(terra/luna)、`gemini-3.7-flash` 等**代理自有 id** → 各厂商真实模型（providers.ts 的清单是权威表）；映射可配置热更 | providers.ts models 数组 | 未识别模型 id 返回明确错误而非静默降级 |
| B4 | 多供应商路由池 | 同一别名可配多家上游（含国内镜像/vLLM），按价格/余量/健康度调度，故障自动切换 | — | 单家上游宕机不影响对话 |
| B5 | 计费归因 | 读 `X-Agent-Type` 头把流量记账到指定桶；默认源下该头恒为 `genoffice`，自定义网关可自定义值 | attributionHeaders() 语义 | 按 Agent-Type 出计量报表 |
| B6 | 计量埋点 | 每次 LLM 调用记录 user/key/model/prompt+completion tokens/耗时/上游成本 → 积分换算 | billing C 组 | 积分扣减与报表可对账 |
| B7 | 内容安全管线 | **对外发布前必须**：输入/输出双向审核回调接口先留桩，接数美/网易易盾或自审模型 | — | 审核命中时返回结构化拦截错误 |

## 三、AI 工具（P0，NDJSON 协议）

统一契约：`POST /api/tool_cli/{tool}`，头 `X-Api-Key` + `X-Agent-Type`，请求 JSON，响应 **NDJSON**（心跳行 + 末行 `{status:"ok"\|"error", message?, data}`）。同时这些能力以等价语义暴露为 CLI 子命令（过渡期上游 gsk CLI 在客户端侧执行——CatSpark 直接开 HTTP 即可砍掉 CLI）。

| # | 工具 | 输入要点 | 输出要点 | 时限参考 |
| --- | --- | --- | --- | --- |
| T1 | `search` Web 搜索 | query（可选地区/语言） | 结果列表（标题/链接/摘要），与 parseGskWebSearch 对齐 | 60s |
| T2 | `img-search` 图片搜索 | query + max_results | 图片 URL 列表（元数据宽度高度/来源页） | 60s |
| T3 | `img` AI 生图 | prompt、model（可选）、reference_image_urls[]、aspect_ratio、image_size | 文件包装 URL（`/api/files/…`） | 600s |
| T4 | `media-analyze` 媒体分析 | media_urls[]（支持公网 URL 或服务端代下载）、requirements 自然语言说明提取什么 | 结构化文本结论 | 600s |
| T5 | `transcribe` 音频转写 | audio_urls[]、prompt（专名提示）、model（whisper-1/gemini-flash/scribe_v2） | 含时间戳文本 | 600s |
| T6 | `slide_generate` 单页幻灯片生成 | brief、title?、style_skill?、deck_context、images[{url,caption}]、width/height、tier=standard\|ultra | pptx 文件 URL | 240s（注意发心跳保活） |
| T7 | `convert` PDF→Word 云转换 | pdf 文件 | docx 文件 URL | 客户端 UI 定价约定 **5 credits/次**，错误需区分「余额不足」 |
| T8 | `download` 文件直链 | file_wrapper_url | `{data:{download_url}}` 签名直链 | 直链有效期内免鉴权 GET |

## 四、文件存储与 CDN（P0）

| # | 功能 | 说明 | 验收要点 |
| --- | --- | --- | --- |
| F1 | 文件上传 | 接收上传并返回 file_wrapper_url（媒体转写前自动上传走的就是它）；大小上限待定义（音视频场景预留 ≥500MB） | 分片/断点续传 P1 可选，P0 单请求可接受 |
| F2 | 私有存储 + 签名直链 | 对象存储私有桶，T8 换取限时签名 GET；生命周期策略清理过期生成物 | 直链在客户端插入图片后仍可多次读取 |
| F3 | CDN Referer 策略 | 生图结果域落在自有域名，配合客户端 `CATSPARK_IMAGE_HOSTS` 白名单，裸 Referer 拒绝规则要宽松于上游（避免再学 sspark 的防盗链坑） | 办公猫插图流水线零改动能拉图 |

## 五、云项目（P0 只读）

| # | 功能 | 说明 | 契约锚点 |
| --- | --- | --- | --- |
| J1 | 项目列表分页 | `projects`：`artifact_types` 过滤（类型前缀匹配：`docs_agent*`/`sheets_agent_new`/`slides_agent_git*`）、`limit/offset`，单页 ≤100、总量封顶 1000 | parseGskPastProjects 字段（type/title/url/ctime） |
| J2 | 时间戳约定 | ctime 无时区标记按 UTC 解析——返回 ISO 带 Z 或纯 UTC | ctimeToMs 兼容两种 |
| J3 | 点击行为 | 首版直接打开 web 地址占位；办公猫自己的 Web 编辑器（规划 P2）就绪后替换目标 | home-api.ts CloudProjectEntry |

## 六、计费与账户中心（P0 最小闭环 → P1 完整）

| # | 功能 | 级别 | 说明 |
| --- | --- | --- | --- |
| C1 | credits 事务账本 | P0 | 扣减原子化（LLM/token、生图、转换各自定价），余额不足时工具明确报错文案 |
| C2 | 定价配置 | P0 | 单表热更：各模型百万 token 价、生图单价、转换 5 credits |
| C3 | 用量页 `/credit-usage` | P0 | 设置页「查看用量」跳转目标；列明细明细账 |
| C4 | plan 档位 | P1 | free/pro 配额上限、管理员手工调整后台 |
| C5 | 支付接入 | P1 | Pro 订阅（对规划 §20 商业模式的网关额度收费） |

## 七、发布通道（P1，桌面发版依赖）

| # | 功能 | 说明 |
| --- | --- | --- |
| R1 | electron-updater 托管 | generic provider：伺服 `latest-mac.yml` / `latest.yml` + 安装包对象存储；客户端 `GENOFFICE_UPDATE_URL`/对应 env 指过来即启用内置更新 |
| R2 | 国内 CDN 分发 | dmg/exe 大文件分发 + 增量（mac zip / win NSIS delta 视 electron-builder 能力） |
| R3 | 版本灰度/回滚 | 更新 feed 分 channel（latest/beta） |

## 八、企业线（P2，对接规划 §20 企业版）

- E1 组织/成员/角色与租户隔离（同一 key 体系挂 org 维度）
- E2 SSO（OIDC/SAML）
- E3 审计日志导出（谁在何时用什么模型处理了什么文档 id——不含正文）
- E4 私有化部署形态（vLLM 本地路由池直连，License 校验服务）
- E5 DLP 出口白名单在网关层强制执行（正文的出网点唯一可信）
- E6 信创兼容：仅 x86_64/aarch64 Linux + 国产 OS 适配项登记

## 九、运营支撑（P1–P2）

- O1 请求级 trace-id 回传（客户端报错一键带上下文，联调神器）——建议 P1 尽早做，对 AI 辅助排障价值极高
- O2 服务指标看板（QPS/成本/成功率 per provider/model）
- O3 技能包分发服务（版本化 skills 目录 HTTP 化，对应规划 §14.4）
- O4 风控与滥用防护（key 速率限制、异常量告警）——P1 前置最小限速

## 十、明确不做（防止范围爆炸，对齐 product-plan 附录 D）

- IM / 邮件 / 日历 / 协作社区类功能
- 通用对象存储开放平台（存储只为办公猫业务服务）
- 文件格式锁定类能力（文档必须永远能被 Word/WPS 打开）
- 通用 llm 网关开放给第三方应用（第一年）

## 附：axle 服务拆分建议（参考，非约束）

按数据一致性边界拆五个进程即可起步，不必微服务化：

```
auth-svc      A1–A4        （有状态最少，最先稳定）
llm-gateway   B1–B6        （长连接密集，独立扩缩容）
tools-svc     T1–T8, J1–J3 （异步长任务：slide_generate/convert 走任务队列+心跳 NDJSON）
files-svc     F1–F3        （签名直签与桶交互独立成模块即可，前期可与 tools-svc 同进程）
billing-svc   C1–C4        （强一致账本，单独库）
admin-web     运营后台      （读侧为主，随时可加）
```

研发顺序建议：auth-svc + llm-gateway 先行（打通登录与对话即可演示全链路）→ tools-svc 三件套（search/img/slide_generate）→ files-svc 与 convert → billing 收口 → 其余。

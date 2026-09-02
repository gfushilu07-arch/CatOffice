# 素材中心规划（对标 WPS 稻壳儿）

> 状态：**规划中，未开工**。本文档定义定位、品类、架构与分期；开工顺序见文末与 cross-platform-plan.md 的衔接。

## 一、定位

WPS 稻壳儿 = 模板/素材商城（在线模板库、会员体系、贡献者生态）。CatOffice 素材中心对齐「新建即套模板」的核心场景，差异化三点：

1. **模板即 docx**：字节级保真引擎是产品根基——模板不用自有格式、不用转换器，就是普通 docx，打开即编辑、保存不破坏（对标稻壳儿需要 WPS 专属格式/会员解锁的体验）。
2. **本地优先**：内置模板层零网络可用（离线/信创隔离环境完整可用），与跨平台规划「bundled 兜底」哲学一致；云目录是增强而非依赖。
3. **AI 套版**：product-plan.md §9.3 已规划「公文套版」AI 技能（把草稿套进标准红头）——素材中心为它提供模板供给，AI 填充 ×× 占位符（govt-template.ts 已确立该惯例）。

## 二、内容品类（分期）

| 期 | 品类 | 内容 |
| --- | --- | --- |
| P0 | 公文模板 | GB/T 9704 全套：通知/请示/报告/函/纪要 + 红头变体（横版/联合发文）；`govt-template.ts` 生成器是第一件内容 |
| P1 | 办公文档模板 | 合同、简历、会议纪要、周报；表格模板（预算/排班/台账）；演示模板（工作汇报） |
| P2 | 元素与生态 | 印章样式、页眉页脚包、编号样式包；社区贡献（UGC 需审核与版权授权协议，上线前过 license-audit 同款合规审） |

## 三、架构（复用现有基建）

**内容格式**：docx 文件本体。生成器（如 `apps/docs/src/renderer/govt-template.ts`）产出规范 Block[] → 引擎写出真 docx；预览缩略图走分页/pptx-render 管线渲染首页。

**双层分发**：

| 层 | 载体 | 说明 |
| --- | --- | --- |
| 本地内置层 | 随包 extraResources / 生成器代码 | 零网络、零帐号可用；跨平台安装包自带 |
| 云目录层 | CatSpark `CATSPARK_API_BASE/api/asset_center/*` | 分类/搜索/预览/下载端点；**mock 模式已可全仿真**（`packages/catspark/src/mock/server.ts` 扩展路由即可），`CATSPARK_API_BASE` 一键切真实后端——与客户端对接契约同构 |

**UI**：Shell Home 页「新建」入口扩展模板画廊（当前只有空白新建，见 docs-main `openTab(undefined, { newBlank: true })` 路径）；Docs 内为第二入口。

**帐号与计费**：复用 Catspark 设备码登录与积分体系；免费/积分模板分级；流量归因走既有 `X-Agent-Type`。

**合规**：自制模板版权归 Cat Office Team；字体沿用既有的 metric 替换 + 字体 CDN 目录策略（授权方正/汉仪字体按需下载，不进安装包——license-audit.md 的黄灯清单）；UGC 上线前补贡献者协议。

## 四、分期与顺序

| 期 | 内容 | 前置 |
| --- | --- | --- |
| A1 | 本地内置公文模板（GB/T 9704 全套固化）+ 新建入口直选 | M5 公文骨架（govt-template.ts 已就绪） |
| A2 | 模板画廊 UI：本地内置 + mock 云目录（缩略图预览、分类浏览） | mock 服务器扩展 asset_center 路由 |
| A3 | CatSpark 真实云目录端点 + 搜索/分类（catspark-integration.md 增补契约段） | CatSpark 服务端（Rust/axle） |
| A4 | 积分/会员计费、UGC 贡献生态 | 合规协议先行 |

## 五、与现有文档的关系

- [product-plan.md](product-plan.md) §9.3「公文套版」AI 技能 = 素材中心的 AI 消费方；§8.1 文档模块的公文项（P1）= 内容供给线。
- [cross-platform-plan.md](cross-platform-plan.md) M5 公文版式 = P0 品类的生产线；其「UI 入口」待续项并入 A1。
- [catspark-integration.md](catspark-integration.md) A3 时增补 `asset_center` 契约段（端点、mock 行为、验收）。
- [license-audit.md](license-audit.md) 模板内容版权与 UGC 协议沿用其审计框架。

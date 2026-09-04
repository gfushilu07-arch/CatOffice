# SA3.0 格式探针报告：电子签章（阶段一探底）

> 状态：**探底完成（本地静态部分）**。本文档记录 SA3.0 第一阶段结论：
> 引擎现状、真实缺口、实现路径选项与决策建议。动态部分（真实 CA 签名
> 样本解析）需要测试证书，见 §五。

## 一、探底结论：现状与真实缺口

### 引擎现状（代码级确认）

| 面 | 现状 | 性质 |
| --- | --- | --- |
| PDF 视觉签名 | `save-pdf.ts`：手写笔迹/图片作为 **annotation 贴图**（`/GenOfficeFormField` 标记 + 自绘 /AP 外观流），含签名列表持久化 | **纯视觉**——没有任何密码学绑定 |
| PDF 数字签名 | **无**。pdf-lib `^1.17.1` 不暴露任何 `signDocument`/ByteRange API（已实测确认） | 缺口本体 |
| OFD | **无**（格式未支持，见 compliance-plan C5 决策点） | 缺口本体 |
| 密码学底座 | node:crypto（RSA/ECDSA/PKCS#7 可用）；xlsx sidecar 有 IronCalc；审计包有哈希链 | 可复用的基础件 |
| 验签 UI | 无 | 需新建 |

### 真实缺口（SA3 的全部工程面）

1. **PDF 增量签名写入器**：`/Sig` 字典（/ByteRange、/Contents PKCS#7、
   /Filter /Adbe.pkcs7.detached）+ 增量更新（原字节不动、签名追加尾部）——
   pdf-lib 不能做，需要自建（ByteRange 覆盖计算 + 文件级偏移控制）。
2. **PKCS#7/CMS 结构**：SignerInfo、证书链嵌入、digest RSA/ECDSA。
   node:crypto 原生支持 PKCS#7 签名（`createSign` + 手工 ASN.1 组包，或
   依赖 WASM/原生库）。
3. **验签器**：ByteRange 校验、PKCS#7 解析、证书链验证、摘要比对。
4. **可视章图与签名域绑定**：现有视觉签名 annotation 升级为 Sig 字段的
   Widget 外观（图随签名域走——**这正好复用 SA1 的章图提取与现有视觉
   签名落点**）。
5. **时间戳（TSA）与 LTV**：RFC 3161 请求；证书过期后长效验证。
6. **证书接入**：测试态用证书文件（PFX/PEM）；真机接 UKey（PC/SC）或
   云端签名 API——需要 CA 合作。

## 二、实现路径选项

| 路径 | 说明 | 工程量 | 优 | 劣 |
| --- | --- | --- | --- | --- |
| **A. 自建（node:crypto + 增量写入器）** | PKCS#7 detached 自组包；ByteRange 手控 | 大（2–4 周起步） | 零新依赖；完全可控；学习即资产 | ASN.1/CMS 细节多，兼容性风险 |
| **B. @signpdf 类库** | node-signpdf 生态成熟（detached PKCS#7 + 增量） | 小（1 周内 b-b 基线） | 快、社区验证过 | 依赖质量需审计（等保视角）；定制受限 |
| **C. 原生/Rust** | sidecar 扩展（openssl crate） | 中 | 性能、国密可插拔（C4/C5 联动） | 跨平台构建面增大 |

**建议**：路径 B 起步（快速到 PAdES b-b 验证全链），审计其实现后按需替换
关键部分为 A；C 与国密（C4/C5）决策合并考虑——SM2 签名走 Rust 侧最自然。

## 三、与现有功能的衔接（降低工程量的关键）

- **可视章图**：SA1 `detectSeal`/`cropRgba` 提取的章 + C1 审计的签名事件 +
  现有视觉签名 annotation 落点——只差密码学绑定一层。
- **多章/角色**：签章管理模式（seal-signing-plan §一）登记的印章条目绑定
  证书指纹后即可升级为签名实体。
- **C3 联动**：会话锁定时签名能力失效（key 控制权要求）。
- **C2 红线**：签名是本地操作，不经 upload-consent 门控。

## 四、验收口径（SA3.0 后续子项）

- SA3.0 动态部分：真实 CA（CFCA 测试证书）签发的 PDF 样本 → 解析签名域
  结构（ByteRange/Contents/证书链）→ 报告 → 决策 B 路径可行性确认。
- SA3.1：CatOffice 签出的 PDF 在 Adobe Acrobat 中显示签名有效（绿勾），
  改动一个字节即失效。
- SA3.3：RFC 3161 时间戳嵌入；证书过期后 LTV 验证仍通过。

## 五、待办（真机/外部）

1. CFCA 测试证书申请（或任一国内 CA 测试态）——动态探针的前置。
2. WPS/Adobe 对国密 SM2 签名 PDF 的兼容样本收集（与 C5 探针合流）。
3. OFD 样本收集（OFD 立项决策输入）。

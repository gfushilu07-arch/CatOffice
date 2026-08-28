# CatOffice 品牌资产源

设计源（SVG，手写矢量，提交进仓库），产物一律由脚本生成、不手工改：

| 文件                       | 用途                                                                   |
| -------------------------- | ---------------------------------------------------------------------- |
| `catoffice-icon.svg`       | 应用图标母版 1024×1024（macOS/Windows/Linux/渲染层全部产物皆源于此）   |
| `catoffice-icon-small.svg` | ≤32px 简化版：去胡须与正文行、放大耳朵眼睛（小尺寸可读性，对比验证过） |

## 设计说明：「文件即猫」

- **橘猫色渐变圆角方块**（#FFB25C→#EF721A）：呼应「办公猫」的橘猫意象；
- **一张奶油色文档纸**＝猫身：右上折角（dog-ear）保持「文档」属性，纸面下半是三行圆角「正文」；
- **猫耳立在纸的上缘**，内耳橘色三角；
- **胡须伸出纸外**落在橘色底上——签名式细节，打破边界让图标「活」；
- 面部：竖椭圆眼+高光点、橘色小三角鼻、ω 嘴。

## 重新生成全套产物

```bash
node tools/build-catoffice-icons.mjs
```

产出：`apps/shell/build/icon.icns|icon.ico|icon.png|icon-mac.png`、`apps/shell/build/icons/<n>.png`（Linux hicolor）、渲染层 `app-icon.png`。依赖 @napi-rs/canvas（resvg 渲染，ImageMagick 的内置 SVG 渲染器不支持渐变/描边路径，勿用）、ImageMagick（仅 ICO 组装）、macOS iconutil（icns）。

Home 页 lockup：`apps/shell/src/renderer/src/assets/catoffice-logo.svg`（mark + 办公猫字标，Chromium `<img>` 渲染；font-family 栈首必须是具体中文字体族）。

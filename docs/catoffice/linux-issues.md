# Linux 平台问题清单（L 线）

> 状态基准：2026-09-02。本文档是 **Linux 专属问题的唯一台账**——每项给出
> 状态（✅已修复 / 🔧代码已备 / ⏳待真机）、证据位置与真机验证步骤。真机运行后
> 把结果回填进「真机验证记录」并同步 cross-platform-plan.md 执行进度表。
> 逐项走查的操作细节见 [linux-desktop-checklist.md](linux-desktop-checklist.md)。

## 一、已知问题与状态

### L-1 arm64 交叉构建未验证（L2）⏳待 CI 实跑（代码已备）

- **问题**：`GENOFFICE_LINUX_ARM64=1` 的 AppImage/deb/rpm arm64 目标与交叉
  xlsx-sidecar 从未在真实环境构建过；本机无 `aarch64-linux-gnu` 工具链。
- **已备**：builder 配置开关 + beforePack 硬断言（electron-builder 对缺失
  extraResources **静默跳过**——arm64 包缺 sidecar 会静默变成打不开任何
  工作簿的安装器，必须在这里大声失败）；`dist-linux.yml` workflow（手动
  触发、arm64 输入装 `gcc-aarch64-linux-gnu` + 交叉构建）。
- **真机/CI 步骤**：Actions → dist-linux → run workflow（arm64=true）→
  产物在 arm64 设备（树莓派/飞腾）安装 → 打开含公式的 xlsx 验证 sidecar。
- **已知风险**：交叉编译的 OpenSSL/glibc 版本底线需在目标设备实测。

### L-2 chrome-sandbox SUID 与 AppImage（L4）⏳待真机

- **问题**：AppImage 内文件 SUID 位不生效（squashfs 挂载忽略），Chrome
  沙箱依赖 user namespaces；Ubuntu 24.04 的 AppArmor 默认阻断非特权
  userns → 渲染进程起不来（CI e2e 作业已用 sysctl 规避，真机用户侧无此
  手段）。
- **现状**：deb/rpm 包内 `chrome-sandbox` SUID 是否被 dpkg/rpm 保留**未确认**。
- **真机步骤**：
  1. 24.04 裸机跑 AppImage：渲染进程是否存活
  2. `ls -l /opt/CatOffice/chrome-sandbox`（deb/rpm）
  3. 失败时的用户侧解法（文档化，不自动降级 --no-sandbox）：
     `sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0`
- **决策待定**：若受限场景普遍，评估启动脚本提示而非静默降级。

### L-3 Wayland 原生模式（L4）⏳待真机（开关已备）

- **问题**：部分合成器在原生 Wayland 下有全局菜单/IME 缺口 → 默认保持
  X11/XWayland，原生 Wayland 是显式选择（`CATOFFICE_OZONE`）。
- **已备**：`linux-ozone.ts`（`ozone-platform-hint=auto` 保留 Chromium 回退
  链 + `enable-wayland-ime`）；决策单测 3 个。
- **真机步骤**：GNOME Wayland 100%/150% + fcitx5 打字（`CATOFFICE_OZONE=wayland`）；
  `CATOFFICE_OZONE=auto` 跟随会话；X11 基线对照。清单见
  linux-desktop-checklist.md §1/§5。

### L-4 本地 OCR 缺席 → 云 OCR 回退（L3）✅已闭环（真机冒烟待做）

- **状态**：Linux 无系统 OCR helper → 转换管线自动走 CatSpark 云预识别
  （mock 端到端测试锁定）；真实后端换 `CATSPARK_API_BASE` 即生效。
- **真机步骤**：AppImage 下转换一张中文扫描件 PDF → 验证走云路径产出
  可编辑 docx（mock 模式则产出 mock 识别文本）。

### L-5 桌面集成杂项（L4）⏳待真机

- WM_CLASS/app_id 关联（`syncDesktopName` 已配，X11 `xprop` 验证；Wayland
  原生下 app_id 是否同为 `catoffice` 待测）
- 文件关联 MimeType 出现在「打开方式」（`gio mime` 验证）
- 剪贴板图片、文件拖放、GTK 打印对话框（需 CUPS）
- 混合 DPI 双屏跨拖

### L-6 T3 度量基线真机校验（T3 待续）⏳待 Linux CI/真机

- **问题**：`font-linebox-linux.generated.ts` 的 Blink 行盒比例在 **mac** 上
  测得（FreeType vs CoreText 渲染差异未排除）。
- **真机/CI 步骤**：Linux 上重跑
  `PLAYWRIGHT_BROWSERS_PATH=… node tools/measure-font-linebox.mjs` →
  diff fixture；不一致则按平台重生成并回看三处消费入口。

## 二、与其它文档的关系

- 桌面走查操作细节：[linux-desktop-checklist.md](linux-desktop-checklist.md)
- dist workflow：`.github/workflows/dist-linux.yml`
- 云 OCR 契约：[catspark-integration.md](catspark-integration.md) 第七节

## 三、真机验证记录

（真机运行后填：日期 / 机器 / 发行版 / 桌面环境 / 分发形态 / 各问题结果 / 回归点）

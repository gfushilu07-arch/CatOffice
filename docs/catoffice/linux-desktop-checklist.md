# Linux 桌面集成走查清单（L4）

> 走查需要**真实 Linux 桌面会话**（Wayland 或 X11），CI 的 xvfb 无头环境覆盖不了。
> 本清单是 L4 的可交付预备：每项给出预期行为与验证方法，真机走查后把结果记进
> 执行进度表。分发形态按 AppImage / deb / rpm 三种都要过一遍。

## 1. 显示后端与缩放

| 项 | 预期 | 验证 |
| --- | --- | --- |
| X11 会话启动 | 正常（现状基线） | `xdotool` 打开窗口，无黑屏 |
| Wayland 会话（默认 XWayland） | 正常，无黑屏；fractional scaling 有轻微模糊属预期 | GNOME Wayland 100%/150% 各启动一次 |
| Wayland 原生（`CATOFFICE_OZONE=wayland`） | 窗口清晰、fractional scaling 无模糊；fcitx5 输入中文正常（`enable-wayland-ime`） | 同上 + 输入法打字 |
| `CATOFFICE_OZONE=auto` | 会话是 Wayland 时自动走原生 | `XDG_SESSION_TYPE=wayland` 下启动看 `chrome://gpu`…（Electron 无此页，改看 `ps aux \| grep ozone`） |
| 多显示器混合 DPI | 跨屏拖动窗口不糊不崩 | 双屏 1x + 2x 拖动 |

**回退语义**：ozone 用的是 `ozone-platform-hint=auto`（非 `-platform=wayland`），
Wayland 后端失败时 Chromium 自动落回 XWayland，不应出现黑窗。

## 2. 沙箱与 SUID（AppImage 特有）

| 项 | 预期 | 验证 |
| --- | --- | --- |
| AppImage + user namespaces 可用 | 正常启动（Chrome 用 userns 沙箱，不依赖 SUID） | Ubuntu 22.04/24.04 默认配置直接跑 |
| AppImage + AppArmor userns 限制（Ubuntu 24.04） | 渲染进程起不来 → 需文档记录 sysctl 解法（与 CI e2e 作业同款） | 24.04 裸机跑 AppImage |
| deb/rpm 安装包 | 同上（包内 chrome-sandbox SUID 位是否被 dpkg/rpm 保留待真机确认） | 安装后 `ls -l /opt/CatOffice/chrome-sandbox` |

**决策待定**：若 userns 受限成为常见场景，再考虑启动脚本自动降级 `--no-sandbox`
（安全性有损，需用户显式同意），或文档指引 sysctl。先记录不动手。

## 3. 菜单 / 窗口集成

| 项 | 预期 | 验证 |
| --- | --- | --- |
| 应用内菜单（GNOME 无全局栏） | 三套菜单（home/pdf/markdown）随 tab 切换正确显示 | 逐 tab 打开看菜单栏 |
| KDE 全局菜单 | 无全局菜单代理时同 GNOME 行为 | plasmashell 默认配置 |
| WM_CLASS / 任务栏图标 | `catoffice` 可执行名 + `genoffice.desktop` 的 StartupWMClass 关联（builder 已配 `syncDesktopName`） | `xprop WM_CLASS` 点窗口；任务栏右键「固定」后图标正确 |
| Wayland 下 app_id | 原生 Wayland 时 app_id 应为 `catoffice`，GNOME/任务栏图标关联 | `looking-glass clients` 或 KDE window rules |

## 4. 文件关联与外部协议

| 项 | 预期 | 验证 |
| --- | --- | --- |
| desktop entry MimeType | docx/xlsx/pptx/pdf/md/csv 出现在「打开方式」列表 | `gio mime application/vnd.openxmlformats-officedocument.wordprocessingml.document` |
| 命令行启动带中文路径 | `catoffice '/tmp/中文 文件.docx'` 正常打开（T7 的 Linux 面） | 终端传参 |
| 第二实例唤起 | 已运行时二次启动把文件递给首实例（single-instance lock） | 双击第二个文件 |

## 5. 输入法

| 项 | 预期 | 验证 |
| --- | --- | --- |
| X11/XWayland + fcitx5 | 中文输入正常 | 编辑器打字 |
| 原生 Wayland + fcitx5 | 需 `enable-wayland-ime`（已加）；候选框跟随 | 同上 |
| ibus | 同上两行 | GNOME 默认 |

## 6. 剪贴板 / 拖放 / 打印

| 项 | 预期 | 验证 |
| --- | --- | --- |
| 剪贴板复制粘贴（含图片） | 与 macOS 行为一致 | docs 里贴图 |
| 文件拖放进窗口 | 打开对应文档 | 拖 docx 进 shell |
| 打印（Ctrl+P → 系统对话框） | GTK 打印对话框出现且可选打印机 | 需要 CUPS 环境 |

## 7. 与 CI 的衔接

- `dist-linux.yml` 产物（AppImage/deb/rpm）即走查对象；arm64 包在树莓派/飞腾类
  设备上过一遍 §1/§5。
- E2E 已有 xvfb 基线（22.04 + AppArmor sysctl），走查时 CI 绿 + 真机绿双确认。

## 走查记录

（真机走查后填：日期 / 桌面环境 / 发行版 / 分发形态 / 各节结果 / 回归点）

# BEIOCalender 腾讯云发布信息

本文件保存已由用户确认或已在腾讯云控制台核验的连接与发布信息，方便后续版本发布。禁止在本文件中写入密码、私钥、API Secret、登录令牌等敏感凭据。

## 项目位置

- 本地项目：`C:\Users\cz378\OneDrive\MyGIT\calender task`
- 桌面安装包输出目录：`desktop\release`
- GitHub 仓库：`https://github.com/zhuangchaoqun/calendertask.git`

## 腾讯云服务器

| 配置项 | 已确认信息 |
| --- | --- |
| 产品 | 腾讯云轻量应用服务器 Lighthouse |
| 实例名称 | `Ubuntu-znio` |
| 实例 ID | `lhins-m70kk7fm` |
| 地域 | 上海四区 |
| 公网 IPv4 | `124.223.175.138` |
| 内网 IPv4 | `10.0.0.17` |
| 操作系统 | Ubuntu Server 24.04 LTS 64 位 |
| SSH 用户名 | `ubuntu` |
| 腾讯云控制台 | `https://console.cloud.tencent.com/lighthouse/instance/detail?rid=4&id=lhins-m70kk7fm` |

## 已绑定 SSH 密钥

服务器已在腾讯云绑定以下公钥：

| 密钥 ID | 密钥名称 | 用户名 | 公钥备注 |
| --- | --- | --- | --- |
| `lhkp-0hz3es2q` | `beio_weekly_auto` | `ubuntu` | `beio-weekly-auto-deploy` |
| `lhkp-44f3r4j0` | `beio_weekly_deploy` | `ubuntu` | `beio-weekly-deploy` |

腾讯云控制台只保存公钥，不能重新下载创建时生成的私钥。截至 2026-09-10，本机常用目录及 `C:\Users\cz378\.ssh` 未找到对应私钥；在找到私钥前，优先使用腾讯云实例详情中的“文件管理”发布更新。

## 自动更新发布位置

- 服务器目录：`/var/www/html/chaoquncalender/updates/`
- HTTPS 更新地址：`https://124.223.175.138/chaoquncalender/updates/`
- 更新清单：`https://124.223.175.138/chaoquncalender/updates/latest.yml`
- Nginx 配置参考：`server/nginx-chaoquncalender.conf`
- TLS 证书：`/etc/letsencrypt/live/124.223.175.138/fullchain.pem`
- TLS 私钥：`/etc/letsencrypt/live/124.223.175.138/privkey.pem`

## 桌面版发布流程

1. 更新 `desktop/package.json` 与 `desktop/package-lock.json` 中的版本号。
2. 在 `desktop` 目录构建 Windows 安装包，确认生成：
   - `BEIOCalender-Setup-<版本>.exe`
   - `BEIOCalender-Setup-<版本>.exe.blockmap`
   - `latest.yml`
3. 将代码提交并推送到 GitHub，创建对应的 `v<版本>` Release。
4. 登录上方腾讯云实例详情，进入“文件管理”。
5. 将目录切换到 `/var/www/html/chaoquncalender/updates/`。
6. 先上传安装包和 `.blockmap`，确认文件大小完整。
7. 最后上传并覆盖 `latest.yml`。覆盖清单会立即向客户端发布新版本，执行前必须核对其中的版本、文件名、SHA-512 和文件大小。
8. 发布后通过公网读取 `latest.yml`，并对清单中的安装包 URL 发起 HEAD 请求，确认版本正确且返回 HTTP 200。

## 当前已知发布状态

- GitHub 正式版本：`v3.3.1`
- GitHub 提交：`bf0b6b530075f13134c110c44fbe80bac1867df7`
- `BEIOCalender-Setup-3.3.1.exe` 与对应 `.blockmap` 已于 2026-09-10 上传到腾讯云更新目录。
- `latest.yml` 覆盖属于正式切换客户端自动更新版本的步骤；完成后必须再次读取公网清单验证，不能只依据控制台上传提示判断成功。

## 凭据约定

- 不在 Git、聊天记录、构建日志或本文中保存明文密码、私钥、API Secret 或令牌。
- 如果以后找回私钥，将其保存到用户指定的安全目录，并在本文只记录路径或凭据管理器条目名称。
- 使用 SSH 前先以 `ssh -i <私钥路径> ubuntu@124.223.175.138` 做只读连接测试，再执行上传。

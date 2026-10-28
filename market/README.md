## 0.4.14 网页陪伴体验改版

完整重做官网首页和桌宠市场：新增首屏状态互动、角色回应、市场卡片按需动作预览；重排下载、安装与投稿查询页面，适配手机端和四套主题，尊重减少动态效果设置。网页资源已内嵌二进制，无需单独上传。

已有服务器升级时，停止服务并备份当前二进制与数据目录，再替换 lingpet-market-linux-amd64 后重启。保留原有环境文件、数据库、下载目录和 Nginx 配置；本次未更改数据库结构。部署包不包含本地预览数据、账号凭证或下载插件安装包。

验证：25 项页面渲染与交互检查、15 项相关 Node 测试及 Go 回归测试通过。

## 0.4.13 网页品牌与四主题

首页、桌宠市场与管理后台已统一使用原创伴星图标与纸感默认主题；顶部可切换另外三套风格，选择保存在当前浏览器。网页素材、图标和样式均嵌入服务二进制，升级时替换二进制即可，无需单独上传静态资源。保留原有数据库、环境文件与下载目录。

# 灵伴集市（Go）

## 0.4.13 更新

兼容桌面端 0.5.0 的互动资源包，允许八种状态动作之外的单次 `click`、`pet` 动作，支持其校验与历史动作预览。旧包和现有数据库保持兼容。

已有服务器只需停止服务、备份当前二进制和数据目录、替换二进制后重新启动；保留现有环境变量、数据库及 Nginx 配置。按默认目录安装时：

```sh
sudo systemctl stop lingpet-market
sudo cp /opt/lingpet-market/lingpet-market /opt/lingpet-market/lingpet-market.before-0.4.13
sudo tar -czf /var/lib/lingpet-market-before-0.4.13.tar.gz -C /var/lib lingpet-market
sudo install -m 755 lingpet-market-linux-amd64 /opt/lingpet-market/lingpet-market
sudo systemctl start lingpet-market
sudo systemctl status lingpet-market --no-pager
```

如需回退，停止服务并恢复备份二进制即可；本次未更改数据库结构。实际安装目录若不同，请替换上述路径。

默认域名为 https://lingpet.fourzkw.top。独立 Go 后端，静态网页嵌入二进制，使用 bbolt 事务数据库；无需 Docker、Node、Python 或独立数据库。需要 Go 1.25+ 构建，运行机器无需安装 Go。仅支持单进程使用一个数据目录。

浏览、下载和投稿无需登录。管理员通过独立账号密码登录审核后台，无需注册 GitHub OAuth App。投稿表单填写公开 GitHub 仓库、正式 Release 标签和 .petpack 附件名；个人或组织仓库均可推荐。提交链接不能证明作者身份，管理员需核查作品内容、仓库来源和授权声明。

## 构建与测试

在工程根目录：

    go -C market test ./...
    go -C market vet ./...
    npm run build:market

服务器使用 Linux amd64（x86_64），构建脚本仅生成 amd64 部署包及 SHA-256 校验值。单独构建：

    CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go -C market build -trimpath -buildvcs=false -o ../artifacts/lingpet-market-linux-amd64 .

## Linux 部署（无 Docker）

1. 为 lingpet.fourzkw.top 添加 A/AAAA 记录，指向服务器；后端保持 127.0.0.1:9633，仅由 Nginx 代理。
2. 解压 Linux amd64 部署包，创建运行账号和目录：

    sudo useradd --system --home /var/lib/lingpet-market --shell /usr/sbin/nologin lingpet
    sudo install -d -o root -g root -m 755 /opt/lingpet-market
    sudo install -m 755 lingpet-market-linux-amd64 /opt/lingpet-market/lingpet-market
    sudo install -m 600 deploy/market.env.example /etc/lingpet-market.env
    sudo install -m 644 deploy/lingpet-market.service /etc/systemd/system/lingpet-market.service

3. 保留默认账号 LINGPET_ADMIN_USER=admin，首次部署无需手工生成密码哈希。不要设置 LINGPET_ADMIN_PASSWORD_HASH。服务首次启动时自动生成本次部署专属的随机初始密码，并写入数据目录的 initial-admin-password.txt，文件权限为0600；日志仅记录文件路径。
4. 保留 LINGPET_PUBLIC_URL=https://lingpet.fourzkw.top。GITHUB_TOKEN 可选，仅用于提高公共 GitHub API 配额，与用户登录无关；仅保存在服务器。
5. 使用 deploy/nginx.conf 配置 Nginx。它会覆盖客户端传入的 X-Forwarded-For；后端只信任回环代理提供的单个来源 IP。DNS 生效后签发 HTTPS 证书，例如：

    sudo certbot --nginx -d lingpet.fourzkw.top

6. 完成 HTTPS 后启动：

    sudo systemctl daemon-reload
    sudo systemctl enable --now lingpet-market
    sudo systemctl status lingpet-market
    curl https://lingpet.fourzkw.top/api/health
    journalctl -u lingpet-market -f

启动后在服务器执行 sudo cat /var/lib/lingpet-market/initial-admin-password.txt，使用 admin 和该初始密码在/admin 页面。首次登录必须修改密码，完成前不能访问审核数据或执行审核；修改完成会删除初始密码文件。以后可通过右上角「修改密码」再次修改，需提供当前密码。右上角「修改用户名」可更换管理员登录名，同样验证当前密码；新用户名为1至64个字符，不含空白或控制字符，区分大小写。首次改密完成前不能更换用户名。更名后当前会话继续使用，其他旧会话失效，密码和已有审核记录保持不变。用户名保存在数据库，重启及升级继续使用新用户名。新密码支持12至256字节，服务器使用随机盐 PBKDF2-SHA256（600000次）保存哈希。管理员会话8小时有效，Cookie 为 HttpOnly/SameSite=Lax，HTTPS 下为 Secure；退出会撤销当前会话。初始密码每次部署独立生成，不采用大家共用的固定密码。修改密码后其他旧会话失效。

## 投稿、凭证与审核

投稿只需仓库、Release 标签、附件名。服务器接收后返回随机投稿编号和48位十六进制私密凭证。凭证用于「查询投稿」查看排队、校验、审核结果及原因；不能批准、下架或更改资源。浏览器尝试保存最近50份凭证，并支持下载凭证备份。凭证遗失无法按账号找回，第一版不提供自主撤回；可由管理员处理。

服务器仅保存凭证哈希和带服务器随机盐的来源 IP 哈希，私密凭证不会出现在作品目录、审核列表或链接中。查询使用 POST 请求。每个来源 IP 最多5个待处理投稿、每小时10次有效格式的投稿尝试；全站最多200个待处理任务。重复附件及重复作品版本均会拒绝。普通写请求每分钟120次，管理员登录每 IP 每15分钟最多5次尝试。多用户共享出口会共享限额；首版不含验证码。

服务器只读取 Release 附件信息，以及同一标签下仓库的 pet.json（最多32 KiB）与 previews/cover.png（最多1 MiB）。不下载或解包 .petpack，不读取 README 中的外链或大文件。作品元数据、重新编码的封面保存为审核快照。待审资源仅管理员可预览；投稿凭证只能查状态。管理员检查市场展示的名称、介绍、封面及授权声明后通过、驳回或下架，不能跳过介绍及封面的自动格式校验。客户端从作者 GitHub 下载，保留包格式、路径、资源大小和作品 ID、版本检查，不强制比对投稿时的 SHA-256 或文件大小。哈希仅保留为投稿记录，市场不保证下载包与投稿文件完全一致。市场展示使用已保存的审核快照，更新展示内容需重新投稿审核。下架不删除作者 GitHub 上的公开文件。

## 分享包

从灵伴「更多操作 → 导出分享包」填写作品 ID、名称、版本、作者、授权及可选介绍，将 .petpack 上传公开仓库的正式 Release，再免登录投稿。更新作品需增加版本号并重新审核。格式为 ZIP 容器，包含 pet.json、manifest.json、cover.png、sprites/{state}.png，以及可选 original/sprites/{state}.png。八动作齐全；原图和像素至少一种。禁止脚本、HTML、软链接和额外文件。包最大200MiB、解压总量512MiB、单文件64MiB、单图最多16M像素。

## 本机调试与备份

设置 LINGPET_DEV_MODE=true、LINGPET_LISTEN=127.0.0.1:9633、LINGPET_PUBLIC_URL=http://127.0.0.1:9633，首次初始化会在本机数据目录生成初始密码。运行 go -C market run .。开发模式只允许回环监听及本机 HTTP，不提供免密码的管理员入口。

重启会恢复排队及中断的校验任务。长期保留 market.db 与 previews/。停止服务后备份整个数据目录和独立保存的环境文件；不要在数据库写入时直接复制 market.db 当作一致性备份。升级前先停止并备份。管理员账号、密码哈希及修改状态保存在 market.db，只替换二进制并保留原数据目录，密码不会变化。LINGPET_ADMIN_USER 与可选的 LINGPET_ADMIN_PASSWORD_HASH 仅在数据库首次初始化时使用，已有数据库优先；旧0.4.3环境中的真实密码哈希会在升级时导入一次。无需重新配置密码哈希，不要删除数据目录。旧版审核/版本记录保留；旧账号投稿不具备匿名凭证，需管理员查询。

## 首版边界

按审核版本展示，支持搜索；暂不提供评分、评论、付费、推荐排序、自动更新、镜像或定时失效扫描。GitHub 文件失效或哈希变化会明确报错，不会静默切换到 latest。审核队列串行；用户提交链接属于推荐，未经身份验证。服务器部署和真实 GitHub 下载仍需在实际网络环境验收。



## 忘记密码

停止服务后，可由有数据目录访问权的服务器管理员通过本机命令重置。该操作会使旧登录会话失效，网页没有免认证重置入口。Bash 示例：

    sudo systemctl stop lingpet-market
    read -r -s -p '新的管理员密码：' lingpet_password; printf '\n'
    printf '%s' "$lingpet_password" | sudo env LINGPET_DATA_DIR=/var/lib/lingpet-market /opt/lingpet-market/lingpet-market --reset-admin-password
    unset lingpet_password
    sudo systemctl start lingpet-market

可选 --hash-password 命令仍可用于首次初始化时导入已有密码；账号数据初始化后，改环境变量不会覆盖数据库中的密码。



## 网站页面与插件下载

服务0.4.6起，根路径 / 是插件下载首页；/market 为桌宠市场、投稿和进度查询；管理员直接访问 /admin 登录，公开页面不展示管理入口。旧桌面端的 /?version=... 详情链接会跳转到 /market?version=...；桌面客户端0.4.2直接打开 /market。

服务已取消 Origin 与 LINGPET_PUBLIC_URL 的固定比对，不再因域名、端口或 HTTP/HTTPS 与配置不同而返回“请求来源不匹配”。仍要求 JSON 写请求、限制明显跨站请求，并保留管理员认证。登录 Cookie 根据实际连接及回环 Nginx 提供的 X-Forwarded-Proto 设置 Secure，避免实际 HTTP 访问时无法保留会话。反代应覆盖该请求头；Nginx 模板已包含配置。

插件安装文件独立于服务二进制，不嵌入部署包。源码中先执行 npm pack --pack-destination artifacts，再运行 node scripts/build-market-downloads.mjs，生成 artifacts/lingpet-downloads-0.4.2/。该目录含 DSH .tgz、Cursor .vsix、Codex .zip、manifest.json 和校验文件。均为 Windows 客户端安装包；Linux 指本网站服务运行平台。

把 manifest.json 和3个安装包上传至 /opt/lingpet-market/downloads/，在环境文件中设置 LINGPET_DOWNLOAD_DIR=/opt/lingpet-market/downloads；运行账号需能读取这些文件。重启服务使新增环境变量生效。以后替换清单和安装包即可更新下载列表，无需重新编译服务。建议先上传包、最后替换清单。安装包未上传或大小不符时首页显示待发布，不生成失效下载按钮。

下载接口 /api/downloads 返回版本、大小和 SHA-256；/downloads/dsh、/downloads/cursor、/downloads/codex 读取清单列出的普通文件，支持 Range 续传。未知文件、路径越界、软链接和大小不符的文件无法下载。下载耗时不受普通 API 写超时限制。更新服务及插件下载目录时保留 /var/lib/lingpet-market，管理员用户名、密码和市场数据保持不变。


## 管理后台（0.4.7）

直接访问 /admin，登录并完成初始改密后，可使用四个管理页面：

- 数据概览：累计/今日页面访问、DSH/Cursor/Codex 下载请求数、待处理投稿、已上架桌宠数、安装包版本和文件合计，按 UTC+8 查看最近7/14/30/90天并导出 CSV。
- 作品审核：按状态和作品/仓库/版本筛选，保留八动作预览、通过、驳回和下架。
- 安装包管理：选择客户端、填写与包内一致的版本号，上传 .tgz/.vsix/.zip；流式上传最多1GiB，校验文件内容、基本结构、版本和 SHA-256。上传先保存为待发布版本，再明确设为当前版本；支持下架和切回已有版本。正在发布的版本不能直接删除。删除上传的历史版本会同时删除其文件，需要在网页确认；原清单导入的版本只移除管理记录，原文件保留。
- 操作记录：安装包上传/发布/下架/删除、桌宠审核和账号变更；显示最近100条，保留最近1000条，不包含密码和投稿私密凭证。

升级前停止服务并备份原数据目录。新安装包保存在 LINGPET_DATA_DIR/packages/，版本、当前发布指针、统计和日志保存在 market.db；不需要对 /opt 下的原下载目录赋予写权限。原 manifest.json 中可用的安装包会导入管理后台。客户端的当前发布状态以数据库为准，后续改旧 manifest 不会覆盖已设置的发布状态。后续安装包可以直接在网页上传，无需再传 manifest.json。

必须把本版本 deploy/nginx.conf 新增的 /api/admin/releases/upload location 合并进当前 Nginx 站点配置，并保留已有 TLS 证书配置，然后执行 nginx -t 和重载。该位置单独允许约1GiB上传、15分钟超时及不缓冲请求；其他写请求仍保留64KiB限制。只更新二进制而未更新 Nginx 时，原64KiB限制可能导致上传返回413。程序自带上传体积、单任务并发和归档校验限制，systemd 仍只需要原数据目录写权限。

访问统计按成功页面 GET 计数；下载统计按成功的200/206 GET请求计数，包含重复请求和断点续传，HEAD、304和失败响应不计入；字节数为服务发送给代理或客户端的响应字节。统计不代表独立用户或最终完整安装次数，也无法统计 GitHub 直接托管的桌宠文件下载。历史数据从部署0.4.7后开始积累；旧投稿总数从现有数据库读取。

每个客户端同一版本不能重复上传，所有客户端最多保留150个版本；空间不足时可删除不再使用的历史版本。上传失败或取消会清理暂存文件，上传期间修改凭证/退出登录后不会提交新版本。安装包修改不需要重新编译服务器。


## 轻量仓库投稿

公开仓库同一 Release 标签下必须包含 pet.json（作品 ID、版本、名称、作者、授权和介绍，格式与分享包元数据相同）及 previews/cover.png（8bit RGBA PNG，最多1 MiB、1024×1024像素总量）。服务只访问 GitHub API 获取展示资料和附件信息，不下载完整 .petpack。客户端安装时才从 GitHub 下载分享包。管理员查看展示资料后通过或驳回；校验失败可点击“重试读取资料”。新投稿展示封面，历史动画预览仍保留。


## GitHub 访问加速

默认依次尝试 direct（GitHub 直连）、gh-proxy（https://gh-proxy.com/）、ghfast（https://ghfast.top/），无需安装本地代理。每条线路单次请求最多20秒，返回网络错误、非成功状态或无效 JSON 后尝试下一条；直连 GitHub 返回404时直接提示缺少仓库、标签或文件。第三方服务对 API 的支持和可用性可能变化，所有线路失败时保留明确错误，可在后台重试。

可在 /etc/lingpet-market.env 设置 LINGPET_GITHUB_ROUTES=gh-proxy,direct,ghfast 调整顺序；设置为 direct 关闭中转。保存后执行 sudo systemctl restart lingpet-market。默认不配置也生效。GITHUB_TOKEN 仅发送给直连 GitHub API，中转不携带认证信息；限制 HTTPS、公网目标和已知重定向域名，保留响应体积限制。这里只读取公开仓库介绍、封面与附件元数据，不克隆仓库，也不下载完整桌宠包。

> 市场 0.4.31：内嵌网页资源显式声明缓存策略——HTML/CSS/JS 一律 `Cache-Control: no-cache` 回源，图片才长缓存。`embed.FS` 没有修改时间，浏览器此前拿不到 `Last-Modified`/`ETag`，只会按启发式规则缓存，导致替换二进制并重启后页面仍是旧样式；升级后浏览器首次仍可能命中旧缓存，强刷一次（Ctrl+F5 / Shift+刷新）即可，之后每次升级都会自动回源。同时官网/集市新增一层排版细化样式 `web/refine.css`（吸顶页头、首屏栅格、两栏下载区、胶囊 tab 与筛选托盘、卡片随宽度 4→2→1 列、三档断点），HTML 与 JS 结构未改动。

> 市场 0.4.30：下载量改为同一桌宠所有已上架版本分享包附件的 GitHub 下载次数之和，同一附件只计一次。保留每个附件的统计缓存；历史附件读取失败时使用已有缓存，无缓存时显示「暂不可用」，避免展示不完整的累计值。网页资源已内嵌，升级替换服务端二进制即可生效。

> 市场 0.4.23：官网统一下载 Windows 桌面版，安装程序由 fourzkw/lingpet 的 GitHub Release 提供，后台不再上传独立插件包。

> 市场 0.4.20：仅严格核对作品 ID、版本和角色 ID。市场使用仓库展示资料与宣传封面；安装后使用包内资料。名称、介绍及宣传封面无需与包内一致，继续保留图片格式和体积限制。

> 当前规则（市场 0.4.19 / 客户端 0.7.23）：索引无需 sha256；不校验作者是否替换附件，不比对历史哈希或历史文件大小。仍独立校验包内容、资源限制、作品 ID 和版本。历史哈希可保留为诊断数据。

## 0.4.18 多形象仓库与逐包校验

同仓库通过 lingpet-index.json 发布多个形象，各自独立校验、上架、下载和版本管理。市场按仓库数字 ID + 形象 ID 展示最新版本，不合并同仓库不同形象。完整协议见 MULTI_PET.md；可在工程中运行 scripts/build-pet-repository.mjs 自动生成索引、资料和附件。旧单宠仓库和数据库兼容。

## 0.4.17 投稿自动校验上架

仓库投稿自动读取最新正式 Release、唯一 .petpack 附件和同标签 pet.json、previews/cover.png，资料校验通过后直接上架，无需人工审核。校验失败显示原因，可修正后重新提交或由管理员重试。升级启动时旧 pending 投稿和中断的 validating 投稿重新进入校验队列；已下架及历史驳回作品不会自动上架。后台保留下架和失败重试，移除通过、驳回操作。

## 0.4.16 下载量与 Star 统计

首页、市场列表和详情页展示同一桌宠所有已上架版本 `.petpack` 附件的 GitHub 下载次数之和（同一附件去重），以及作者仓库的 Star 数。统计成功后缓存 15 分钟；读取失败时保留上次成功数据并短暂缓存失败结果，首次读取失败显示「暂不可用」，不误报为零。此统计与服务端安装包下载统计分开计算。

升级时停止服务、备份二进制和数据目录，替换 `lingpet-market-linux-amd64` 后重启；保留现有环境文件、数据库、下载目录与 Nginx 配置。网页资源已经内嵌，无需单独上传静态文件。仅打包，不自动部署到服务器。

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

浏览、下载和投稿无需登录。管理员通过独立账号密码登录管理后台，无需注册 GitHub OAuth App。投稿表单只需填写公开 GitHub 仓库链接；个人或组织仓库均可推荐。系统对每个作品独立校验展示资料及分享包，通过后分别上架；作者应填写准确的来源与授权声明。

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

启动后在服务器执行 sudo cat /var/lib/lingpet-market/initial-admin-password.txt，使用 admin 和该初始密码在/admin 页面。首次登录必须修改密码，完成前不能访问管理数据或执行管理操作；修改完成会删除初始密码文件。以后可通过右上角「修改密码」再次修改，需提供当前密码。右上角「修改用户名」可更换管理员登录名，同样验证当前密码；新用户名为1至64个字符，不含空白或控制字符，区分大小写。首次改密完成前不能更换用户名。更名后当前会话继续使用，其他旧会话失效，密码和已有操作记录保持不变。用户名保存在数据库，重启及升级继续使用新用户名。新密码支持12至256字节，服务器使用随机盐 PBKDF2-SHA256（600000次）保存哈希。管理员会话8小时有效，Cookie 为 HttpOnly/SameSite=Lax，HTTPS 下为 Secure；退出会撤销当前会话。初始密码每次部署独立生成，不采用大家共用的固定密码。修改密码后其他旧会话失效。

## 仓库投稿、查询与自动上架

投稿和查询只需 GitHub 仓库链接（也接受 owner/repo）。投稿从最新正式 Release 标签读取 lingpet-index.json，按索引逐项创建独立任务；没有索引时继续读取唯一 .petpack 与同标签根目录 pet.json、previews/cover.png。重复提交同一版本返回已有进度。发布新版本后，可用同一链接再次提交，自动校验通过后直接上架，已有上架作品的仓库每天自动发现更新并排队校验，也可手动提交入队。查询按创建时间倒序返回该仓库所有版本的公开状态、作品名称、版本和校验结果；不返回提交者、审核人、私密凭证、下载地址或待审封面。无需保存凭证。旧版标签/附件投稿及编号/凭证查询 API 继续兼容。撤回仍由管理员处理。

服务器仅保存凭证哈希和带服务器随机盐的来源 IP 哈希，私密凭证不会出现在作品目录、管理列表或链接中。查询使用 POST 请求。单包投稿每个来源 IP 最多5个待处理投稿，多包投稿最多20个待处理任务、每小时10次有效格式的投稿尝试；全站最多200个待处理任务。仓库链接重复提交同一附件返回已有记录；旧接口重复附件及重复作品版本仍会拒绝。普通写请求每分钟120次，管理员登录每 IP 每15分钟最多5次尝试。多用户共享出口会共享限额；首版不含验证码。

服务器逐项读取作品 pet.json（最多32 KiB）、封面（最多1 MiB），下载对应分享包并检查大小、作品 ID、版本、角色归属一致性和完整资源格式（允许独立宣传封面及不同展示资料）；校验后删除临时下载，保存展示预览与哈希快照。每个形象独立上架或失败；管理员可重试或下架。新版客户端不比对历史哈希和大小，安装时检查当前包的格式、资源限制与作品身份。市场展示使用已保存的展示快照，更新展示内容需重新投稿校验。下架不删除作者 GitHub 上的公开文件。

## 分享包

从灵伴「更多操作 → 导出分享包」填写作品 ID、名称、版本、作者、授权及可选介绍，将 .petpack 上传公开仓库的正式 Release，再免登录投稿。更新作品需增加版本号并重新校验。格式为 ZIP 容器，包含 pet.json、manifest.json、cover.png、sprites/{state}.png，以及可选 original/sprites/{state}.png。八动作齐全；原图和像素至少一种。禁止脚本、HTML、软链接和额外文件。包最大200MiB、解压总量512MiB、单文件64MiB、单图最多16M像素、最多163个文件；支持最多8个候选动作。

## 本机调试与备份

设置 LINGPET_DEV_MODE=true、LINGPET_LISTEN=127.0.0.1:9633、LINGPET_PUBLIC_URL=http://127.0.0.1:9633，首次初始化会在本机数据目录生成初始密码。运行 go -C market run .。开发模式只允许回环监听及本机 HTTP，不提供免密码的管理员入口。

重启会恢复排队及中断的校验任务。长期保留 market.db 与 previews/。停止服务后备份整个数据目录和独立保存的环境文件；不要在数据库写入时直接复制 market.db 当作一致性备份。升级前先停止并备份。管理员账号、密码哈希及修改状态保存在 market.db，只替换二进制并保留原数据目录，密码不会变化。LINGPET_ADMIN_USER 与可选的 LINGPET_ADMIN_PASSWORD_HASH 仅在数据库首次初始化时使用，已有数据库优先；旧0.4.3环境中的真实密码哈希会在升级时导入一次。无需重新配置密码哈希，不要删除数据目录。旧版审核/版本记录保留；旧账号投稿不具备匿名凭证，需管理员查询。

## 首版边界

按自动校验通过的版本展示，支持搜索；暂不提供评分、评论、付费、推荐排序、客户端本地自动更新或镜像；服务端支持每日更新发现和来源失效检查。GitHub 文件失效会明确报错，允许作者替换附件，不会静默切换到 latest。校验队列串行；用户提交链接属于推荐，未经身份验证。服务器部署和真实 GitHub 下载仍需在实际网络环境验收。



## 忘记密码

停止服务后，可由有数据目录访问权的服务器管理员通过本机命令重置。该操作会使旧登录会话失效，网页没有免认证重置入口。Bash 示例：

    sudo systemctl stop lingpet-market
    read -r -s -p '新的管理员密码：' lingpet_password; printf '\n'
    printf '%s' "$lingpet_password" | sudo env LINGPET_DATA_DIR=/var/lib/lingpet-market /opt/lingpet-market/lingpet-market --reset-admin-password
    unset lingpet_password
    sudo systemctl start lingpet-market

可选 --hash-password 命令仍可用于首次初始化时导入已有密码；账号数据初始化后，改环境变量不会覆盖数据库中的密码。



## 官网下载与管理后台（0.4.23）

官网统一提供 Windows 灵伴桌面版，不再分别提供 Cursor、Codex、DSH 安装包。下载后在本体「Agent 接入」安装对应接入插件；安装流程见 docs/desktop-installation.md。根路径 / 是产品首页，/market 为桌宠市场，管理员直接访问 /admin 登录。

安装程序发布在 fourzkw/lingpet 的 GitHub 正式 Release，附件命名沿用 LingPet-Setup-版本号.exe，并将桌面版 Release 标记为 Latest。官网下载按钮经 /downloads/desktop 跳转到 https://github.com/fourzkw/lingpet/releases/latest，由用户在 Assets 中选择安装程序。此入口进入 Release 页面，不假设尚未发布的附件已经存在；发布新版本后无需更改官网版本号。网站不查询 GitHub API、不代理安装包、不占用安装包下载流量，服务器无需本地下载目录或 manifest.json。

后台包含数据概览、校验队列、作品管理、客户端下载和操作记录。客户端下载显示 GitHub Release 地址，发布与版本管理在 GitHub 完成；旧的上传、发布、删除 API 返回 410，旧独立插件下载地址同样停用。数据库、历史统计和服务器上已有文件保留，升级不会删除历史安装包；旧代码的文件解析与迁移函数仅保留作历史数据回归测试，不向外提供服务。

桌面版下载统计是官网入口的 GET 跳转次数，不代表文件下载完成，HEAD 不计数，下载字节为 0。历史本地安装包请求及流量仍可追溯，GitHub 文件实际流量不计入官网统计。

更新 Nginx 时移除旧 /api/admin/releases/upload 的大文件上传 location，保留现有域名与 TLS 配置；新版模板使用统一 64 KiB 请求体限制。已有 LINGPET_DOWNLOAD_DIR 环境变量不再影响客户端下载。升级需保留原 LINGPET_DATA_DIR、数据库和管理员账号记录。
## 每日检查与共享服务器资源（0.4.21）

默认 LINGPET_SYNC_INTERVAL=24h。只跟踪仍有已上架版本的仓库；每个仓库发现新版本、每个上架版本检查来源均作为到期任务，空闲时逐项执行，不会同时扫描所有仓库。时间和连续失效次数存入数据库，重启继续使用；首次启用从未检查的来源依次处理，之后至少间隔 24 小时。手动校验任务优先，繁忙时每日检查可能延后。设置为 0 可关闭定时检查。

自动与手动投稿共用串行校验队列，按创建时间从早到晚处理；每项完成后至少等待 10 秒，不开启并发下载或解压。自动任务最多占用 180 个待处理名额，全站总上限仍为 200，预留 20 个给手动投稿。相同附件或已知作品版本不重复自动入队，失败任务不会每天无限重试；修复后可手动投稿或由管理员重试。管理员下架的版本不会自动恢复。

每日检查只读取 GitHub 元数据，不重新下载旧包、不比对历史 SHA256 或大小。来源检查使用 GitHub 直连，只有明确 404、仓库转私有、正式 Release 或附件不可用、仓库身份变更，连续 3 次每日检查确认后才下架该版本；超时、限流和其他异常不累计并重置连续次数。下架保留数据库与操作记录，历史可用版本仍可展示，已安装桌宠不受影响。全部版本下架后不再跟踪，恢复需人工处理。没有直连能力时只推迟检查，不根据中转站错误自动下架。

随包 systemd 配置面向共享 2 核 2 GiB 服务器：GOMAXPROCS=1、Go 内存软目标 384 MiB、CPUQuota=50%（半个 CPU 核心）、Nice=10、MemoryHigh=512M、MemoryMax=768M。CPU 限额会延长大包校验时间；内存硬限制保护其他服务，超限时该服务可能被系统终止后重启。资源边界不保证任意分享包都能通过。升级时需同时更新 service 文件并执行 daemon-reload；只替换二进制不会启用新的系统资源限制。

市场 0.4.22 管理后台新增「校验队列」：显示作品校验的实际先后顺序、正在执行的任务、手动或定时提交来源，以及每日发现更新与来源检查的执行状态、上次检查、下次到期、连续失效次数和最近异常。页面每 10 秒刷新；检查顺序为后台空闲时的顺序，到期时间并非保证执行时间。队列接口 GET /api/admin/queue 仅管理员改密完成后可访问。

## 市场排序与筛选（服务端 0.4.24 / 桌面端 0.7.24）

网页和桌面端发现页支持最近更新、累计下载量、仓库 Star、名称顺序、包体积从小到大排序；支持含原图、含像素、两者都有，以及点击、摸头、任一或两种互动、近 7/30/90 天更新的组合筛选。下载量按同一桌宠所有已上架版本附件累加，同一附件只计一次，Star 按仓库计数，同仓库不同形象共享仓库 Star；没有统计的数据排在已知数据之后，同值以更新时间、记录 ID 稳定排序。名称按不区分大小写的字符顺序排列，包大小以市场校验时记录为准。

GET /api/pets 继续返回数组，兼容旧客户端；新增参数 sort=updated|downloads|stars|name|size、style=original|pixel|both、interaction=any|click|pet|both、recent=7|30|90；空值代表不限。q 搜索作品名称、简介、作者、作品 ID、角色资料及仓库。非法筛选值返回 400。先取每个形象最新已上架版本，再筛选与排序，最多返回 200 项，历史版本不会因为更符合筛选而重新出现。网页条件保存在 URL，可刷新或分享；提供重置筛选和空结果重置。统计继续复用既有缓存。
## 默认展示作者（市场 0.4.25）

市场默认展示 GitHub 仓库所有者作为作者：优先使用已解析来源中的 Owner，旧记录从合法仓库地址提取账号或组织名。列表、详情、历史和安装信息统一在响应时应用该规则，既有投稿无需重打包或重新投稿。包内作者及已存档原始资料保留，不修改 GitHub 文件或附件；作者搜索同时匹配展示作者和原始资料作者。仓库 pet.json 可省略 author，校验时默认补入仓库所有者；分享包内 author 的格式校验继续保留。其他名称、介绍、宣传封面等展示规则不变。本体无需升级即可显示服务端返回的默认作者。
## 同版本资料刷新（市场 0.4.28 / 桌面端 0.7.29）

每日来源检查会比较已上架版本的名称、简介、作者、授权、角色资料与封面；发现变化后加入现有串行校验队列。作者也可以再次提交同一仓库，立即创建资料刷新任务，无需增加作品版本号。同一作品同时只保留一个待处理刷新任务；资料未变化时跳过分享包下载。管理员可在校验队列中查看“资料刷新”任务，投稿查询会显示完成或失败原因。

刷新期间旧资料继续上架；校验通过后保留作品链接与版本记录，切换资料和封面，校验失败则保留原内容。已下架作品不会被刷新任务重新上架。资料变动时仍需完整校验分享包；作品 ID、版本以及仓库与包内的角色 ID 必须一致，名称、介绍等展示字段可以不同，以仓库资料为准；市场作者仍默认显示仓库所有者。更改角色归属时，请同步修改包内角色信息。资料指纹仅用于判断是否需要刷新，不用于锁定附件或核对作者是否替换附件。

资料读取自索引指定 Release 标签对应的提交（单作品仓库同样读取其 Release 标签），只修改默认分支不会更新旧标签资料。可让索引指向包含新资料的新 Release 标签，作品版本保持不变，再手动提交或等待每日检查。若直接更新既有标签指向，也会在下次检查时比较资料。新版本与资料刷新共用一个工作线程，每个任务后间隔 10 秒；自动任务最多占 180 个待处理名额，总队列最多 200 个。每日检查在校验队列空闲时执行，到期时间不是保证执行时间。

市场刷新不会自动覆盖用户本地已经安装的同版本包；本地形象库仍保留原版本。桌面端重新加载市场列表或详情后，会根据资料修订刷新封面缓存。


## 附件下载线路回退（0.4.29）

修复资料读取可以走备用线路，但 `.petpack` 校验下载只走 GitHub 直连的问题。附件下载现在遵循 `LINGPET_GITHUB_ROUTES`，默认按 `direct,gh-proxy,ghfast` 串行尝试。单条线路最长180秒；下载失败会清理未完成文件，再尝试下一条。保留流式下载、包大小、重定向及内容校验，不新增并发工作线程。

服务器直连 GitHub 不稳定时，可设置 `LINGPET_GITHUB_ROUTES=gh-proxy,direct,ghfast`，升级二进制并执行 `sudo systemctl restart lingpet-market`，随后在管理员校验队列中重试原有失败投稿，无需再次投稿或重打桌宠包。`GITHUB_TOKEN` 不发送给附件下载或第三方线路。

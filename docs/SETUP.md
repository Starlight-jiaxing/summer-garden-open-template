# 定制与部署指南

[← 返回项目首页](../README.md)

这份指南适合准备把 Summer Garden 改成自己网站的朋友。你可以先完成名字、文字和图片的替换，再按需要启用留言管理或部署到公网。

## 在本地运行

需要 Python 3.10 或更新版本，无须安装额外的 Python 包。

下载并解压源码后，在项目文件夹打开终端，运行：

```bash
python server.py
```

Windows 也可以双击项目根目录的 `start-site.cmd`。启动后访问 <http://127.0.0.1:8765/>；在终端按 `Ctrl+C` 可以停止服务。

请通过这个 HTTP 地址访问页面，以便留言等接口正常工作。如果系统提示找不到 `python`，请先安装 Python，并确保终端能够运行 `python --version`。

## 换上你的内容

### 名称与昵称

修改 [`js/site-config.js`](../js/site-config.js) 中的两个值：

```js
window.SITE_CONFIG = {
  siteName: "你的花园名",
  ownerName: "你的昵称"
};
```

保留文件下方的配置应用代码。它会替换页面中预留的 `My Garden` 和 `Your Name` 文本；个人介绍、签名和经历等正文仍在各 HTML 页面中编辑。

### 页面与文字

| 文件 | 内容 |
| --- | --- |
| [`index.html`](../index.html) | 站台入口 |
| [`html/home.html`](../html/home.html) | 个人主页与介绍 |
| [`html/detail.html`](../html/detail.html) | 音乐、游戏、阅读与相册 |
| [`html/toolbox.html`](../html/toolbox.html) | 电脑手记、经历卡片与工具抽屉 |
| [`html/message.html`](../html/message.html) | 留言墙 |

示例经历和收藏可以替换成自己的内容。修改后刷新浏览器即可查看，不需要重新打包。

### 图片、相册与音乐

- **图片**：示例风景和鲸鱼位于 `img/`。如果换用其他文件名或格式，需要同步修改 HTML、CSS 或 JavaScript 中的引用。
- **相册**：照片列表位于 [`js/photo-gallery.js`](../js/photo-gallery.js)，可替换图片路径、标题和描述。
- **曲目**：音乐数据位于 [`js/main.js`](../js/main.js)，背景音乐路径位于 [`js/site-audio.js`](../js/site-audio.js)。所有示例曲目目前都使用 `audio/demo.wav` 这段四秒音频，替换时请逐项修改路径与曲目信息。
- **联系方式**：联系二维码默认关闭，需要时可自行补充公开的联系入口。

发布或再分发时，请使用自己有权发布的图片、音频和其他素材。素材与第三方代码说明见 [ASSETS.md](../ASSETS.md)。

## 设置留言管理

留言通过 `server.py` 提供的接口保存到本机 `data/` 目录。该目录已加入 `.gitignore`，用于存放本站的留言和管理数据。

首次设置站主管理密码：

```bash
python init_admin.py
```

按提示设置至少 16 个字符的密码，然后在浏览器打开 <http://127.0.0.1:8765/html/admin.html> 登录。重置已有密码时运行：

```bash
python init_admin.py --reset
```

重置后，已有管理会话会失效。请保留并定期备份 `data/`，更换服务器时也需要一并迁移。

## 部署到公网

### 使用静态托管

如果主要用于展示个人介绍、兴趣与手记，可以将前端文件放到静态托管服务。音乐、相册等前端交互仍可使用；留言写入与管理接口需要配套的 Python 后端，单独上传静态文件无法运行这些接口。

### 运行完整网站

完整功能需要在服务器上持续运行 `server.py`，并由反向代理提供 HTTPS 访问。

Python 服务默认监听 `127.0.0.1:8765`，适合由同机反向代理转发。公网管理登录还需要将 `ADMIN_ALLOWED_ORIGINS` 设为你的网站来源地址，也就是协议、域名和必要时的端口，不包含页面路径。多个来源用英文逗号分隔。

例如，在 Linux 服务器上使用你自己的域名启动：

```bash
ADMIN_ALLOWED_ORIGINS=https://your-domain.example python server.py
```

将示例域名换成实际域名，再配置反向代理、进程守护与数据备份。`data/` 应保留为服务端数据目录，不要作为公开静态文件托管。

可按需要设置以下环境变量：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Python 服务监听地址 |
| `PORT` | `8765` | 服务端口 |
| `GUESTBOOK_DATA_DIR` | 项目下的 `data/` | 留言与管理数据存储目录 |
| `ADMIN_ALLOWED_ORIGINS` | 本地 `localhost` 与 `127.0.0.1` 的 8765 端口 | 允许管理请求的来源 |
| `ENABLE_ANALYTICS` | `0` | 设为 `1` 时启用访问统计 |

访问统计默认关闭。如果启用，请在自己的网站中说明统计用途。

## 找到对应的文件

```text
summer-garden-open-template/
├── index.html           # 站台入口
├── html/                # 主页、兴趣、手记、留言与管理页面
├── css/                 # 页面样式
├── js/                  # 页面交互与内容配置
├── img/                 # 示例图片
├── audio/               # 示例音频
├── docs/                # 使用指南与页面预览
├── licenses/            # 第三方代码许可
├── server.py            # 本地服务与留言接口
├── init_admin.py        # 管理密码初始化与重置
└── start-site.cmd       # Windows 启动入口
```

遇到问题时，欢迎在 [Issues](https://github.com/Starlight-jiaxing/summer-garden-open-template/issues) 中说明操作步骤、报错和使用环境，方便一起定位。

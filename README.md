# Summer Garden · 个人网站模板

一个夏日手账风格的个人网站模板，包含站台首页、个人介绍、兴趣档案、电脑手记和留言墙。电脑手记包含四张经历卡片与后续计划区域。

## 本地运行

需要 Python 3.10 或更新版本。Windows 双击 `start-site.cmd`，或在项目目录运行：

```bash
python server.py
```

浏览器打开 <http://127.0.0.1:8765/>。通过 HTTP 打开才能使用留言接口。留言存在本机 `data/`，不会进入 Git。

## 改成你的网站

1. 编辑 `js/site-config.js` 中的 `siteName` 和 `ownerName`。
2. 修改 `index.html` 与 `html/` 下各页面的介绍、文章和卡片文字。
3. 用拥有再分发权的作品替换 `img/demo.svg`、`img/demo-whale.svg`。相册示例数据位于 `js/photo-gallery.js`。
4. `audio/demo.wav` 为程序合成的示例音；曲目数据位于 `js/main.js`，背景音乐路径位于 `js/site-audio.js`。仅使用你有权发布的音频。
5. 联系二维码默认已关闭，可自行添加经过授权的联系方式。

## 留言、管理与统计

留言由 `server.py` 提供，首次运行会在 `data/` 建立独立文件。设置站主密码：在项目目录运行 `python init_admin.py`，按提示设置至少 16 个字符的密码。生产环境需要 HTTPS、反向代理、备份和设置 `ADMIN_ALLOWED_ORIGINS`；不要把 `data/` 暴露到公网。统计默认关闭；需要时设置环境变量 `ENABLE_ANALYTICS=1`，并向访问者说明统计用途。

此项目的 Python 后端需要持续运行的服务器。静态托管服务只能展示前端，不能运行留言或管理接口。

## 许可与素材

项目代码按 MIT 许可；第三方鲸鱼交互代码的原作者及许可见 `licenses/whale-widget.txt`。原站个人照片、二维码、歌曲、书籍封面和第三方图片未包含；当前 SVG 与 WAV 为模板示例。

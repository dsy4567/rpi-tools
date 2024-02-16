# rpi-tools

把树莓派 / Linux 机器改造成娱乐工具。

## ✨ 特色

- 纯键盘/文字转语音交互，无需屏幕
- 代码很烂

## 💩 主要功能

- 使用 [Music On Console](https://github.com/jonsafari/mocp) 播放音乐
- 从网易云音乐下载日推/按 id 下载歌单（支持心动模式）
  - 被反爬制裁后 5 分钟自动重试
- 简约且简陋的音乐管理
  - 歌单
  - 喜欢/最喜欢
- 蓝牙耳机切歌
- 锁定键盘（防误触）

## 🛠 安装

下载源码，安装依赖

```bash
sudo apt install nodejs npm mocp pulseaudio pulseaudio-module-bluetooth espeak
git clone https://github.com/dsy4567/rpi-tools
cd rpi-tools
npm i
```

登录（可选）

在 `rpi-tools` 文件夹下创建 `cookie.txt`，内容如下：

```
MUSIC_U=******;
```

运行

```
node ./main.js
```

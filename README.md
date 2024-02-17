# rpi-tools

把树莓派 / Linux 机器改造成娱乐工具。

## ✨ 特色

-   纯键盘/文字转语音交互，无需屏幕
-   代码很烂

## 💩 主要功能

-   使用 [Music On Console](https://github.com/jonsafari/mocp) 播放音乐
-   从网易云音乐下载日推/按 id 下载歌单（支持心动模式）
    -   被反爬制裁后 5 分钟自动重试
-   简约且简陋的音乐管理
    -   歌单
    -   喜欢/最喜欢
-   蓝牙耳机切歌
-   锁定键盘（防误触）

## 🛠 安装

下载源码，安装依赖

```bash
sudo apt install nodejs npm mocp pulseaudio pulseaudio-module-bluetooth bluez espeak
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

## 操作方法

如无特别说明，以下按键均需在主菜单下使用

| 按键             | 操作                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- |
| `b`/`n`          | 上、下一曲                                                                                                        |
| `Space`          | 播放/暂停                                                                                                         |
| `Esc`            | 返回上一级菜单                                                                                                    |
| `v`              | 音量调节模式                                                                                                      |
| `b`/`n`          | 音量-/+ 10%（音量调节模式下）                                                                                     |
| `g`/`h`          | 音量-/+ 20%（音量调节模式下）                                                                                     |
| `m`              | 更多选项                                                                                                          |
| `m` `S`          | 立即关机                                                                                                          |
| `m` `s`          | 40 分钟后关机                                                                                                     |
| `P`              | 歌单选择模式                                                                                                      |
| `b`/`n`          | 上、下一个歌单（歌单选择模式下）                                                                                  |
| `Enter`          | 播放选中歌单（歌单选择模式下，一定概率换不了，可重试）                                                            |
| `0` ~ `9`        | 快速切换歌单                                                                                                      |
| `N`              | 顺序播放                                                                                                          |
| `R`              | 单曲循环                                                                                                          |
| `S`              | 随机播放                                                                                                          |
| `I`              | 重新初始化                                                                                                        |
| `i`              | 当前音乐信息                                                                                                      |
| `l`              | 添加到喜欢（根据语音提示按 `y`/其他任意键 `Enter` 可决定是否添加到最喜欢）                                        |
| `D`              | 下载歌单（根据语音提示输入歌单 id（0 为日推）并按 `Enter`，然后按 `y`/其他任意键 `Enter` 可决定是否使用心动模式） |
| `Q`/`Ctrl` + `C` | 退出                                                                                                              |

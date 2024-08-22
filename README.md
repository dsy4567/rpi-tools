# rpi-tools

把树莓派 / Linux 机器改造成娱乐工具。

## ✨ 特色

-   纯键盘/蓝牙耳机 + 文字转语音交互，无需屏幕
-   专为难以联网的使用场景设计
-   代码很烂

## 💩 主要功能

-   使用 [Music On Console](https://github.com/jonsafari/mocp) 播放音乐
-   从网易云音乐搜索单曲/歌单
-   从网易云音乐下载日推/按 id 下载歌单（支持心动模式）
    -   被反爬制裁后 5 分钟自动重试
-   简约且简陋的音乐管理
    -   歌单
    -   喜欢/最喜欢
-   蓝牙耳机切歌/使用快捷菜单
-   锁定键盘（防误触）

## 🛠 安装

下载源码，安装依赖

```bash
sudo apt install nodejs npm moc pulseaudio pulseaudio-module-bluetooth bluez espeak cpufrequtils screen
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

## 🕺 操作方法

### 🎧 蓝牙耳机

| 按键        | 操作                                                             |
| ----------- | ---------------------------------------------------------------- |
| 播放/暂停键 | 播放/暂停，选中菜单                                              |
| 上一曲      | 打开快捷菜单（播放状态下），上一曲（暂停状态下），选择上一个菜单 |
| 下一曲      | 下一曲（播放状态下），打开快捷菜单（暂停状态下），选择下一个菜单 |

### ⌨ 键盘

无特别说明的按键均需在主页下使用

| 按键               | 操作                                                                                               |
| ------------------ | -------------------------------------------------------------------------------------------------- |
| `h`                | 查看当前可用按键                                                                                   |
| `b` / `n`          | 上、下一曲/选项                                                                                    |
| `Space`            | 播放/暂停                                                                                          |
| `M`                | 打开快捷菜单                                                                                       |
| `Esc`              | 返回上一级菜单                                                                                     |
| `v`                | 进入音量调节模式                                                                                   |
| `b` / `n`          | 音量-/+ 10%（音量调节模式下）                                                                      |
| `g` / `h`          | 音量-/+ 20%（音量调节模式下）                                                                      |
| `c`                | 使用 `rpicam-still` 拍照（更多选项下）                                                             |
| `p`                | 切换歌单（按 `b` / `n` / `Enter` 选择和确认项目）                                                  |
| `U`                | 进入更新歌单模式（按 `b` / `n` / `Enter` 选择和确认项目）                                          |
| `0` ~ `9`          | 快速切换歌单                                                                                       |
| `N`                | 顺序播放                                                                                           |
| `R`                | 单曲循环                                                                                           |
| `S`                | 随机播放                                                                                           |
| `i`                | 当前音乐信息                                                                                       |
| `l`                | 添加到喜欢（按 `b` / `n` / `Enter` 选择和确认项目）                                                |
| `D`                | 下载歌单                                                                                           |
| `s`                | 搜索（根据语音提示输入搜索词并按 `Enter`，然后按 `1` / `2` + `Enter` 可选择展示单曲/歌单搜索结果） |
| `Q` / `Ctrl` + `C` | 退出                                                                                               |

| 更多选项 |                                                               |
| -------- | ------------------------------------------------------------- |
| `m`      | 进入更多选项                                                  |
| `S`      | 立即关机（更多选项下）                                        |
| `s`      | 40 分钟后关机（更多选项下）                                   |
| `p`      | 电源选项（更多选项下，按 `b` / `n` / `Enter` 选择和确认项目） |

## 🕒 待开发

摆烂

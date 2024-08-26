# rpi-tools

把树莓派 / Linux 机器改造成娱乐工具。

## ✨ 特色

-   纯键盘/蓝牙耳机 + 文字转语音交互，无需屏幕
-   专为难以联网的使用场景设计
-   代码很烂

## 💩 主要功能

-   网易云音乐
    -   搜索单曲/歌单
    -   更新歌单/日推
    -   MV 转音频（针对付费音乐）
    -   按 id 下载歌单（支持心动模式）/ 单曲
    -   清理/修复音乐
    -   离线点赞，联网后同步
-   拍照（使用 `rpicam`）
-   蓝牙耳机切歌/使用快捷菜单进行常用操作
-   崩溃保护
    -   崩溃后使用 [Music On Console](https://github.com/jonsafari/mocp) 提供最低限度的音乐播放服务

## 🛠 安装

-   下载源码，安装依赖

    ```bash
    sudo apt install nodejs npm moc pulseaudio pulseaudio-module-bluetooth bluez espeak cpufrequtils screen ffmpeg
    git clone https://github.com/dsy4567/rpi-tools
    cd rpi-tools
    npm i
    ```

-   配置 sudo 免密（用于关机重启、设置进程优先级、使用 `rpicam` 拍照）

-   登录网易云音乐（可选）

    在 `rpi-tools/data/` 文件夹下创建 `ncmCookie.txt`，内容参考：

    ```text
    MUSIC_U=******;
    ```

-   运行

    ```bash
    bash ./run.sh
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

| 按键               | 操作                                                |
| ------------------ | --------------------------------------------------- |
| `h`                | 查看当前可用按键                                    |
| `b` / `n`          | 上、下一曲/选项                                     |
| `Space`            | 播放/暂停                                           |
| `M`                | 打开快捷菜单                                        |
| `Esc`              | 返回上一级菜单                                      |
| `v`                | 进入音量调节模式                                    |
| `b` / `n`          | 音量-/+ 3%（音量调节模式下）                        |
| `g` / `h`          | 音量-/+ 5%（音量调节模式下）                        |
| `p`                | 切换歌单（按 `b` / `n` / `Enter` 选择和确认项目）   |
| `U`                | 更新歌单（按 `b` / `n` / `Enter` 选择和确认项目）   |
| `0` ~ `9`          | 快速切换歌单                                        |
| `N`                | 顺序播放                                            |
| `R`                | 单曲循环                                            |
| `S`                | 随机播放                                            |
| `i`                | 当前音乐信息                                        |
| `l`                | 添加到喜欢（按 `b` / `n` / `Enter` 选择和确认项目） |
| `D`                | 下载歌单                                            |
| `s`                | 搜索                                                |
| `Q` / `Ctrl` + `C` | 退出                                                |

| 更多选项 |                                                               |
| -------- | ------------------------------------------------------------- |
| `m`      | 进入更多选项                                                  |
| `c`      | 使用 `rpicam-still` 拍照                                      |
| `S`      | 立即关机（更多选项下）                                        |
| `s`      | 40 分钟后关机（更多选项下）                                   |
| `p`      | 性能选项（更多选项下，按 `b` / `n` / `Enter` 选择和确认项目） |

## 📄 快捷菜单项

-   喜欢
-   下一曲
-   网易云音乐-更多选项
    -   选择播放列表
    -   更新播放列表
    -   歌曲信息
    -   更新登录信息
    -   取消全部下载任务
    -   删除播放列表
-   电源
    -   关机
    -   定时关机
    -   重启
-   小工具
    -   拍照
-   上一曲

## 🕒 待开发

摆烂

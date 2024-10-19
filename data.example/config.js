"use strict";

/** @type { import("../modules/config") } */
const userConfig = {
    /** 自定义 shell 命令 @type {Record<String, {file: String, args: String[]}>} */
    // customCommands: {
    //     hello: { file: "espeak", args: ["hello"] },
    // },
    /** 默认播放模式 @type { import("../music/index").PlayMode } */
    // defaultPlayMode: "shuffle",
    /** 不上传听歌历史 */
    // doNotUpdateNcmHistory: false,
    /** 运行 mpris-proxy */
    // runMprisProxy: true,
    /** 启用 mpris 服务（主要用于蓝牙耳机按键） */
    // enableMprisService: true,
    /** 忽略未捕获错误 */
    // handleUncaughtException: true,
    /** jsonfile 包写入 JSON 文件的选项 @type {import("jsonfile").JFWriteOptions} */
    // jsonfileOptions: {
    //     spaces: 2,
    // },
    /** 锁定音量，防止更换输出设备等情况导致音量改变 */
    // lockVolume: true,
    /** 下载音乐时不带 cookie */
    // ncmDownloadSongWithCookie: true,
    /** 自动签到 */
    // ncmDailyCheckIn: true,
    /** 尽快加载 API */
    // ncmLoadApiOnStart: false,
    /** 音乐下载失败时（可能触发反爬）的重试间隔，单位毫秒 */
    // ncmRetryTimeout: [60 * 1000, 3 * 60 * 1000, 5 * 60 * 1000],
    /** 进程优先级 */
    // priority: -7,
    /** 显示歌词 */
    // showLyric: true,
    /** espeak 语言 */
    // TTSEspeakLanguage: "zh",
    /** fs 包写入文件的选项 @type {import("fs").WriteFileOptions} */
    // writeFileOptions: {
    //     flush: true,
    // },
};

module.exports = userConfig;

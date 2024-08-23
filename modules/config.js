"use strict";

const fs = require("graceful-fs");
const path = require("path");
const { logger, appRootPath } = require("./utils");
const { log, error, warn } = logger("config");

let userConfig = {};
try {
    if (fs.existsSync(path.join(appRootPath.get(), "data/config.js"))) {
        log("正在从 data/config.js 添加配置");
        userConfig = require("../data/config.js") || {};
    }
} catch (e) {
    error("无法加载自定义配置", e);
}

const defaultConfig = {
    /** 默认播放模式 @type { import("./music/index").PlayMode } */
    defaultPlayMode: "shuffle",
    /** 运行 mpris-proxy */
    runMprisProxy: true,
    /** 启用 mpris 服务（主要用于蓝牙耳机按键） */
    enableMprisService: true,
    /** 忽略未捕获错误 */
    handleUncaughtException: true,
    /** jsonfile 包写入 JSON 文件的选项 @type {import("jsonfile").JFWriteOptions} */
    jsonfileOptions: {
        spaces: 2,
    },
    /** 下载音乐时不带 cookie */
    ncmDownloadSongWithCookie: true,
    /** 音乐下载失败时（可能触发反爬）的重试间隔，单位毫秒 */
    ncmRetryTimeout: 5 * 60 * 1000,
    /** espeak 语言 */
    TTSEspeakLanguage: "zh",
    /** fs 包写入文件的选项 @type {import("fs").WriteFileOptions} */
    writeFileOptions: {
        flush: true,
    },
};
module.exports = Object.assign(defaultConfig, userConfig);

log("当前配置", module.exports);

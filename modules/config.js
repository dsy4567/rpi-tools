"use strict";

const { logger } = require("./utils");
const { log, error, warn } = logger("config");

let userConfig = {};
try {
    userConfig = require("../data/config.js");
} catch (e) {
    log("可在 data/config.js 添加配置");
}

const defaultConfig = {
    /** @type { import("./music/index").PlayMode } */
    defaultPlayMode: "shuffle",
    enableMprisService: true,
    handleUncaughtException: true,
    /** @type {import("jsonfile").JFWriteOptions} */
    jsonfileOptions: {
        spaces: 2,
    },
    ncmDownloadSongWithCookie: true,
    ncmRetryTimeout: 5 * 60 * 1000,
    TTSEspeakLanguage: "zh",
    /** @type {import("fs").WriteFileOptions} */
    writeFileOptions: {
        flush: true,
    },
};
module.exports = Object.assign(defaultConfig, userConfig);

log("当前配置", module.exports);

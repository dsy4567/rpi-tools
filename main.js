"use strict";

if (process.platform != "linux")
    throw new Error("rpi-tools 不支持在非 Linux 平台运行");

const { appRootPath, logger } = require("./modules/utils");
const { log, error, warn } = logger("main");
const { handleUncaughtException } = require("./modules/config");

function init() {
    require("./modules/music/player");
    require("./modules/vol");
}

handleUncaughtException &&
    process.on("uncaughtException", e => {
        console.error("未捕获的异常:", e);
    });

appRootPath.set(__dirname);

log("rpi-tools 已启动");
init();

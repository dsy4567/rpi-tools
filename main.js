"use strict";

if (process.platform != "linux")
    throw new Error("rpi-tools 不支持在非 Linux 平台运行");

const cp = require("child_process");

const { appRootPath, logger, execFile } = require("./modules/utils");
const { log, error, warn } = logger("main");
const { handleUncaughtException, priority } = require("./modules/config");

function init() {
    execFile("sudo", ["renice", "" + priority, "" + process.pid]);
    require("./modules/music/player");
    require("./modules/vol");
}

let exitOnError = true;

appRootPath.set(__dirname);

log("rpi-tools 已启动");
handleUncaughtException &&
    process.on("uncaughtException", e => {
        if (exitOnError) throw e;
        else error("未捕获的异常:", e);
    });
setTimeout(() => {
    exitOnError = false;
}, 20000);

init();

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

setTimeout(() => {
    if (!process.argv.includes("from-run-sh"))
        warn(
            "请从 run.sh 运行 rpi-tools, 而不是直接运行 main.js 或通过其他方式运行"
        );
}, 5000);

init();

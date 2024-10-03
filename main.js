"use strict";

if (process.platform != "linux")
    throw new Error("rpi-tools 不支持在非 Linux 平台运行");

const { appRootPath, logger, execFile } = require("./modules/utils");
const { log, error, warn } = logger("main");
const { priority } = require("./modules/config");

function init() {
    execFile("sudo", ["renice", "" + priority, "" + process.pid]);
    require("./modules/music/player");
    require("./modules/vol");
}

appRootPath.set(__dirname);

log("rpi-tools 已启动");
handleUncaughtException &&
    process.on("uncaughtException", e => {
        error(`未捕获的异常: ${e.stack}`);
        // process.exit(1);
    });
process.on("warning", w => {
    warn(`其他警告: ${w.stack}`);
});

setTimeout(() => {
    if (!process.argv.includes("from-run-sh"))
        warn(
            "建议从 run.sh 运行 rpi-tools, 而不是直接运行 main.js 或通过其他方式运行"
        );
}, 5000);

init();

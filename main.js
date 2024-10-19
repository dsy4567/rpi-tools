"use strict";

(async () => {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");

    if (process.platform != "linux")
        throw new Error("rpi-tools 不支持在非 Linux 平台运行");
    const lockfilePath = path.join(os.tmpdir(), ".rpi-tools-lockfile");
    if (fs.existsSync(lockfilePath)) {
        let exit = false;
        try {
            if (
                (
                    await require("find-process")(
                        "pid",
                        fs.readFileSync(lockfilePath),
                        true
                    )
                )[0]
            )
                exit = true;
        } catch (e) {
            console.error(e);
        }
        if (exit)
            throw new Error(
                "rpi-tools 不支持多开运行，如果你确认没有多开，请删除 " +
                    lockfilePath
            );
    }
    fs.writeFileSync(lockfilePath, "" + process.pid);
    process.on("exit", () => {
        try {
            fs.rmSync(lockfilePath);
        } catch (e) {}
    });

    const { appRootPath, logger, execFile } = require("./modules/utils");
    const { log, error, warn } = logger("main");
    const { priority, handleUncaughtException } = require("./modules/config");

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
        if (
            !process.argv.includes("from-run-sh") &&
            !process.argv.includes("from-npm-run-debug")
        )
            warn("建议从 run.sh 运行 rpi-tools, 而不是直接运行 main.js");
    }, 5000);

    function init() {
        execFile("sudo", ["renice", "" + priority, "" + process.pid]).catch(
            e => {
                try {
                    os.setPriority(os.constants.priority.PRIORITY_ABOVE_NORMAL);
                } catch (e) {
                    error("无法设置进程优先级");
                }
            }
        );
        require("./modules/music/player");
        require("./modules/vol");
    }
    init();
})();

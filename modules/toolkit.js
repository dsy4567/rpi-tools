"use strict";
const { mkdirSync } = require("graceful-fs");
const path = require("path");

const { tts } = require("./tts");
const { dateForFileName, appRootPath, logger, execFile } = require("./utils");
const { log, error, warn } = logger("menus");

function rpicam() {
    const p = path.join(appRootPath.get(), "data/photos");
    tts("拍照中");
    mkdirSync(p, { recursive: true });
    execFile(
        "sudo",
        ["rpicam-still", "-o", path.join(p, dateForFileName() + ".jpeg")],
        60000
    )
        .then(() => tts("拍照成功"))
        .catch(() => tts("拍照失败"));
}
async function setPowerMode(/** @type {"省电" | "平衡" | "性能"} */ m) {
    let mode = "";
    switch (m) {
        case "省电":
            mode = "powersave";
            break;
        case "平衡":
            mode = "ondemand";
            break;
        case "性能":
            mode = "performance";
            break;
        default:
            break;
    }

    mode &&
        execFile("sudo", ["cpufreq-set", "-g", mode])
            .then(() => {})
            .catch(e => {
                error(tts("无法更改电源选项", false), e);
            });
}

module.exports = {
    rpicam,
    setPowerMode,
};

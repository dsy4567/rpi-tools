"use strict";

const axios = require("axios");
const { mkdirSync } = require("graceful-fs");
const path = require("path");

const { customCommands } = require("./config");
const { tts } = require("./tts");
const {
    dateForFileName,
    appRootPath,
    logger,
    execFile,
    getIp,
} = require("./utils");
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
                error(tts("无法更改性能选项", false), e);
            });
}
async function netInfo() {
    let netQuality = "无网络或网络极差";
    let timeUsed = -1;
    try {
        const D = new Date();
        await axios.get("https://music.163.com/?t=" + +D, {
            timeout: 25000,
            validateStatus: () => true,
        });
        timeUsed = +new Date() - D;

        if (timeUsed < 0 || timeUsed >= 20000) {
            netQuality = "无网络或网络极差";
        } else if (timeUsed >= 0 && timeUsed < 1500) {
            netQuality = "极好";
        } else if (timeUsed >= 1500 && timeUsed < 5000) {
            netQuality = "较好";
        } else if (timeUsed >= 5000 && timeUsed < 10000) {
            netQuality = "一般";
        } else if (timeUsed >= 10000 && timeUsed < 20000) {
            netQuality = "较差";
        }
    } catch (e) {
        netQuality = "无网络或网络极差";
    }
    try {
        tts(
            `网络质量: ${netQuality} IP 地址: ${(() => {
                return (
                    getIp
                        .join("和")
                        .replaceAll(".", "点")
                        .replaceAll(":", "冒号") || "无网络或未知"
                );
            })()}`
        );
    } catch (e) {
        tts("操作失败");
    }
}
function customCmd(cmd) {
    if (!cmd) return;
    const file = customCommands[cmd]?.file,
        args = customCommands[cmd]?.args || [];
    if (!file || !args) return;
    log(file, args);
    execFile(file, args)
        .then(() => {
            log(tts("操作成功", false));
        })
        .catch(e => {
            error(tts("操作失败", false), e);
        });
}

module.exports = {
    rpicam,
    setPowerMode,
    netInfo,
    customCmd,
};

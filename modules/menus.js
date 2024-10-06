"use strict";

const axios = require("axios");
const cp = require("child_process");
const readline = require("readline");

const { rpicam, setPowerMode } = require("./toolkit");
const { tts } = require("./tts");
const { logger } = require("./utils");
const { log, error, warn } = logger("menus");

function pushMenuState(/** @type {String} */ s, _disableHelp = false) {
    disableHelp = _disableHelp;
    log("menuState:", s);
    tts(s);
    menuStates.push(s);
    resetPopMenuStateTimeout();
}
function popMenuState(_disableHelp = false) {
    disableHelp = _disableHelp;
    menuStates.pop();
    let s = getMenuState();
    log("menuState:", s);
    tts(s, false);
    resetPopMenuStateTimeout();
}
function resetPopMenuStateTimeout() {
    popMenuStateTimeout =
        popMenuStateTimeout ||
        setTimeout(() => {
            if (getMenuState() !== "主页") popMenuState();
        }, 15000);
    popMenuStateTimeout.refresh();
}
function getMenuState() {
    return menuStates.at(-1) || "主页";
}
function isMainMenu() {
    return menuStates.at(-1) == "主页" || menuStates.length == 0;
}
function getMenus() {
    return menus;
}
function addMenuItems(
    /** @type {String} */ menu,
    /** @type {Record<String, (k: string) => void>} */ obj
) {
    menus[menu] = menus[menu] || {};
    Object.assign(menus[menu], obj);
    return menus;
}
function activeMenu(/** @type {String} */ key) {
    if (!key) return;

    if (key == "\x1B" || key == "\x1B[3~") return popMenuState(); // Esc Del
    if (key == "\x03") return process.exit(0); // Ctrl+C

    resetPopMenuStateTimeout();

    const menu = menus[getMenuState()],
        f = menu?.[key];
    if (key == "h" && !disableHelp) {
        log("当前可用按键", Object.keys(menu));
    }
    try {
        f ? f(key) : menu?.default?.(key);
    } catch (e) {
        error(e);
        tts("操作失败");
    }
}
async function input(/** @type {String} */ prompt) {
    return new Promise((resolve, reject) => {
        pushMenuState("input", true);
        inpStr = "";
        tts(prompt, false);
        inpCb = resolve;
        process.stdout.write(`${(inpPrompt = prompt)}> ${inpStr}`);
    });
}
/** @returns {Promise<String>} */
async function chooseItem(
    /** @type {String} */ prompt,
    /** @type {String[]} */ items
) {
    return new Promise((resolve, reject) => {
        pushMenuState("chooseItem");
        currentItemChooser = prompt;
        items.splice(1, 0, "返回");
        itemChooserStates[prompt] = {
            items,
            selectedIndex: itemChooserStates[prompt]?.selectedIndex || 0,
        };
        tts(
            prompt + " " + items[itemChooserStates[prompt]?.selectedIndex || 0]
        );
        itemChooserCb = resolve;
    });
}

const quickMenus = {
    喜欢: "l",
    上下一曲: { 上一曲: "b", 下一曲: "n" },
    "网易云音乐-更多选项": {
        选择播放列表: "p",
        切换播放模式: {
            顺序播放: "N",
            随机播放: "S",
            单曲循环: "R",
        },
        歌曲信息: "i",
        更新播放列表: "U",
        更新登录信息: "_ncm.loginAgain",
        备份播放列表: "_ncm.backupPlaylistFile",
        删除播放列表: "_ncm.removePlaylist",
        取消全部下载任务: "_ncm.cancelDownloading",
    },
    更多选项: {
        拍照: () => {
            rpicam();
        },
        网络信息: async () => {
            let netQuality = "无网络或网络极差";
            let timeUsed = -1;
            try {
                tts(
                    `IP 地址: ${
                        cp
                            .execSync("hostname -I")
                            .toString()
                            .trim()
                            .replaceAll(".", "点")
                            .replaceAll(":", "冒号")
                            .replaceAll(" ", " 和 ") || "无网络或未知"
                    }`
                );
            } catch (e) {
                tts("操作失败");
            }
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
            tts(`网络质量: ${netQuality}`);
        },
        定时关机: () => {
            cp.execSync("sudo shutdown 40");
        },
        取消定时关机: () => {
            cp.execSync("sudo shutdown 40");
        },
        关机: () => {
            cp.execSync("sudo shutdown 0");
        },
        重启: () => {
            cp.execSync("sudo reboot");
        },
        电源选项: async () => {
            setPowerMode(
                await chooseItem("电源选项", ["省电", "平衡", "性能"])
            );
        },
    },
};

let inpStr = "",
    inpPrompt = "",
    inpCb = s => {};
let /** @type {Record<String, {selectedIndex: Number, items: String[]}>} */ itemChooserStates =
        {},
    currentItemChooser = "",
    itemChooserCb = () => {};
let disableHelp = false;
let menuStates = [];
let menus = {
    主页: {
        Q: k => {
            process.exit(0);
        },
        m: k => {
            pushMenuState("更多");
        },
        M: async k => {
            try {
                const f = async (quickMenus, prompt) => {
                    if (!quickMenus) return;
                    let m = await chooseItem(
                        prompt || "快捷菜单",
                        Object.keys(quickMenus)
                    );
                    typeof quickMenus[m] === "string"
                        ? activeMenu(m && quickMenus[m])
                        : typeof quickMenus[m] === "function"
                        ? await quickMenus[m]?.()
                        : await f(quickMenus[m], m);
                };
                await f(quickMenus);
            } catch (e) {
                error(tts("操作失败", true));
            }
        },
        // l: k => {
        //     pushMenuState("键盘锁定");
        // },
    },
    更多: {
        s: k => {
            cp.exec("sudo shutdown 40");
        },
        S: k => {
            cp.exec("sudo shutdown now");
        },
        c: k => {
            rpicam();
        },
        p: async k => {
            setPowerMode(
                await chooseItem("电源选项", ["省电", "平衡", "性能"])
            );
        },
    },
    键盘锁定: {
        default: k => {
            tts("键盘锁定");
        },
    },
    input: {
        "\r": k => {
            disableHelp = false;
            console.log();
            popMenuState();
            inpCb(inpStr);
        },
        "\x7F": k => {
            // Backspace
            inpStr = inpStr.substring(0, inpStr.length - 1);
            process.stdout.clearLine(0);
            process.stdout.cursorTo(0);
            process.stdout.write(`${inpPrompt}> ${inpStr}`);
        },
        default: k => {
            if (/[\S ]/g.test(k) && !/[\x00-\x1f\x7f]/g.test(k)) {
                inpStr += k;
                process.stdout.write(k);
            }
        },
    },
    chooseItem: {
        b: k => {
            const state = itemChooserStates[currentItemChooser],
                items = state.items,
                len = state.items.length;
            if (--state.selectedIndex < 0) state.selectedIndex = len - 1;
            tts(items[state.selectedIndex]);
        },
        n: k => {
            const state = itemChooserStates[currentItemChooser],
                items = state.items,
                len = state.items.length;
            if (++state.selectedIndex > len - 1) state.selectedIndex = 0;
            tts(items[state.selectedIndex]);
        },
        "\r": k => {
            const state = itemChooserStates[currentItemChooser],
                items = state.items,
                item = items[state.selectedIndex];
            item !== "返回" && itemChooserCb(item);
            popMenuState();
        },
    },
};

let /** @type {NodeJS.Timeout} */ inputTimeout,
    /** @type {NodeJS.Timeout} */ popMenuStateTimeout;

if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (chunk, key) => {
        if (getMenuState() === "input") activeMenu(key.sequence);
        else {
            // 防止无意间进行粘贴，导致意外执行操作
            clearTimeout(inputTimeout);
            inputTimeout = setTimeout(() => {
                activeMenu(key.sequence);
            }, 10);
        }
    });
}

module.exports = {
    addMenuItems,
    getMenus,
    getMenuState,
    pushMenuState,
    popMenuState,
    chooseItem,
    input,
    isMainMenu,
    activeMenu,
};

"use strict";

const cp = require("child_process");
const readline = require("readline");

const { customCommands } = require("./config");
const { rpicam, setPowerMode, netInfo, customCmd } = require("./toolkit");
const { tts, speakLastText, isSpeaking } = require("./tts");
const { logger } = require("./utils");
const { log, error, warn, emitter } = logger("menus");

function pushMenuState(/** @type {String} */ s, _disableHelp = false) {
    disableHelp = _disableHelp;
    log("menuState:", s);
    tts(s);
    menuStates.push(s);
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
    clearTimeout(popMenuStateTimeout);
    popMenuStateTimeout = setTimeout(() => {
        if (isSpeaking()) return resetPopMenuStateTimeout();
        if (getMenuState() !== "主页") popMenuState();
    }, 15000);
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

    (!key.startsWith("_") || key === "_") && resetPopMenuStateTimeout();

    const menu = menus[getMenuState()],
        f = menu?.[key];
    if (key == "H" && !disableHelp) {
        log("当前可用按键", Object.keys(menu));
    }
    try {
        f ? f(key) : menu?.default?.(key);
    } catch (e) {
        error(e);
        tts("操作失败");
    }
}
function rePrintInputPrompt(params) {
    process.stdout._betterWrite(`${inpPrompt}> ${inpStr}`);
}
async function input(/** @type {String} */ prompt) {
    return new Promise((resolve, reject) => {
        pushMenuState("input", true);
        inpStr = "";
        tts(prompt, false);
        inpCb = resolve;
        inpPrompt = prompt;
        rePrintInputPrompt();
    });
}
/** @returns {Promise<String>} */
async function chooseItem(
    /** @type {String} */ prompt,
    /** @type {String[]} */ items,
    resetIndex = false
) {
    return new Promise((resolve, reject) => {
        pushMenuState("chooseItem");
        currentItemChooser = prompt;
        items.splice(1, 0, "返回");
        itemChooserStates[prompt] = {
            items,
            selectedIndex: resetIndex
                ? 0
                : itemChooserStates[prompt]?.selectedIndex || 0,
        };
        tts(
            prompt + " " + items[itemChooserStates[prompt]?.selectedIndex || 0]
        );
        itemChooserCb = resolve;
    });
}

const statusBar = {
    rePrint() {
        process.stdout._betterWrite(statusBarText);
    },
    setText(text = "") {
        statusBarText = text;
        this.rePrint();
    },
};

const /** @type {import(".").QuickMenu} */
    quickMenus = {
        常用: {
            添加到: "l",
            选择播放列表: "p",
            切换播放模式: {
                顺序播放: "N",
                随机播放: "S",
                默认: "_player.setPlayMode_default",
                倒序播放: "_player.setPlayMode_reversed",
                单曲循环: "R",
            },
        },
        上下一曲: { 上一曲: "b", 下一曲: "n" },
        网易云音乐: {
            更新播放列表: "U",
            取消全部下载任务: "_ncm.cancelDownloading",
            歌词: "L",
            歌曲信息: "i",
            更新登录信息: "_ncm.loginAgain",
            更多: {
                添加到: "l",
                选择播放列表: "p",
                切换播放模式: {
                    顺序播放: "N",
                    随机播放: "S",
                    单曲循环: "R",
                },
                备份播放列表: "_ncm.backupPlaylistFile",
                删除播放列表: "_ncm.removePlaylist",
            },
        },
        更多选项: {
            锁定音量: "_vol.lock",
            音量调节: "_vol.adjust",
            拍照: () => {
                rpicam();
            },
            网络信息: () => {
                netInfo();
            },
            电源: {
                定时关机: () => {
                    cp.execSync("sudo shutdown 40");
                },
                取消定时关机: () => {
                    cp.execSync("sudo shutdown -c");
                },
                关机: () => {
                    cp.execSync("sudo shutdown 0");
                },
                重启: () => {
                    cp.execSync("sudo reboot");
                },
            },
            性能选项: async () => {
                setPowerMode(
                    await chooseItem("性能选项", ["省电", "平衡", "性能"])
                );
            },
            自定义命令: async () => {
                customCmd(
                    await chooseItem("自定义命令", Object.keys(customCommands))
                );
            },
        },
    };

let inpStr = "",
    inpPrompt = "",
    inpCb = s => {};
let statusBarText = "";
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
        T: k => {
            speakLastText();
        },
        M: k => {
            pushMenuState("更多");
        },
        m: async k => {
            try {
                const f = async (
                    /** @type {import(".").QuickMenu} */ quickMenus,
                    prompt
                ) => {
                    if (!quickMenus) return;
                    let m = await chooseItem(
                        prompt || "快捷菜单",
                        Object.keys(quickMenus)
                    );
                    const qmm = quickMenus[m];
                    typeof qmm === "string"
                        ? activeMenu(m && qmm)
                        : typeof qmm === "function"
                        ? await qmm?.()
                        : await f(qmm, m);
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
                await chooseItem("性能选项", ["省电", "平衡", "性能"])
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
            rePrintInputPrompt();
        },
        default: k => {
            if (/[\S ]/g.test(k) && !/[\x00-\x1f\x7f]/g.test(k)) {
                inpStr += k;
                process.stdout._betterWrite(k, false);
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
        " ": k => {
            const state = itemChooserStates[currentItemChooser],
                items = state.items,
                item = items[state.selectedIndex];
            item !== "返回" && itemChooserCb(item);
            popMenuState();
        },
        m: k => {
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
    emitter.on("afterLog", () => {
        if (getMenuState() === "input") rePrintInputPrompt();
        else statusBar.rePrint();
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
    statusBar,
};

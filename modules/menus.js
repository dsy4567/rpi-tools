"use strict";

const cp = require("child_process");
const readline = require("readline");
const { mkdirSync } = require("graceful-fs");
const path = require("path");
const { homedir } = require("os");

const { tts } = require("./tts");
const { dateForFileName, appRootPath, logger } = require("./utils");
const { log, error, warn } = logger("menus");

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
    tts(s);
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

    if (key == "\x1B") return popMenuState(); // Esc
    if (key == "\x03") return process.exit(0); // Ctrl^C

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
        tts(prompt);
        inpCb = resolve;
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
function rpicam() {
    const p = path.join(appRootPath.get(), "data/photos");
    tts("拍照中");
    mkdirSync(p, { recursive: true });
    cp.exec(
        `sudo rpicam-still -o ${path.join(p, dateForFileName() + ".jpeg")}`,
        e => {
            if (e) return tts("拍照失败");
            tts("拍照成功");
        }
    );
}

let inpStr = "",
    inpCb = s => {};
let /** @type {Record<String, {selectedIndex: Number, items: String[]}>} */ itemChooserStates =
        {},
    currentItemChooser = "",
    itemChooserCb = () => {};
let disableHelp = false;
let menuStates = [];
let quickMenus = {
    喜欢: "l",
    下一曲: "n",
    "网易云音乐-更多选项": {
        选择播放列表: "p",
        更新播放列表: "U",
        歌曲信息: "i",
        更新登录信息: "_ncm.loginAgain",
        取消全部下载任务: "_ncm.cancelDownloading",
        删除播放列表: "_ncm.removePlaylist",
    },
    电源: {
        关机: () => {
            cp.execSync("sudo shutdown 0");
        },
        定时关机: () => {
            cp.execSync("sudo shutdown 40");
        },
        重启: () => {
            cp.execSync("sudo reboot");
        },
    },
    小工具: {
        拍照: () => {
            rpicam();
        },
    },
    上一曲: "b",
};
let menus = {
    主页: {
        Q: k => {
            process.exit(0);
        },
        m: k => {
            pushMenuState("更多");
        },
        M: k => {
            const f = async (quickMenus, prompt) => {
                if (!quickMenus) return;
                let m = await chooseItem(
                    prompt || "快捷菜单",
                    Object.keys(quickMenus)
                );
                typeof quickMenus[m] === "string"
                    ? activeMenu(m && quickMenus[m])
                    : typeof quickMenus[m] === "function"
                    ? quickMenus[m]?.()
                    : f(quickMenus[m], m);
            };
            f(quickMenus);
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
        p: k => {
            chooseItem("电源选项", ["省电", "平衡", "性能"]).then(v => {
                let m;
                switch (v) {
                    case "省电":
                        m = "powersave";
                        break;
                    case "平衡":
                        m = "ondemand";
                        break;
                    case "性能":
                        m = "performance";
                        break;
                    default:
                        break;
                }
                m &&
                    cp.exec("sudo cpufreq-set -g " + m, (e, stdout, stderr) => {
                        e &&
                            error(
                                "无法更改电源选项",
                                e,
                                "\nstdout:",
                                stdout,
                                "\nstderr:",
                                stderr
                            );
                    });
            });
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
            process.stdout.write("\n");
            popMenuState();
            inpCb(inpStr);
        },
        "\x7F": k => {
            // Backspace
            inpStr = inpStr.substring(0, inpStr.length - 1);
            process.stdout.write("\x08 \x08");
        },
        default: k => {
            if (!/\s/g.test(k)) {
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

let /** @type {NodeJS.Timeout} */ inputTimeout;

if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
    process.stdin.setRawMode(true);
    process.stdin.on("keypress", (chunk, key) => {
        if (getMenuState() === "input") activeMenu(key.sequence);
        else {
            // 防止无意间进行粘贴，导致意外执行操作
            clearTimeout(inputTimeout);
            setTimeout(() => {
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

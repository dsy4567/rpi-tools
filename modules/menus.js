const cp = require("child_process");
const readline = require("readline");
const { tts } = require("./tts");
const { mkdirSync } = require("fs");
const path = require("path");
const Player = require("@jellybrick/mpris-service");
const { homedir } = require("os");

function pushMenuState(s) {
    console.log("menuState:", s);
    tts(s);
    menuStates.push(s);
}
function popMenuState() {
    menuStates.pop();
    let s = getMenuState();
    console.log("menuState:", s);
    tts(s);
}
function getMenuState() {
    return menuStates.at(-1) || "主菜单";
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
function activeMenu(key) {
    if (!key) return;

    if (key == "\x1B") return popMenuState();
    if (key == "\x03") return process.exit(0);

    const menu = menus[getMenuState()],
        f = menu?.[key];
    try {
        f ? f(key) : menu?.default?.(key);
    } catch (e) {
        console.error(e);
        tts("操作失败");
    }
}

const mp = cp.exec("mpris-proxy");
const player = new Player({
    name: "rpitools",
    identity: "rpitools",
    supportedUriSchemes: ["file"],
    supportedMimeTypes: ["audio/mpeg", "application/ogg"],
    supportedInterfaces: ["player"],
});
[
    "raise",
    "quit",
    "next",
    "previous",
    "pause",
    "playpause",
    "stop",
    "play",
    "seek",
    "position",
    "open",
    "volume",
    "loopStatus",
    "shuffle",
].forEach(ev => {
    player.on(ev, () => {
        const isMainMenu =
            menuStates.at(-1) == "主菜单" || menuStates.length == 0;
        switch (ev) {
            case "play":
            case "pause":
                if (isMainMenu) {
                    activeMenu(" ");
                } else {
                    activeMenu("\r");
                }

                break;
            case "next":
                if (isMainMenu) {
                    if (require("./music").getMocStatus().playing)
                        activeMenu("n");
                    else activeMenu("b");
                } else {
                    activeMenu("n");
                }
                break;
            case "previous":
                if (isMainMenu) {
                    activeMenu("M");
                } else {
                    activeMenu("b");
                }
                break;

            default:
                break;
        }
    });
});

let menuStates = [];
let quickMenus = {
    喜欢: "l",
    选择播放列表: "p",
    更新播放列表: "U",
    歌曲信息: "i",
    关机: () => {
        cp.execSync("sudo shutdown 0");
    },
    定时关机: () => {
        cp.execSync("sudo shutdown 40");
    },
    重启: () => {
        cp.execSync("sudo reboot");
    },
    拍照: k => {
        tts("拍照中");
        const { formattedDate } = require("./utils");
        mkdirSync(path.join(homedir(), "Photos"), { recursive: true });
        cp.exec(`sudo rpicam-still -o Photos/${formattedDate()}.jpeg`, e => {
            if (e) return tts("拍照失败");
            tts("拍照成功");
        });
    },
};
let menus = {
    主菜单: {
        Q: k => {
            process.exit(0);
        },
        m: k => {
            pushMenuState("更多");
        },
        M: async k => {
            let m = await chooseItem("快捷菜单", Object.keys(quickMenus));
            typeof quickMenus[m] === "string"
                ? activeMenu(m && quickMenus[m])
                : quickMenus[m]();
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
            tts("拍照中");
            const { formattedDate } = require("./utils");
            mkdirSync(path.join(homedir(), "Photos"), { recursive: true });
            cp.exec(
                `sudo rpicam-still -o Photos/${formattedDate()}.jpeg`,
                e => {
                    if (e) return tts("拍照失败");
                    tts("拍照成功");
                }
            );
        },
        p: k => {
            const { chooseItem } = require("./utils");
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
                m && cp.exec("sudo cpufreq-set -g " + m);
            });
        },
    },
    键盘锁定: {
        default: k => {
            tts("键盘锁定");
        },
    },
};

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on("keypress", (chunk, key) => {
    activeMenu(key.sequence);
});

module.exports = {
    addMenuItems,
    getMenus,
    getMenuState,
    pushMenuState,
    popMenuState,
};

const { chooseItem } = require("./utils");

const readline = require("readline");
const { tts } = require("./tts");

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
async function input(prompt) {
    return new Promise((resolve, reject) => {
        pushMenuState("input");
        inpStr = "";
        tts(prompt);
        inpCb = resolve;
    });
}

let menuStates = [];
let inpStr = "",
    inpCb = s => {};
let menus = {
    主菜单: {
        Q: k => {
            process.exit(0);
        },
        m: k => {
            pushMenuState("更多");
        },
        l: k => {
            pushMenuState("键盘锁定");
        },
    },
    更多: {
        s: k => {
            cp.exec("sudo shutdown 40");
        },
        S: k => {
            cp.exec("sudo shutdown now");
        },
        i: async k => {
            tts(await input("aaa"));
        },
    },
    键盘锁定: {
        default: k => {
            tts("键盘锁定");
        },
    },
    input: {
        "\r": k => {
            popMenuState();
            inpCb(inpStr);
        },
        default: k => {
            inpStr += k;
        },
    },
};

readline.emitKeypressEvents(process.stdin);
if (process.stdin.isTTY) process.stdin.setRawMode(true);
process.stdin.on("keypress", (chunk, key) => {
    if (key.sequence == "\x1B") return popMenuState();
    if (key.sequence == "\x03") return process.exit(0);

    const menu = menus[getMenuState()],
        f = menu?.[key.sequence];
    f ? f(key.sequence) : menu?.default?.(key.sequence);
});

module.exports = { addMenuItems, getMenus, getMenuState, pushMenuState, popMenuState, input };

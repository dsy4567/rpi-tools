const ncm = require("NeteaseCloudMusicApi");
const menus = require("./menus");
const tts = require("./tts").tts;
const axios = require("axios").default;

let inpStr = "",
    inpCb = s => {};
let /** @type {Record<String, {selectedIndex: Number, items: String[]}>} */ itemChooserStates = {},
    currentItemChooser = "",
    itemChooserCb = () => {};

module.exports = {
    escape(s) {
        return s.replace(/[\(\)'"\\\&\%\$\#\[\]\{\}\* ]/g, "\\$&");
    },
    async onlineStatusCheck() {
        return new Promise(resolve => {
            axios
                .get("https://www.baidu.com", { validateStatus: () => true })
                .then(r => resolve(true))
                .catch(e => resolve(false));
        });
    },
    async ncmStatusCheck(/** @type {Promise<ncm.Response>} */ res) {
        const resp = await res;
        if (resp.body.code === 200) return resp;
        throw new Error(resp);
    },
    async sleep(t) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, t);
        });
    },
    async input(prompt) {
        return new Promise((resolve, reject) => {
            menus.pushMenuState("input");
            inpStr = "";
            tts(prompt);
            inpCb = resolve;
        });
    },
    async chooseItem(prompt, items) {
        return new Promise((resolve, reject) => {
            menus.pushMenuState("chooseItem");
            currentItemChooser = prompt;
            itemChooserStates[prompt] = {
                items,
                selectedIndex: itemChooserStates[prompt]?.selectedIndex || 0,
            };
            tts(prompt);
            itemChooserCb = resolve;
        });
    },
};

menus.addMenuItems("input", {
    "\r": k => {
        console.log("\n" + inpStr);
        menus.popMenuState();
        inpCb(inpStr);
    },
    "\x7F": k => {
        inpStr = inpStr.substring(0, inpStr.length - 1);
        process.stdout.write("\x08");
    },
    default: k => {
        inpStr += k;
        process.stdout.write(k);
    },
});
menus.addMenuItems("chooseItem", {
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
            items = state.items;
        itemChooserCb(items[state.selectedIndex]);
        menus.popMenuState();
    },
});

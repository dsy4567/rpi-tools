const menus = require("./menus");
const tts = require("./tts").tts;

let inpStr = "",
    inpCb = s => {};
let /** @type {Record<String, {selectedIndex: Number, items: String[]}>} */ itemChooserStates =
        {},
    currentItemChooser = "",
    itemChooserCb = () => {};

module.exports = {
    escape(s) {
        return s.replace(/[\(\)'"\\\&\%\$\#\[\]\{\}\* ]/g, "\\$&");
    },
    formattedDate() {
        const date = new Date();
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, "0");
        const day = date.getDate().toString().padStart(2, "0");
        const hour = date.getHours().toString().padStart(2, "0");
        const minute = date.getMinutes().toString().padStart(2, "0");
        const second = date.getSeconds().toString().padStart(2, "0");
        return `${year}-${month}-${day}-${hour}-${minute}-${second}`;
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
            tts(
                prompt +
                    " " +
                    items[itemChooserStates[prompt]?.selectedIndex || 0]
            );
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

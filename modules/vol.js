"use strict";

const vc = require("volume_supervisor").volumeControl;

const menus = require("./menus");
const tts = require("./tts").tts;

let vol = 30,
    autoSetVolCb = () => {};

function addVol(add = 0) {
    vol += add;
    if (vol > 100) vol = 100;
    if (vol < 0) vol = 0;
    vc.setGlobalVolume(vol);
}
function autoSetVol(/** @type {(vol: Number) => void} */ cb) {
    if (typeof cb !== "function") return;
    autoSetVolCb = cb;
}

menus.addMenuItems("主页", {
    v: k => {
        menus.pushMenuState("音量调节");
    },
});
menus.addMenuItems("音量调节", {
    b: k => {
        addVol(-3);
        tts("音量减");
    },
    g: k => {
        addVol(-5);
        tts("音量减减");
    },
    n: k => {
        addVol(3);
        tts("音量加");
    },
    h: k => {
        addVol(5);
        tts("音量加加");
    },
});

setInterval(async () => {
    try {
        vol = await vc.getGlobalVolume();
        if (vol >= 100) {
            vol = 30;
            addVol();
        } else if (vol <= 3) autoSetVolCb(15);
        else if (vol <= 6) autoSetVolCb(30);
        else if (vol <= 9) autoSetVolCb(60);
        else autoSetVolCb(100);
    } catch (e) {}
}, 5000);

module.exports = {
    addVol,
    autoSetVol,
};

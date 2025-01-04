"use strict";

const vc = require("volume_supervisor").volumeControl;

const menus = require("./menus");
const tts = require("./tts").tts;
const { logger } = require("./utils");
const { log, error, warn } = logger("vol");

let lockVolume = false;
let vol = 30,
    autoSetVolCb = () => {};

function addVol(add = 0) {
    vol += add;
    if (vol > 100) vol = 99;
    if (vol < 0) vol = 0;
    vc.setGlobalVolume(vol);
    autoSetVolCb(vol);
}
function autoSetVol(/** @type {(vol: Number) => void} */ cb) {
    if (typeof cb !== "function") return;
    autoSetVolCb = (...args) => {
        try {
            cb(...args);
        } catch (e) {
            error(e);
        }
    };
}

menus.addMenuItems("主页", {
    g: k => {
        addVol(-3);
        tts("音量减");
    },
    t: k => {
        addVol(-5);
        tts("音量减减");
    },
    h: k => {
        addVol(3);
        tts("音量加");
    },
    y: k => {
        addVol(5);
        tts("音量加加");
    },
    "_vol.adjust": k => {
        menus.pushMenuState("音量调节");
    },
    "_vol.lock": k => {
        lockVolume = !lockVolume;
    },
});
menus.addMenuItems("音量调节", {
    n: k => {
        addVol(-3);
        tts("音量减");
    },
    b: k => {
        addVol(3);
        tts("音量加");
    },
    "\r": k => {menus.popMenuState()
    },
});
setInterval(async () => {
    try {
        let tmpvol = await vc.getGlobalVolume();
        if (tmpvol >= 100 || lockVolume) {
            tmpvol = vol;
            addVol();
        }
        vol = tmpvol;
        autoSetVolCb(vol);
    } catch (e) {}
}, 5000);

module.exports = {
    addVol,
    autoSetVol,
};

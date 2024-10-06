"use strict";

const vc = require("volume_supervisor").volumeControl;

const menus = require("./menus");
const tts = require("./tts").tts;

let vol = 30;

function addVol(add = 0) {
    vol += add;
    if (vol > 100) vol = 100;
    if (vol < 0) vol = 0;
    vc.setGlobalVolume(vol);
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
        if ((await vc.getGlobalVolume()) >= 100) addVol();
        vol = await vc.getGlobalVolume();
    } catch (e) {}
}, 5000);

module.exports = {
    addVol,
};

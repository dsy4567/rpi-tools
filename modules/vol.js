"use strict";

const vc = require("volume_supervisor").volumeControl;

const menus = require("./menus");

let vol = 30;

function setVol(add = 0) {
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
        setVol(-3);
    },
    g: k => {
        setVol(-5);
    },
    n: k => {
        setVol(3);
    },
    h: k => {
        setVol(5);
    },
});

setInterval(async () => {
    try {
        if ((await vc.getGlobalVolume()) >= 100) setVol();
    } catch (e) {}
}, 5000);

module.exports = {
    setVol,
};

"use strict";

const clrc = require("clrc");

const ncm = require("./ncm");
const tts = require("../tts").tts;
const menus = require("../menus");
const { logger } = require("../utils");
const { log, error, warn } = logger("歌词");

let /** @type {NodeJS.Timeout} */ lrcInterval,
    /** @type {NodeJS.Timeout} */ currentMilSecInterval,
    currentId = 0,
    currentLrcText = "";

async function showLyric(id, currentSecOffset = 0, getCurrentSec) {
    try {
        menus.statusBar.setText("");
        const lrcText =
            currentId == id && currentLrcText
                ? currentLrcText
                : await ncm.getLyricText(id);
        if (!lrcText) return menus.statusBar.setText("");

        let lrc = clrc.parse(lrcText),
            currentMilSec = 0;
        pause();
        if (!lrc[0]) return menus.statusBar.setText("");
        let D = new Date(),
            lastLText = "";
        lrcInterval = setInterval(async () => {
            let /** @type {ReturnType<import("clrc").parse>[0]} */ l;
            currentMilSec = new Date() - D + currentSecOffset;
            for (let i = 0; i < lrc.length; i++) {
                l = lrc[i];

                if (l.type !== "lyric") continue;
                if (l.type === "lyric" && currentMilSec >= l.startMillisecond)
                    if (
                        currentMilSec <=
                        (lrc[i + 1]?.startMillisecond || 1145141919810)
                    )
                        break;
                    else continue;
                else continue;
            }
            const lText = l?.content || "";
            lastLText != lText &&
                menus.getMenuState() !== "input" &&
                menus.statusBar.setText("🎵 " + lText);
        }, 100);
        currentMilSecInterval = setInterval(async () => {
            try {
                if (typeof getCurrentSec !== "function") return;
                const ms = +(await getCurrentSec()) * 1000 || 0;
                if (isNaN(ms)) return;
                currentSecOffset = ms;
                D = new Date();
            } catch (e) {
                error(e);
            }
        }, 5000);
    } catch (e) {
        error("无法展示歌词", e);
    }
}
function hideLyric() {
    clearInterval(lrcInterval);
    clearInterval(currentMilSecInterval);
    menus.statusBar.setText("");
}
function pause() {
    clearInterval(currentMilSecInterval);
    clearInterval(lrcInterval);
}

module.exports = { showLyric, hideLyric, pause };

"use strict";

const lu = require("lrc-utils").default;

const config = require("../config");
const ncm = require("./ncm");
const tts = require("../tts").tts;
const menus = require("../menus");
const { logger } = require("../utils");
const { log, error, warn } = logger("歌词");

let /** @type {NodeJS.Timeout} */ lrcInterval,
    /** @type {NodeJS.Timeout} */ currentMilSecInterval,
    currentId = 0,
    currentRawLrcText = "",
    currentRawTLrcText = "",
    lastStatusBarText = "无歌词";

function noLyric() {
    hideLyric();
    lastStatusBarText = "无歌词";
}
async function showLyric(id, currentMillSecOffset = 0, getCurrentSec) {
    try {
        if (!id) return noLyric();
        if (!config.showLyric) {
            return hideLyric();
        }

        menus.getMenuState() !== "input" && menus.statusBar.setText("");

        let lrcText = "",
            tLrcText = "";
        if (currentId == id && currentRawLrcText) {
            lrcText = currentRawLrcText;
            tLrcText = currentRawTLrcText;
        } else {
            const result = await ncm.getRawLyricText(id);
            currentId = id;
            currentRawLrcText = lrcText = result.lyric;
            currentRawTLrcText = tLrcText = result.tLyric;
        }
        if (!lrcText) return noLyric();
        if (!tLrcText) tLrcText = "";

        let parsedLrc = lu.parse(lrcText).lines,
            parsedTLrc = lu.parse(tLrcText).lines,
            currentMilSec = 0;

        pause();
        if (!parsedLrc[0]) return noLyric();

        let D = new Date();
        const update = async () => {
            try {
                let /** @type {(typeof parsedLrc)[0]} */ l,
                    /** @type {(typeof parsedTLrc)[0]} */ tL;
                currentMilSec = new Date() - D + currentMillSecOffset;
                for (let i = 0; i < parsedLrc.length; i++) {
                    const tempL = parsedLrc[i];
                    const nextL = parsedLrc[i + 1];

                    if (currentMilSec >= tempL.start * 1000)
                        if (
                            currentMilSec <=
                                (nextL?.start ?? 1145141919810) * 1000 &&
                            tempL.startMillisecond !== nextL?.start * 1000
                        ) {
                            l = tempL;
                            break;
                        } else continue;
                    else continue;
                }
                for (let i = 0; i < parsedTLrc.length; i++) {
                    const tempTL = parsedTLrc[i];
                    const nextTL = parsedTLrc[i + 1];

                    if (currentMilSec >= tempTL.start * 1000)
                        if (
                            currentMilSec <=
                                (nextTL?.start ?? 1145141919810) * 1000 &&
                            tempTL.startMillisecond !== nextTL?.start * 1000
                        ) {
                            tL = tempTL;
                            break;
                        } else continue;
                    else continue;
                }
                const lText = l?.content.map(l => l.text).join() || "",
                    tLText = tL?.content.map(l => l.text).join() || "";
                const statusBarText = lText + (tLText && ` (${tLText})`);
                lastStatusBarText != statusBarText &&
                    menus.getMenuState() !== "input" &&
                    menus.statusBar.setText(
                        (lastStatusBarText = statusBarText)
                    );
            } catch (e) {
                error(e);
                hideLyric();
            }
        };
        lrcInterval = setInterval(update, 100);
        update();
        currentMilSecInterval = setInterval(async () => {
            try {
                if (typeof getCurrentSec !== "function") return;
                const ms = +(await getCurrentSec()) * 1000 || 0;
                if (isNaN(ms)) return;
                currentMillSecOffset = ms;
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
    currentId = 0;
    currentRawLrcText = "";
    currentRawTLrcText = "";
    menus.getMenuState() !== "input" && menus.statusBar.setText("");
}
function pause() {
    clearInterval(currentMilSecInterval);
    clearInterval(lrcInterval);
}

menus.addMenuItems("主页", {
    L: k => {
        tts(lastStatusBarText);
    },
});

module.exports = { showLyric, hideLyric, pause };

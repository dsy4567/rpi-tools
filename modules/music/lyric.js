"use strict";

const clrc = require("clrc");

const config = require("../config");
const ncm = require("./ncm");
const tts = require("../tts").tts;
const menus = require("../menus");
const { logger } = require("../utils");
const { log, error, warn } = logger("歌词");

let /** @type {NodeJS.Timeout} */ lrcInterval,
    /** @type {NodeJS.Timeout} */ currentMilSecInterval,
    currentId = 0,
    currentLrcText = "",
    currentTLrcText = "";

async function showLyric(id, currentSecOffset = 0, getCurrentSec) {
    try {
        if (!config.showLyric) {
            return hideLyric();
        }

        menus.getMenuState() !== "input" && menus.statusBar.setText("");

        let lrcText = "",
            tLrcText = "";
        if (currentId == id && currentLrcText) {
            lrcText = currentLrcText;
            tLrcText = currentTLrcText;
        } else {
            const result = await ncm.getLyricText(id);
            currentId = id;
            currentLrcText = lrcText = result.lyric;
            currentTLrcText = tLrcText = result.tLyric;
        }
        if (!lrcText)
            return (
                menus.getMenuState() !== "input" && menus.statusBar.setText("")
            );
        if (!tLrcText) tLrcText = "";

        let lrc = clrc.parse(lrcText),
            tLrc = clrc.parse(tLrcText),
            currentMilSec = 0;

        pause();
        if (!lrc[0])
            return (
                menus.getMenuState() !== "input" && menus.statusBar.setText("")
            );

        let D = new Date(),
            lastText = "";
        lrcInterval = setInterval(async () => {
            try {
                let /** @type {ReturnType<import("clrc").parse>[0]} */ l,
                    /** @type {ReturnType<import("clrc").parse>[0]} */ tL;
                currentMilSec = new Date() - D + currentSecOffset;
                for (let i = 0; i < lrc.length; i++) {
                    l = lrc[i];

                    if (l.type !== "lyric") continue;
                    if (
                        l.type === "lyric" &&
                        currentMilSec >= l.startMillisecond
                    )
                        if (
                            currentMilSec <=
                                (lrc[i + 1]?.startMillisecond ||
                                    1145141919810) &&
                            l.startMillisecond !==
                                lrc[i + 1]?.startMillisecond &&
                            lrc[i + 1]?.type === "lyric"
                        )
                            break;
                        else continue;
                    else continue;
                }
                for (let i = 0; i < tLrc.length; i++) {
                    tL = tLrc[i];

                    if (tL.type !== "lyric") continue;
                    if (
                        tL.type === "lyric" &&
                        currentMilSec >= tL.startMillisecond
                    )
                        if (
                            currentMilSec <=
                                (tLrc[i + 1]?.startMillisecond ||
                                    1145141919810) &&
                            tLrc[i]?.startMillisecond !==
                                tLrc[i + 1]?.startMillisecond
                        )
                            break;
                        else continue;
                    else continue;
                }
                const lText = l?.content || "",
                    tLText = tL?.content || "";
                const text = `🎵 ${lText} ${tLText ? "📕 " + tLText : ""}`;
                lastText != text &&
                    menus.getMenuState() !== "input" &&
                    menus.statusBar.setText((lastText = text));
            } catch (e) {
                error(e);
                hideLyric();
            }
        }, 200);
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
        menus.addMenuItems("主页", {
            "_lyric.print": k => {
                tts(lastText);
            },
        });
    } catch (e) {
        error("无法展示歌词", e);
    }
}
function hideLyric() {
    clearInterval(lrcInterval);
    clearInterval(currentMilSecInterval);
    currentId = 0;
    currentLrcText = "";
    currentTLrcText = "";
    menus.getMenuState() !== "input" && menus.statusBar.setText("");
}
function pause() {
    clearInterval(currentMilSecInterval);
    clearInterval(lrcInterval);
}

module.exports = { showLyric, hideLyric, pause };

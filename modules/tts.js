"use strict";

const cp = require("child_process");

const { TTSEspeakLanguage } = require("./config");
const { logger } = require("./utils");
const { log, error } = logger("TTS");

let /** @type {cp.ChildProcess} */ p,
    /** @type {NodeJS.Timeout} */ timeout,
    speaking = false,
    lastText = "";
const replacement = {
    点: ".",
    ".$&": /[0-9]+/g,
    月正: "乐正", // le4 -> yue4
};

function tts(/** @type {String} */ t, echo = true) {
    if (!t) return t;
    echo && log(t);
    lastText = t;
    Object.entries(replacement).forEach(([replace, search]) => {
        t = t.replaceAll(search, replace);
    });
    clearTimeout(timeout);
    timeout = setTimeout(() => {
        try {
            p && p.kill();
            p = cp.execFile("espeak", ["-v", TTSEspeakLanguage || "zh", t]);
        } catch (e) {
            error(e);
        }
    }, 50);
    return t;
}

module.exports = {
    tts,
    speakLastText() {
        tts(lastText);
    },
    isSpeaking() {
        return p?.exitCode === null;
    },
};

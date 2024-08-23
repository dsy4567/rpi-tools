"use strict";

const cp = require("child_process");

const { TTSEspeakLanguage } = require("./config");
const { logger } = require("./utils");
const { log, error } = logger("TTS");

let /** @type {cp.ChildProcess} */ p, /** @type {NodeJS.Timeout} */ timeout;

module.exports = {
    tts(/** @type {String} */ t) {
        if (!t) return t;
        clearTimeout(timeout);
        timeout = setTimeout(() => {
            log((t = t.replaceAll(/[0-9]+/g, ".$&")));
            try {
                p && p.kill();
                p = cp.execFile("espeak", ["-v", TTSEspeakLanguage || "zh", t]);
            } catch (e) {
                error(e);
            }
        }, 100);
        return t;
    },
};

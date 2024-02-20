const cp = require("child_process");

let /** @type {cp.ChildProcess} */ p;

module.exports = {
    tts(/** @type {String} */ t) {
        console.log(t);
        try {
            p && p.kill("SIGKILL");
            p = cp.execFile("espeak", ["-v", "zh", t]);
        } catch (e) {
            console.error(e);
        }
    },
};

const cp = require("child_process");
const { escape } = require("./utils");

module.exports = {
    tts(/** @type {String} */ t) {
        console.log(t);
        try {
            cp.execSync(`espeak -v zh ${escape(t)}`);
        } catch (e) {}
    },
};

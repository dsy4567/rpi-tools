const cp = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { setVol } = require("./modules/vol");
const { enableShuffle, switchPlaylist, mocp } = require("./modules/music");

function init() {
    try {
        cp.execSync("kill -9 $(cat .moc/pid)");
    } catch (e) {}
    try {
        cp.execSync("rm ~/.moc/pid");
    } catch (e) {}
    mocp("-S");
    switchPlaylist("喜欢");
    setVol();
    enableShuffle();
    mocp("-f");
}

const p = path.join(os.homedir(), ".rpitools_noinit.qwq");
if (
    process.argv.includes("noinit") ||
    (fs.existsSync(p) && (fs.rmSync(p) || true))
)
    console.log("noinit");
else init();

// try {
//     cp.execSync("sudo cpufreq-set -g powersave");
// } catch (e) {
//     console.error(e);
// }

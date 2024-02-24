const fs = require("fs");
const os = require("os");
const path = require("path");

// require("./modules/menus");
const { enableShuffle, switchPlaylist, mocp } = require("./modules/music");
const { setVol } = require("./modules/vol");

function init() {
    mocp("-S");
    switchPlaylist();
    setVol();
    enableShuffle();
    mocp("-f");
}

const p = path.join(os.homedir(), ".rpitools_noinit");
if (process.argv.includes("noinit") || (fs.existsSync(p) && (fs.rmSync(p) || true)))
    console.log("noinit");
else init();

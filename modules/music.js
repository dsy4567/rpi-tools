const axios = require("axios").default;
const cp = require("child_process");
const fs = require("fs");
const jsonfile = require("jsonfile");
const ncm = require("NeteaseCloudMusicApi");
const os = require("os");
const path = require("path");
const Player = require("@jellybrick/mpris-service");

const menus = require("./menus");
const { escape } = require("./utils");
const { setVol } = require("./vol");
const tts = require("./tts").tts;

const /** @type {jsonfile.JFWriteOptions} */ jsonfileOptions = { spaces: 2 };

function switchPlaylist(pl = "默认") {
    if (!isNaN(+pl)) {
        pl = Object.keys(playlist)[+pl];
    }
    if (!playlist[pl] || pl == "默认") {
        mocp("-c");
        mocp("-a", path.join(os.homedir(), "Music"));
        mocp("-p");
        return;
    }
    let s = "",
        p = path.join(os.homedir(), "Music/temp.pls");
    playlist[(currentPlaylist = pl)].items.forEach(i => {
        s += i.path + "\n";
    });
    fs.writeFileSync(p, s);
    mocp("-c");
    mocp("-a", p);
    mocp("-p");
}
function init() {
    mocp("-S");
    switchPlaylist();
    setVol();
    enableShuffle();
    mocp("-f");
}
function mocp(...arg) {
    try {
        cp.execFileSync("mocp", arg);
    } catch (e) {
        console.error(e);
    }
}
function enableShuffle() {
    tts("随机播放");
    mocp("--on=shuffle");
    mocp("--on=repeat");
    mocp("--on=autonext");
}
function enableAutoNext() {
    tts("顺序播放");
    mocp("--off=shuffle");
    mocp("--on=repeat");
    mocp("--on=autonext");
}
function enableRepeat() {
    tts("单曲循环");
    mocp("--off=shuffle");
    mocp("--on=repeat");
    mocp("--off=autonext");
}
function updatePlaylist() {
    try {
        jsonfile.writeFileSync(p, playlist, jsonfileOptions);
    } catch (e) {
        console.error(e);
        tts("无法更新播放列表");
    }
}
async function getCurrentMusic() {
    const c = cp.execSync("mocp -i");
    const p = c
        .toString()
        .match(/File: (.+)/gi)[0]
        .replace("File: ", "");
    return { path: p, id: +path.parse(p).name.split("-")[0] };
}
async function checkLoginStatus() {
    if (logged)
        return {
            logged,
            uid,
        };
    try {
        const p = (await ncm.login_status({ cookie })).body.data.profile;
        if (p) {
            logged = true;
            uid = p.userId;
        } else throw new Error("Not logged");
        return {
            logged,
            uid,
        };
    } catch (e) {
        console.error(e);
        logged = false;
        uid = -1;
        return {
            logged,
            uid,
        };
    }
}
async function downloadPlaylist(/** 0: daily */ pid, intelligence) {
    await checkLoginStatus();
    let j;
    if (pid == 0 && logged) {
        // 日推 需要登录
        j = ncm.recommend_songs({ cookie });
    } else if (pid > 0 && !intelligence)
        // 歌单 非心动模式 无需登录
        j = ncm.playlist_track_all({ id: pid, cookie, limit: 300 });
    else if (pid > 0 && intelligence && logged)
        // 歌单 心动模式 需要登录
        j = ncm.playmode_intelligence_list({
            cookie,
            pid,
            id: (
                await ncm.playlist_track_all({
                    id: pid,
                    cookie,
                    limit: 1,
                })
            ).body.songs[0].id,
        });
    else throw new Error("Not logged/Invalid args");

    const name =
        (intelligence ? "心动模式-" : "") +
        (pid == 0
            ? "日推"
            : `${(await ncm.playlist_detail({ id: pid, cookie })).body.playlist.name}-${pid}`);
    let ids = [];
    j = await j;
    (pid == 0 ? j.body.data.dailySongs : intelligence ? j.body.data : j.body.songs).forEach(m => {
        ids.push(intelligence ? m.songInfo.id : m.id);
    });

    let l = (await ncm.song_detail({ ids: ids.join(",") })).body.songs;
    downloading = true;
    playlist[name] = { id: pid, items: [] };
    updatePlaylist();
    for (m of l) {
        if (!downloading) return;

        console.log("downloading:", m.id, m.name);
        let n = path.join(
            os.homedir(),
            `Music/` +
                `${m.id}-${(() => {
                    let ars = [];
                    m.ar.forEach(a => {
                        ars.push(a.name);
                    });
                    return ars.join("、");
                })()}-${m.name}.mp3`.replaceAll(/[\(\)'"\\\&\%\$\#\[\]\{\}\*\/ ]/g, "-")
        );
        try {
            if (fs.existsSync(n)) {
                playlist[name].items.push({ id: m.id, path: n });
                updatePlaylist();
                continue;
            }
            if (m.fee == 4 || m.fee == 1) {
                console.log("vip only:", m.name);
                continue;
            }
        } catch (e) {
            console.error(e);
            continue;
        }

        let u, co;
        while (1) {
            const f = async () => {
                u = await ncm.song_url_v1({ id: m.id, level: "higher" });
                u = u.body.data[0].url;
                if (!u) return true;
            };
            const sleep = async () =>
                new Promise((resolve, reject) => {
                    setTimeout(() => {
                        resolve();
                    }, 5 * 60 * 1000);
                });
            try {
                co = await f();
                break;
            } catch (e) {
                console.error("下载失败，5 分钟后重试 ", u.body, " ", e);
                tts("下载失败，5 分钟后重试");
                await sleep();
            }
        }
        if (co) continue;

        let d = await axios.get(u, { responseType: "arraybuffer" });

        try {
            fs.writeFileSync(n, d.data);
            playlist[name].items.push({ id: m.id, path: n });
            if (currentPlaylist == name || currentPlaylist == "默认") mocp("-a", escape(n));
            updatePlaylist();
        } catch (e) {
            console.error(e);
        }
        console.log(n);
    }
    tts("下载完成" + name);
    downloading = false;
}

let downloading = false;

const mp = cp.exec("mpris-proxy");
const player = new Player({
    name: "rpitools",
    identity: "rpitools",
    supportedUriSchemes: ["file"],
    supportedMimeTypes: ["audio/mpeg", "application/ogg"],
    supportedInterfaces: ["player"],
});
[
    "raise",
    "quit",
    "next",
    "previous",
    "pause",
    "playpause",
    "stop",
    "play",
    "seek",
    "position",
    "open",
    "volume",
    "loopStatus",
    "shuffle",
].forEach(ev => {
    player.on(ev, () => {
        switch (ev) {
            case "play":
            case "pause":
                mocp("-G");
                break;
            case "next":
                mocp("-f");
                break;
            case "previous":
                mocp("-r");
                break;

            default:
                break;
        }
    });
});

let selectedPlaylistIndex = 0,
    currentPlaylist = "默认";

menus.addMenuItems("播放列表", {
    b: k => {
        const p = Object.keys(playlist);
        if (--selectedPlaylistIndex < 0) selectedPlaylistIndex = p.length - 1;
        tts(p[selectedPlaylistIndex]);
    },
    n: k => {
        const p = Object.keys(playlist);
        if (++selectedPlaylistIndex >= p.length) selectedPlaylistIndex = 0;
        tts(p[selectedPlaylistIndex]);
    },
    "\r": k => {
        const p = Object.keys(playlist);
        switchPlaylist(p[selectedPlaylistIndex]);
        menus.popMenuState();
    },
});
menus.addMenuItems("主菜单", {
    l: async k => {
        try {
            const c = await getCurrentMusic(),
                like = false;
            let i,
                p = (await menus.input("最喜欢")) == "y" ? "最喜欢" : "喜欢";
            for (i = 0; i < playlist[p].length; i++) {
                const m = playlist[p][i];
                if (m.id == c.id) {
                    like = true;
                    break;
                }
            }
            if (!like) {
                playlist[p].items.push(c);
                playlist[p].items = [...new Set(playlist[p].items)];
                tts("已添加到喜欢");
            } else {
                playlist[p].items.splice(i, 1);
                tts("已从喜欢移除");
            }
            updatePlaylist();
        } catch (e) {}
    },
    D: async k => {
        if (downloading) {
            downloading = false;
            return tts("已取消下载");
        }
        const id = +(await menus.input("id")),
            intelligence = (await menus.input("心动模式")) == "y";
        try {
            await downloadPlaylist(id, intelligence);
        } catch (e) {
            console.error(e);
            tts("下载失败");
        }
    },
    i: async k => {
        try {
            tts(path.parse((await getCurrentMusic()).path).name);
        } catch (e) {}
    },
    I: k => {
        init();
    },
    P: k => {
        menus.pushMenuState("播放列表");
    },
    R: k => {
        enableRepeat();
    },
    S: k => {
        enableShuffle();
    },
    N: k => {
        enableAutoNext();
    },
    b: k => {
        // back
        mocp("-r");
    },
    n: k => {
        // next
        mocp("-f");
    },
    " ": k => {
        // pause & play
        mocp("-G");
    },
    // 默认
    0: k => {
        switchPlaylist(k);
    },
    // 喜欢
    1: k => {
        switchPlaylist(k);
    },
    // 最喜欢
    2: k => {
        switchPlaylist(k);
    },
    // 日推
    3: k => {
        switchPlaylist(k);
    },
    4: k => {
        switchPlaylist(k);
    },
    5: k => {
        switchPlaylist(k);
    },
    6: k => {
        switchPlaylist(k);
    },
    7: k => {
        switchPlaylist(k);
    },
    8: k => {
        switchPlaylist(k);
    },
    9: k => {
        switchPlaylist(k);
    },
});

const p = path.join(os.homedir(), "Music/playlist.json");
let /** @type {Record<String, { id: Number, items: {path: String, id: Number}[]}>} */ playlist;

let cookie;
try {
    cookie = fs.readFileSync(path.join(__dirname, "../cookie.txt")).toString();
} catch (e) {
    cookie = "";
}
let logged = false,
    uid = -1;

if (fs.existsSync(p)) playlist = jsonfile.readFileSync(p);
else {
    fs.mkdirSync(path.parse(p).dir, { recursive: true });
    playlist = {
        默认: {
            id: null,
            items: [],
        },
        喜欢: {
            id: null,
            items: [],
        },
        最喜欢: {
            id: null,
            items: [],
        },
        日推: {
            id: null,
            items: [],
        },
    };
    jsonfile.writeFileSync(p, playlist, jsonfileOptions);
}

module.exports = { enableAutoNext, enableRepeat, enableShuffle, mocp, switchPlaylist };

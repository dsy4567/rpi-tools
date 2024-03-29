const axios = require("axios").default;
const cp = require("child_process");
const fs = require("fs");
const jsonfile = require("jsonfile");
const ncm = require("NeteaseCloudMusicApi");
const os = require("os");
const path = require("path");
const Player = require("@jellybrick/mpris-service");

const menus = require("./menus");
const { setVol } = require("./vol");
const { ncmStatusCheck, sleep, input, chooseItem } = require("./utils");
const tts = require("./tts").tts;

const /** @type {jsonfile.JFWriteOptions} */ jsonfileOptions = { spaces: 2 };

async function switchPlaylist(pl = "默认") {
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
        jsonfile.writeFileSync(playlistPath, playlist, jsonfileOptions);
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
async function downloadSong(id) {
    const l = (await ncm.song_detail({ ids: "" + id })).body;
    console.log(l);
    const m = l.songs[0];
    let n;
    if (
        !(await (async () => {
            try {
                console.log("downloading:", m.id, m.name);
                n = path.join(
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
                if (fs.existsSync(n)) {
                    return true;
                }
                if (m.fee == 4 || m.fee == 1) {
                    tts("vip 音乐");
                    return false;
                }

                let resp = await ncm.song_url_v1({ id: m.id, level: "higher" });
                console.log(resp);
                let d = await axios.get(resp.body.data[0].url, { responseType: "arraybuffer" });

                fs.writeFileSync(n, d.data);
            } catch (e) {
                console.error(e);
                return false;
            }
            console.log(n);
        })())
    )
        tts("失败");
    else {
        mocp("-l", n);
    }
}
async function downloadPlaylist(/** 0: daily */ pid, intelligence) {
    if (pid === undefined || pid === null) return;
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

            try {
                co = await f();
                break;
            } catch (e) {
                console.error("下载失败，5 分钟后重试 ", u.body, " ", e);
                tts("下载失败，5 分钟后重试");
                await sleep(5 * 60 * 1000);
            }
        }
        if (co) continue;

        let d = await axios.get(u, { responseType: "arraybuffer" });

        try {
            fs.writeFileSync(n, d.data);
            playlist[name].items.push({ id: m.id, path: n });
            // if (currentPlaylist == name || currentPlaylist == "默认") mocp("-a", p);
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
            const c = await getCurrentMusic();
            let i,
                p = (await input("最喜欢")) == "y" ? "最喜欢" : "喜欢",
                like = false;
            for (i = 0; i < playlist[p].items.length; i++) {
                const m = playlist[p].items[i];
                if (m.id == c.id) {
                    like = true;
                    break;
                }
            }
            const add2likeOnline = () => {
                const p = path.join(__dirname, "../wait2add2like.txt");
                ncmStatusCheck(
                    ncm.like({
                        id: c.id,
                        cookie,
                        like: "" + !like,
                        r: "" + Math.random(),
                    })
                )
                    .then(d => {
                        try {
                            fs.existsSync(p) &&
                                fs
                                    .readFileSync(p)
                                    .toString()
                                    .split(",")
                                    .forEach(async s => {
                                        s = s.replace(/[\n\r ]/gi, "");
                                        if (!s) return;
                                        const [op, id] = s.split(":"),
                                            like = op == "rm" ? "false" : "true";
                                        console.log(op, like, id);

                                        try {
                                            await ncmStatusCheck(
                                                ncm.like({
                                                    id,
                                                    cookie,
                                                    like,
                                                    r: "" + Math.random(),
                                                })
                                            );
                                        } catch (e) {
                                            console.error(e);
                                            tts("无法添加到网易云账号内的喜欢");
                                        }
                                    });
                            tts("已添加/移除网易云账号内的喜欢");
                            fs.writeFileSync(p, "");
                        } catch (e) {
                            console.error(e);
                        }
                    })
                    .catch(e => {
                        console.error(e);
                        try {
                            fs.appendFileSync(p, `${!like ? "add" : "rm"}:${c.id},`);
                        } catch (e) {
                            console.error(e);
                        }
                    });
            };
            if (!like) {
                playlist[p].items.push(c);
                playlist[p].items = [...new Set(playlist[p].items)];
                p == "喜欢" && add2likeOnline();
                tts(`已添加到${p}`);
            } else {
                playlist[p].items.splice(i, 1);
                p == "喜欢" && add2likeOnline();
                tts(`已从${p}移除`);
            }
            updatePlaylist();
        } catch (e) {
            console.error(e);
        }
    },
    D: async k => {
        if (downloading) {
            downloading = false;
            return tts("已取消下载");
        }
        const id = +(await input("id")),
            intelligence = (await input("心动模式")) == "y";
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
    s: async k => {
        if (!(await checkLoginStatus()).logged) tts("未登录");
        const kwd = await input("搜索词");
        if (!kwd) return;
        ncmStatusCheck(
            await ncm.search({
                keywords: kwd,
                cookie,
                type: "1018",
            })
        )
            .then(async resp => {
                const songs = resp.body.result.song.songs || [],
                    playLists = resp.body.result.playList.playLists || [];
                let /** @type {Record<String, {id: Number}} */ items = {};
                if ((await input("1 单曲 2 歌单")) == "2") {
                    playLists.forEach(item => {
                        items[`${item.name} id ${item.id}`] = item.id;
                    });
                    const keys = Object.keys(items);
                    downloadPlaylist(items[await chooseItem(keys[0], keys)]);
                } else {
                    songs.forEach(item => {
                        items[
                            `${item.name} 由 ${(() => {
                                let ars = [];
                                item.ar.forEach(a => ars.push(a.name));
                                return ars.join(" ");
                            })()} 演唱 id ${item.id}`
                        ] = item.id;
                    });
                    const keys = Object.keys(items);
                    downloadSong(items[await chooseItem(keys[0], keys)]);
                }
            })
            .catch(e => {
                console.error(e);
                tts("搜索失败");
            });
    },
    I: k => {
        init();
    },
    U: async k => {
        let items = {};

        downloadPlaylist(playlist[await chooseItem("更新播放列表", Object.keys(playlist))].id);
    },
    p: async k => {
        switchPlaylist(await chooseItem("选择播放列表", Object.keys(playlist)));
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

const playlistPath = path.join(os.homedir(), "Music/playlist.json");
let /** @type {Record<String, { id: Number, items: {path: String, id: Number}[]}>} */ playlist;

let cookie;
try {
    cookie = fs.readFileSync(path.join(__dirname, "../cookie.txt")).toString();
} catch (e) {
    cookie = "";
}
let logged = false,
    uid = -1;

if (fs.existsSync(playlistPath)) playlist = jsonfile.readFileSync(playlistPath);
else {
    fs.mkdirSync(path.parse(playlistPath).dir, { recursive: true });
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
    jsonfile.writeFileSync(playlistPath, playlist, jsonfileOptions);
}
checkLoginStatus();

module.exports = {
    enableAutoNext,
    enableRepeat,
    enableShuffle,
    mocp,
    switchPlaylist,
};

const axios = require("axios").default;
const cp = require("child_process");
const fs = require("fs");
const jsonfile = require("jsonfile");
const ncm = require("NeteaseCloudMusicApi");
const os = require("os");
const path = require("path");

const { setVol } = require("./vol");
const { sleep, input, chooseItem } = require("./utils");
const tts = require("./tts").tts;

const /** @type {jsonfile.JFWriteOptions} */ jsonfileOptions = { spaces: 2 },
    downloadSongWithCookie = true;

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
    return;
    try {
        cp.execSync("kill -9 $(cat .moc/pid)");
    } catch (e) {}
    try {
        fs.rmSync(path.join(os.homedir(), ".moc/pid"));
    } catch (e) {}
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
function getMocStatus() {
    const c = cp.execFileSync("mocp", [
        "-Q",
        "%state |Qwq| %file |Qwq| %ts |Qwq| %cs",
    ]);
    const s = c.toString().split(" |Qwq| ");
    let fileName = path.parse(s[1]).name,
        /** @type {String} */ songName = fileName.split("-");
    songName[0] = "";
    songName = songName.join(" ");
    return {
        playing: s[0] == "PLAY",
        path: "" + s[1],
        id: +fileName.split("-")[0],
        songName,
        totalSec: +s[2],
        currentSec: +s[3],
    };
}
async function ncmStatusCheck(/** @type {Promise<ncm.Response>} */ res) {
    const resp = await res;
    if ((resp.body.code === 200) | (resp.body.status === 200)) return resp;
    console.error(resp);
    throw new Error(resp);
}
async function checkLoginStatus() {
    if (logged)
        return {
            logged,
            uid,
            likePlaylistId,
        };
    try {
        const p = (await ncm.login_status({ cookie })).body.data.profile;
        if (p) {
            logged = true;
            uid = p.userId;
            if (uid) {
                try {
                    likePlaylistId = (
                        await ncmStatusCheck(
                            ncm.user_playlist({ uid, cookie, limit: 1 })
                        )
                    ).body.playlist[0].id;
                } catch (e) {
                    console.error(e);
                }
            }
        } else throw new Error("Not logged");
        console.log({
            logged,
            uid,
            likePlaylistId,
        });
        return {
            logged,
            uid,
            likePlaylistId,
        };
    } catch (e) {
        console.error(e);
        logged = false;
        uid = null;
        return {
            logged,
            uid,
            likePlaylistId,
        };
    }
}
async function downloadSong(id) {
    const l = (await ncm.song_detail({ ids: "" + id })).body;
    console.log(l);
    const m = l.songs[0];
    let musicPath, reason;
    if (
        typeof (reason = await (async () => {
            try {
                console.log("downloading:", m.id, m.name);
                musicPath = path.join(
                    os.homedir(),
                    `Music/` +
                        `${m.id}-${(() => {
                            let ars = [];
                            m.ar.forEach(a => {
                                ars.push(a.name);
                            });
                            return ars.join("、");
                        })()}-${m.name}.mp3`.replaceAll(
                            /[\(\)'"\\\&\%\$\#\[\]\{\}\*\/ ]/g,
                            "-"
                        )
                );
                if (fs.existsSync(musicPath)) {
                    return true;
                }
                if (m.fee == 4 || m.fee == 1) {
                    return "失败: vip 音乐";
                }

                let resp = await ncm.song_url_v1({
                    id: m.id,
                    level: "higher",
                    cookie: downloadSongWithCookie ? cookie : undefined,
                });
                console.log(resp);
                let d = await axios.get(resp.body.data[0].url, {
                    responseType: "arraybuffer",
                });

                fs.writeFileSync(musicPath, d.data);
            } catch (e) {
                console.error(e);
                return "失败: 其他错误";
            }
            console.log(musicPath);
        })()) === "string"
    )
        tts(reason);
    else {
        mocp("-l", musicPath);
    }
}
async function downloadPlaylist(/** 0: daily */ pid, intelligence) {
    if (downloading) return tts("已有正在进行的下载任务");
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
            : `${
                  (await ncm.playlist_detail({ id: pid, cookie })).body.playlist
                      .name
              }-${pid}`);
    let ids = [];
    j = await j;
    (pid == 0
        ? j.body.data.dailySongs
        : intelligence
        ? j.body.data
        : j.body.songs
    ).forEach(m => {
        ids.push(intelligence ? m.songInfo.id : m.id);
    });

    let l = (await ncm.song_detail({ ids: ids.join(",") })).body.songs;
    downloading = true;
    playlist[name] = { id: pid, items: [] };
    updatePlaylist();
    for (m of l) {
        if (!downloading) return;

        console.log("正在下载:", m.id, m.name);
        let n = path.join(
            os.homedir(),
            `Music/` +
                `${m.id}-${(() => {
                    let ars = [];
                    m.ar.forEach(a => {
                        ars.push(a.name);
                    });
                    return ars.join("、");
                })()}-${m.name}.mp3`.replaceAll(
                    /[\(\)'"\\\&\%\$\#\[\]\{\}\*\/ ]/g,
                    "-"
                )
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

        let resp, u, co;
        while (1) {
            const f = async () => {
                await sleep(3000);
                resp = await ncm.song_url_v1({
                    id: m.id,
                    level: "higher",
                    cookie: downloadSongWithCookie ? cookie : undefined,
                });
                console.log(resp);
                u = resp.body.data[0].url;
                if (!u) return true;
            };

            try {
                co = await f();
                break;
            } catch (e) {
                if (!downloading) {
                    co = true;
                    break;
                }
                console.error("下载失败，5 分钟后重试 ", resp.body, " ", e);
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

const playlistPath = path.join(os.homedir(), "Music/playlist.json");
let downloading = false;
let /** @type {Record<String, { id: Number, items: {path: String, id: Number}[]}>} */ playlist;

let cookie = "",
    cookie_MUSIC_U;
try {
    cookie_MUSIC_U = fs
        .readFileSync(path.join(__dirname, "../cookie.txt"))
        .toString()
        .trim();
} catch (e) {
    cookie_MUSIC_U = "";
}
cookie = cookie_MUSIC_U;
let logged = false,
    uid = -1,
    likePlaylistId = null;

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
            id: 0,
            items: [],
        },
    };
    jsonfile.writeFileSync(playlistPath, playlist, jsonfileOptions);
}
checkLoginStatus();

let selectedPlaylistIndex = 0,
    currentPlaylist = "默认",
    /** @type {ReturnType<getMocStatus>} */ currentMusic = null,
    lastCurrentSec = 0;

setInterval(async () => {
    try {
        const c = getMocStatus();
        if (currentMusic?.id !== c.id) {
            console.log(currentMusic, c);
            currentMusic &&
                (await ncm.scrobble({
                    id: currentMusic.id,
                    sourceid: playlist[currentPlaylist]?.id,
                    time: lastCurrentSec,
                    cookie,
                    r: "" + Math.random(),
                }));
            currentMusic = c;
        } else {
            lastCurrentSec = c.currentSec;
        }
    } catch (e) {
        console.error(e);
    }
}, 5000);

module.exports = {
    enableAutoNext,
    enableRepeat,
    enableShuffle,
    getMocStatus,
    mocp,
    switchPlaylist,
};

const menus = require("./menus");

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
            const c = getMocStatus();
            let i = -1,
                p,
                like;
            switch (
                await chooseItem("喜欢", [
                    "添加到喜欢",
                    "添加到最喜欢",
                    "从喜欢移除",
                    "从最喜欢移除",
                ])
            ) {
                case "添加到喜欢":
                    p = "喜欢";
                    like = true;
                    break;
                case "添加到最喜欢":
                    p = "最喜欢";
                    like = true;
                    break;
                case "从喜欢移除":
                    p = "喜欢";
                    like = false;
                    break;
                case "从最喜欢移除":
                    p = "最喜欢";
                    like = false;
                    break;
                default:
                    return;
            }
            for (i = 0; i < playlist[p].items.length; i++) {
                const m = playlist[p].items[i];
                if (m.id == c.id) break;
            }
            const add2likeOnline = () => {
                const p = path.join(__dirname, "../wait2add2like.json");
                ncmStatusCheck(
                    ncm.like({
                        id: c.id,
                        cookie,
                        like: "" + like,
                        r: "" + Math.random(),
                    })
                )
                    .then(async d => {
                        try {
                            if (!likePlaylistId) return;
                            if (!fs.existsSync(p)) {
                                jsonfile.writeFileSync(
                                    p,
                                    { add: [], remove: [] },
                                    jsonfileOptions
                                );
                            }
                            let /** @type {{add: Number[], remove: Number[]}} */ j =
                                    jsonfile.readFileSync(p);
                            try {
                                const add = j.add.join(","),
                                    remove = j.remove.join(",");
                                add &&
                                    (await ncmStatusCheck(
                                        ncm.playlist_tracks({
                                            pid: likePlaylistId,
                                            tracks: add,
                                            op: "add",
                                            cookie,
                                            r: "" + Math.random(),
                                        })
                                    ));
                                remove &&
                                    (await ncmStatusCheck(
                                        ncm.playlist_tracks({
                                            pid: likePlaylistId,
                                            tracks: remove,
                                            op: "del",
                                            cookie,
                                            r: "" + Math.random(),
                                        })
                                    ));
                            } catch (e) {
                                console.error(e);
                                return tts("无法添加到网易云账号内的喜欢");
                            }

                            tts("已同步网易云账号内的喜欢");
                            jsonfile.writeFile(
                                p,
                                { add: [], remove: [] },
                                jsonfileOptions
                            );
                        } catch (e) {
                            console.error(e);
                        }
                    })
                    .catch(e => {
                        console.error(e);
                        try {
                            let j = jsonfile.readFileSync(p);
                            if (like) {
                                j.remove.includes(c.id) &&
                                    j.remove.splice(j.remove.indexOf(), 1);
                                j.add.push(c.id);
                            } else {
                                j.add.includes(c.id) &&
                                    j.add.splice(j.remove.indexOf(), 1);
                                j.remove.push(c.id);
                            }
                            jsonfile.writeFile(p, j, jsonfileOptions);
                        } catch (e) {
                            console.error(e);
                        }
                    });
            };
            if (like) {
                i != -1 && playlist[p].items.push(c);
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
            tts(path.parse(getMocStatus().path).name);
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
                    downloadPlaylist(
                        items[await chooseItem("歌单搜索结果", keys)]
                    );
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
                    downloadSong(items[await chooseItem("单曲搜索结果", keys)]);
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

        downloadPlaylist(
            playlist[await chooseItem("更新播放列表", Object.keys(playlist))].id
        );
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

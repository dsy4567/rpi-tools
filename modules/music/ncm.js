"use strict";

let /** @type { import("axios") } */ axios;
const { EventEmitter } = require("events");
const fs = require("graceful-fs");
const jsonfile = require("jsonfile");
let /** @type { import("NeteaseCloudMusicApi") } */ ncmApi;
const path = require("path");
const sf = require("sanitize-filename");

const { chooseItem, input, addMenuItems } = require("../menus");
const { sleep, logger, appRootPath } = require("../utils");
const { log, error, warn } = logger("网易云音乐");
const tts = require("../tts").tts;

const {
    jsonfileOptions,
    ncmDownloadSongWithCookie,
    writeFileOptions,
    ncmRetryTimeout,
} = require("../config");

async function initNcmApi() {
    if (!ncmApi) {
        ncmApi = require("NeteaseCloudMusicApi");
        axios = require("axios").default;
        log("网易云音乐 API 已加载");
        await login();
    }
}
async function ncmStatusCheck(
    /** @type {Promise<import("NeteaseCloudMusicApi").Response>} */ res
) {
    await initNcmApi();
    const resp = await res;
    if (resp.body.code === 200 || resp.body.status === 200) return resp;
    throw new Error("" + resp);
}
async function login(clear = false) {
    if (clear)
        loginStatus = {
            cookie: "",
            likePlaylistId: null,
            logged: false,
            nickname: null,
            uid: null,
        };
    if (loginStatus.logged) return loginStatus;
    try {
        const cookieFilePath = path.join(
            appRootPath.get(),
            "data/ncmCookie.txt"
        );
        fs.existsSync(cookieFilePath)
            ? (loginStatus.cookie = fs
                  .readFileSync(cookieFilePath)
                  .toString()
                  .trim())
            : fs.writeFile(cookieFilePath, "", writeFileOptions);
        if (!loginStatus.cookie) return warn("未登录");

        const p = (await ncmApi.login_status({ cookie: loginStatus.cookie }))
            .body.data?.profile;
        if (p && p.userId) {
            loginStatus.logged = true;
            loginStatus.uid = p?.userId;
            loginStatus.nickname = p?.nickname || "空用户名";
            try {
                loginStatus.likePlaylistId = (
                    await ncmStatusCheck(
                        ncmApi.user_playlist({
                            uid: loginStatus.uid,
                            cookie: loginStatus.cookie,
                            limit: 1,
                        })
                    )
                ).body.playlist[0].id;
            } catch (e) {
                error("无法获取喜欢列表", e);
            }
        } else throw new Error("未登录或登录已失效");
        log("登录成功", loginStatus.nickname, loginStatus.uid);
        return loginStatus;
    } catch (e) {
        warn("登录失败", e);
        loginStatus = {
            cookie: "",
            likePlaylistId: null,
            logged: false,
            nickname: null,
            uid: null,
        };
        return loginStatus;
    }
}
async function updatePlaylistFile() {
    try {
        await jsonfile.writeFile(playlistPath, playlistFile, jsonfileOptions);
    } catch (e) {
        error(e);
        tts("无法更新播放列表");
    }
}
function getPlaylistFile() {
    return playlistFile;
}
function updateNcmHistory(id, sourceid, currentSec) {
    clearTimeout(historyTimeout);
    historyTimeout = setTimeout(() => {
        initNcmApi().then(() => {
            log("已更新听歌历史", id, sourceid, currentSec);
            if (loginStatus.logged) {
                ncmStatusCheck(
                    ncmApi.scrobble({
                        id,
                        sourceid,
                        time: currentSec,
                        cookie: loginStatus.cookie,
                        r: "" + Math.random(),
                    })
                )
                    .then(() => {})
                    .catch(e => {
                        error("无法更新听歌历史", e);
                    });
            }
        });
    }, 500);
}
function cancelDownloading() {
    downloadList = [];
    downloading = false;
    log(tts("已取消全部下载任务"));
}
async function downloadMV(
    /** @type { Number | String } */ songId,
    /** @type { Number | String } */ mvId,
    /** @type { String } */ musicPath,
    /** @type { (musicPath: string) => void } */ callback
) {
    try {
        if (isNaN((songId = +songId))) return true;
        if (isNaN((mvId = +mvId))) return true;
        log("尝试下载 MV 并转换", path.parse(musicPath).name);

        let r = (
            await ncmApi.mv_detail({ mvid: mvId, cookie: loginStatus.cookie })
        ).body;
        let br = r.data.brs?.[0]?.br;
        if (!br) return true;

        r = (await ncmApi.mv_url({ id: mvId, r: br })).body;
        const u = r.data?.url;
        if (!u) return true;

        const r2 = await axios.get(u, {
            headers: {
                "sec-fetch-site": "cross-site",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                referer: "https://music.163.com/",
                "user-agent":
                    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36",
            },

            responseType: "arraybuffer",
        });
        fs.mkdirSync(path.join(appRootPath.get(), "data/temp/"), {
            recursive: true,
        });

        const p = path.join(
            appRootPath.get(),
            "data/temp/",
            `tempMV-${songId}.mp4`
        );
        fs.writeFileSync(p, r2.data, writeFileOptions);

        await (async () => {
            return new Promise((resolve, reject) => {
                const cp = require("child_process").execFile(
                    "ffmpeg",
                    ["-i", p, "-y", "-vn", "-c:a", "mp3", musicPath],
                    e => {
                        if (e) reject(e);
                        else {
                            resolve();
                            clearTimeout(timeout);
                        }
                    }
                );
                cp.stdout.on("data", d => {
                    log("[ffmpeg stdout]", d);
                });
                cp.stderr.on("data", d => error("[ffmpeg stderr]", d));
                const timeout = setTimeout(() => {
                    reject(new Error("ffmpeg 未在规定时间内退出"));
                    cp.kill(9);
                }, 180000);
            });
        })();
        try {
            fs.rmSync(p, { force: true });
        } catch (e) {}

        callback(musicPath);
        return false;
    } catch (e) {
        error("无法下载 MV", e);
        try {
            fs.rmSync(p, { force: true });
        } catch (e) {}
        return true;
    }
}
async function downloadSong(
    /** @type { String | Number | Number[] | String[] } */ ids,
    playListId = 0,
    playlistName = ""
) {
    await initNcmApi();
    let lastMusicPath = "",
        timeUsed = 0,
        timeWillUseMin = 0,
        timeWillUseText = "",
        failures = [];
    try {
        if (!(typeof ids === "object" ? ids[0] : ids)) return;
        switch (typeof ids) {
            case "object":
                if (Array.isArray(ids)) break;
            case "number":
                ids = [ids];
                break;
            case "string":
                ids = ids.split(",");
                break;

            default:
                return;
        }
        if (downloading) {
            warn(tts("下载仍在继续, 已添加到队列"));
            downloadList.push(ids);
            return;
        }

        log("正在准备下载");
        downloading = true;

        let sd = (
            await ncmApi.song_detail({
                cookie: loginStatus.cookie,
                ids: ids.join(","),
            })
        ).body;

        playlistName &&
            (playlistFile.playlists[playlistName] = playlistFile.playlists[
                playlistName
            ] || {
                name: playlistName,
                pid: playListId,
                songs: ids,
            });

        for (let i = 0; i < sd.songs.length; i++) {
            const D = new Date();
            if (!downloading) {
                break;
            }

            const m = sd.songs[i];
            let musicPath = "",
                /** @type { Boolean | String } */ reason,
                retryCount = -1,
                fileExists = false;
            const artAndName = `${m.ar.map(ar => ar.name).join("、")}-${
                m.name
            }`;
            while (1) {
                if (++retryCount >= 2) {
                    error(tts("重试次数过多，已放弃下载"));
                    failures.push(`${m.id}-${artAndName}`);
                    break;
                }
                reason = await (async () => {
                    try {
                        timeWillUseMin = Math.ceil(
                            (timeUsed * (sd.songs.length - i + 1)) / 1000 / 60
                        );
                        timeWillUseText =
                            "预计总用时: " +
                            (timeUsed == 0
                                ? "计算中"
                                : (timeWillUseMin <= 1
                                      ? "不到 1"
                                      : "大约 " + timeWillUseMin) + " 分钟");
                        log("正在下载:", artAndName, timeWillUseText);
                        musicPath = path.join(
                            appRootPath.get(),
                            `data/musics/`,
                            sf(`${m.id}-${artAndName}.mp3`).replaceAll(" ", "-")
                        );
                        if (
                            fs.existsSync(musicPath) &&
                            playlistFile.songs[m.id]?.errors.length == 0
                        ) {
                            fileExists = true;
                            log(
                                "文件已存在",
                                m.name,
                                (lastMusicPath = musicPath)
                            );
                            return true;
                        }
                        if (m.fee == 1) {
                            warn("vip 音乐");
                            return false;
                        }
                        if (m.fee == 4) {
                            warn("付费专辑");
                            return false;
                        }
                        if (m.noCopyrightRcmd !== null) {
                            warn("无版权");
                            return false;
                        }

                        i >= 1 && (await sleep(3000));
                        let resp = await ncmApi.song_url_v1({
                                id: m.id,
                                level: "standard",
                                cookie: ncmDownloadSongWithCookie
                                    ? loginStatus.cookie
                                    : undefined,
                            }),
                            u = resp.body.data[0].url;
                        if (!u) {
                            for (const p of sd.privileges) {
                                if (p.id == m.id && p.st < 0) {
                                    warn("无版权或其他原因, 无法下载");
                                    return false;
                                }
                            }
                            return "触发反爬、网络不稳定或其他错误";
                        }
                        let d = await axios.get(u, {
                            responseType: "arraybuffer",
                        });
                        fs.writeFileSync(musicPath, d.data, writeFileOptions);
                        lastMusicPath = musicPath;
                        log(
                            `下载成功 (${i + 1}/${sd.songs.length}):`,
                            musicPath
                        );
                        return true;
                    } catch (e) {
                        error("下载失败", e);
                        return "触发反爬、网络不稳定或其他错误";
                    }
                })();

                if (typeof reason === "string") {
                    error(
                        tts(
                            `下载失败, ${ncmRetryTimeout / 1000} 秒后重试: ` +
                                reason
                        )
                    );
                    await sleep(ncmRetryTimeout);
                } else if (
                    reason === false &&
                    m.mv &&
                    (await downloadMV(
                        m.id,
                        m.mv,
                        musicPath,
                        mp => (lastMusicPath = mp)
                    ))
                ) {
                    failures.push(`${m.id}-${artAndName}`);
                    break;
                } else {
                    (i + 1) % 10 == 0 &&
                        tts(
                            `下载成功, 第 ${i + 1} 个, 共 ${
                                sd.songs.length
                            } 个 ` + timeWillUseText
                        );
                    const /** @type {import(".").Song} */ s = {
                            name: m.name,
                            sid: m.id,
                            path: musicPath,
                            errors: [],
                            downloaded: true,
                            artists: m.ar.map(ar => ({
                                name: ar.name,
                                aid: ar.id,
                            })),
                        };
                    playlistFile.songs[m.id] = s;
                    if (playListId && playlistName) {
                        playlistFile.playlists[playlistName]
                            ? playlistFile.playlists[playlistName].songs.push(
                                  s.sid
                              )
                            : (playlistFile.playlists[playlistName] = {
                                  name: playlistName,
                                  pid: playListId,
                                  songs: [m.id],
                              });
                        playlistFile.playlists[playlistName].songs = Array.from(
                            new Set(playlistFile.playlists[playlistName].songs)
                        );
                    }
                    playlistEmitter.emit("update", {
                        song: s,
                        playlist:
                            playListId && playlistName
                                ? playlistFile.playlists[playlistName]
                                : null,
                    });
                    if (!fileExists) timeUsed = new Date() - D;
                    break;
                }
            }
        }

        log(tts(`下载完成, 共 ${failures.length} 首无法下载`));
        failures[0] && warn("无法下载:", failures.join(", "));
    } catch (e) {
        error(tts("下载失败: 无法获取歌曲信息或其他错误"), e);
    }
    downloading = false;
    updatePlaylistFile();
    downloadSong(downloadList.shift());
    return lastMusicPath;
}
async function downloadPlaylist(
    /** -1: 日推, -2: 喜欢, -3: 最喜欢 */ pid,
    intelligence = false
) {
    await initNcmApi();
    if (!pid) return;
    if (intelligence && !loginStatus.logged) {
        return warn(tts("需要登录"));
    }
    let j;
    if (pid == -1) {
        if (!loginStatus.logged) {
            return warn(tts("需要登录"));
        }
        // 日推 需要登录
        j = ncmApi.recommend_songs({
            cookie: loginStatus.cookie,
        });
        intelligence = false;
    } else if (pid == -2) return;
    else if (pid == -3) {
        downloadSong(playlistFile.playlists["最喜欢"].songs);
        return;
    } else if (pid > 0 && !intelligence)
        // 歌单 非心动模式 无需登录
        j = ncmApi.playlist_track_all({
            id: pid,
            cookie: loginStatus.cookie,
            limit: 300,
        });
    else if (pid > 0 && intelligence && loginStatus.logged)
        // 歌单 心动模式 需要登录
        j = ncmApi.playmode_intelligence_list({
            cookie: loginStatus.cookie,
            pid,
            id: (
                await ncmApi.playlist_track_all({
                    id: pid,
                    cookie: loginStatus.cookie,
                    limit: 1,
                })
            ).body.songs[0].id,
        });
    else throw new Error("未登录/非法参数");

    const playlistName =
        (intelligence ? "心动模式-" : "") +
        (pid == -1
            ? "日推"
            : `${
                  (
                      await ncmApi.playlist_detail({
                          id: pid,
                          cookie: loginStatus.cookie,
                      })
                  ).body.playlist.name
              }-${pid}`);
    let /** @type { number[] } */ ids = [];
    j = await j;
    (pid == -1
        ? j.body.data.dailySongs
        : intelligence
        ? j.body.data
        : j.body.songs
    ).forEach(m => {
        ids.push(intelligence ? +m.songInfo.id : +m.id);
    });
    downloadSong(ids, pid, playlistName);
}
function removePlaylist() {
    chooseItem("选择播放列表", Object.keys(getPlaylistFile().playlists))
        .then(v => {
            if (playlistFile.playlists[v].pid <= 0)
                return tts("无法删除内置播放列表");
            delete playlistFile.playlists[v];
            updatePlaylistFile();
            tts("删除成功");
        })
        .catch(e => error(tts("无法删除播放列表"), e));
}
function fixSongs() {
    chooseItem("选择修复项目", [
        "修复损坏音乐",
        "修复未下载音乐",
        "删除 ncmPlaylist.json 中不属于任何播放列表且位于其中的音乐",
        "删除数据文件夹中不位于 ncmPlaylist.json 的音乐",
    ])
        .then(v => {
            const musicDir = path.join(appRootPath.get(), "data/musics/");

            let /** @type { Number[] } */ downloadIds,
                /** @type { Set<Number> } */ removeIds,
                /** @type { Set<Number> } */ reserveIds,
                /** @type { Set<String> } */ removeFileNames;

            switch (v) {
                case "修复损坏音乐":
                    downloadIds = [];
                    Object.values(playlistFile.songs).forEach(
                        s => s.errors.length >= 1 && downloadIds.push(s.sid)
                    );
                    log("downloadIds", downloadIds);
                    break;
                case "修复未下载音乐":
                    downloadIds = [];
                    let allFileNames = new Set(fs.readdirSync(musicDir));
                    Object.values(playlistFile.songs).forEach(
                        s =>
                            (!s.downloaded ||
                                !allFileNames.has(path.parse(s.path).base)) &&
                            downloadIds.push(s.sid)
                    );
                    log("downloadIds", downloadIds);
                    break;
                case "删除 ncmPlaylist.json 中不属于任何播放列表且位于其中的音乐":
                    let AllIds = new Set(
                            Object.keys(playlistFile.songs).map(v => +v)
                        ),
                        AllIds2 = new Set();
                    Object.values(playlistFile.playlists).forEach(
                        p => (AllIds2 = AllIds2.union(new Set(p.songs)))
                    );
                    removeIds = AllIds.difference(AllIds2);
                    reserveIds = AllIds2;
                    log("removeIds", removeIds);
                    break;
                case "删除数据文件夹中不位于 ncmPlaylist.json 的音乐":
                    removeFileNames = new Set(
                        fs.readdirSync(musicDir)
                    ).difference(
                        new Set(
                            Object.values(playlistFile.songs).map(
                                s => path.parse(s.path).base
                            )
                        )
                    );

                    log("removeFileNames", removeFileNames);
                    break;

                default:
                    return;
            }

            input("输入 Y 继续操作").then(v => {
                if (v !== "Y") return tts("取消");

                if (downloadIds && downloadIds[0]) {
                    downloadSong(downloadIds);
                } else if (removeFileNames?.size >= 1) {
                    Promise.all(
                        Array.from(removeFileNames).map(n =>
                            fs.promises.rm(path.join(musicDir, n), {
                                force: true,
                            })
                        )
                    )
                        .then(() => log(tts("完成")))
                        .catch(e => error(tts("操作失败".e)));
                } else if (removeIds?.size >= 1) {
                    removeIds.forEach(id => {
                        delete playlistFile.songs[id];
                    });
                    updatePlaylistFile();
                }
            });
        })
        .catch(e => error(tts("无法修复已下载音乐"), e));
}
async function like(/** @type {Number} */ id) {
    await initNcmApi();
    try {
        let p, like;
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

        const add2likeOnline = () => {
            const p = path.join(
                appRootPath.get(),
                "data/ncmWait2Add2Like.json"
            );
            ncmStatusCheck(
                ncmApi.like({
                    id,
                    cookie: loginStatus.cookie,
                    like: "" + like,
                    r: "" + Math.random(),
                })
            )
                .then(async d => {
                    try {
                        if (!loginStatus.likePlaylistId) return;
                        if (!fs.existsSync(p)) {
                            jsonfile.writeFileSync(
                                p,
                                { add: [], remove: [] },
                                jsonfileOptions
                            );
                        }
                        let /** @type {{ add: Number[], remove: Number[] }} */ j =
                                jsonfile.readFileSync(p);
                        try {
                            const add = j.add.join(","),
                                remove = j.remove.join(",");
                            add &&
                                (await ncmStatusCheck(
                                    ncmApi.playlist_tracks({
                                        pid: loginStatus.likePlaylistId,
                                        tracks: add,
                                        op: "add",
                                        cookie: loginStatus.cookie,
                                        r: "" + Math.random(),
                                    })
                                ));
                            remove &&
                                (await ncmStatusCheck(
                                    ncmApi.playlist_tracks({
                                        pid: loginStatus.likePlaylistId,
                                        tracks: remove,
                                        op: "del",
                                        cookie: loginStatus.cookie,
                                        r: "" + Math.random(),
                                    })
                                ));
                        } catch (e) {
                            error(e);
                            return tts("无法添加到网易云账号内的喜欢");
                        }

                        tts("已同步网易云账号内的喜欢");
                        jsonfile.writeFile(
                            p,
                            { add: [], remove: [] },
                            jsonfileOptions
                        );
                    } catch (e) {
                        error(e);
                    }
                })
                .catch(e => {
                    error(e);
                    try {
                        if (!fs.existsSync(p)) {
                            jsonfile.writeFileSync(
                                p,
                                { add: [], remove: [] },
                                jsonfileOptions
                            );
                        }
                        let j = jsonfile.readFileSync(p);
                        if (like) {
                            j.remove.includes(id) &&
                                j.remove.splice(j.remove.indexOf(id), 1);
                            !j.add.includes(id) && j.add.push(id);
                        } else {
                            j.add.includes(id) &&
                                j.add.splice(j.remove.indexOf(id), 1);
                            !j.remove.includes(id) && j.remove.push(id);
                        }
                        jsonfile.writeFile(p, j, jsonfileOptions);
                    } catch (e) {
                        error(e);
                    }
                });
        };

        const likePlaylist = playlistFile.playlists[p];
        if (like) {
            !likePlaylist.songs.includes(id) && likePlaylist.songs.push(id);
            p == "喜欢" && add2likeOnline();
            tts(`已添加到${p}`);
        } else {
            likePlaylist.songs.includes(id) &&
                likePlaylist.songs.splice(likePlaylist.songs.indexOf(id), 1);
            p == "喜欢" && add2likeOnline();
            tts(`已从${p}移除`);
        }
        updatePlaylistFile();
    } catch (e) {
        error(e);
    }
}
async function search() {
    await initNcmApi();
    if (!loginStatus.logged) tts("未登录");
    const kwd = await input("搜索词");
    if (!kwd) return;
    ncmStatusCheck(
        ncmApi.search({
            keywords: kwd,
            cookie: loginStatus.cookie,
            type: 1018,
        })
    )
        .then(async resp => {
            const songs = resp.body.result?.song?.songs || [],
                playLists = resp.body.result?.playList?.playLists || [];
            let items = {};
            if (
                (await chooseItem("选择单曲或歌单", ["单曲", "歌单"])) == "单曲"
            ) {
                songs.forEach(item => {
                    items[
                        `${item.name} 由 ${item.ar.map(
                            ar => ar.name
                        )} 演唱 id ${item.id}`
                    ] = item.id;
                });
                const keys = Object.keys(items);
                downloadSong(+items[await chooseItem("单曲搜索结果", keys)]);
            } else {
                playLists.forEach(item => {
                    items[`${item.name} id ${item.id}`] = item.id;
                });
                const keys = Object.keys(items);
                downloadPlaylist(
                    +items[await chooseItem("歌单搜索结果", keys)]
                ).catch(e => error(tts("歌单下载失败"), e));
            }
        })
        .catch(e => {
            error(e);
            tts("搜索失败");
        });
}

const playlistPath = path.join(appRootPath.get(), "data/ncmPlaylist.json");

class PlaylistEmitter extends EventEmitter {}
const /** @type {import(".").PlaylistEmitterT} */ playlistEmitter =
        new PlaylistEmitter();

let downloading = false,
    /** @type { ( String | Number | Number[] | String[] )[] } */ downloadList =
        [],
    /** @type { import(".").PlaylistFile } */ playlistFile = {
        version: 1,
        playlists: {
            全部: {
                name: "全部",
                pid: 0,
                songs: [], // NOTE: "全部" 歌单不应有任何歌曲, 读取时应作特殊处理
            },
            喜欢: {
                name: "喜欢",
                pid: -2,
                songs: [],
            },
            最喜欢: {
                name: "最喜欢",
                pid: -3,
                songs: [],
            },
            日推: {
                name: "日推",
                pid: -1,
                songs: [],
            },
        },
        songs: {},
    },
    /**@type { import(".").LoginStatus } */ loginStatus = {
        cookie: "",
        likePlaylistId: null,
        logged: false,
        nickname: null,
        uid: null,
    },
    /** @type {NodeJS.Timeout} */ historyTimeout;

addMenuItems("主页", {
    "_ncm.loginAgain": k => {
        login(true);
    },
    "_ncm.cancelDownloading": k => {
        cancelDownloading();
    },
    "_ncm.removePlaylist": k => {
        removePlaylist();
    },
});

if (fs.existsSync(playlistPath))
    playlistFile = jsonfile.readFileSync(playlistPath);
else
    jsonfile.writeFile(playlistPath, playlistFile, jsonfileOptions).catch(e => {
        error(e);
        tts("无法更新播放列表");
    });
fs.mkdirSync(path.join(appRootPath.get(), "data/musics/"), { recursive: true });

setTimeout(initNcmApi, 30000);

module.exports = {
    cancelDownloading,
    login,
    fixSongs,
    downloadPlaylist,
    downloadSong,
    ncmStatusCheck,
    updateNcmHistory,
    updatePlaylistFile,
    getPlaylistFile,
    initNcmApi,
    like,
    search,
    playlistEmitter,
};

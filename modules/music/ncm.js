"use strict";

let /** @type { import("axios") } */ axios;
const { EventEmitter } = require("events");
const fs = require("graceful-fs");
const jsonfile = require("jsonfile");
let /** @type { import("NeteaseCloudMusicApi") } */ ncmApi;
const path = require("path");
const sf = require("sanitize-filename");

const { chooseItem, input, addMenuItems } = require("../menus");
const {
    sleep,
    logger,
    appRootPath,
    execFile,
    dateForFileName,
} = require("../utils");
const { log, error, warn } = logger("网易云音乐");
const tts = require("../tts").tts;

const {
    jsonfileOptions,
    ncmDownloadSongWithCookie,
    writeFileOptions,
    ncmRetryTimeout,
    doNotUpdateNcmHistory,
    ncmDailyCheckIn,
} = require("../config");

async function initNcmApi() {
    if (!ncmApi) {
        ncmApi = require("NeteaseCloudMusicApi");
        axios = require("axios").default;
        log("网易云音乐 API 已加载");
    }
    try {
        await login();
    } catch (e) {
        warn("登录失败", e);
    }
}
async function ncmStatusCheck(
    /** @type {Promise<import("NeteaseCloudMusicApi").Response>} */ res
) {
    try {
        await initNcmApi();
        const resp = await res;
        if (resp.body.code === 200 || resp.body.status === 200) return resp;
        throw new Error("API 状态码异常" + resp);
    } catch (e) {
        throw e;
    }
}
async function login(clear = false) {
    if (clear)
        loginStatus = {
            cookie: "",
            likePlaylistId: null,
            logged: false,
            nickname: null,
            uid: null,
            result: "",
        };
    if (
        loginStatus.logged ||
        loginStatus.result === "invalid" ||
        loginStatus.result === "logging"
    )
        return;
    try {
        loginStatus.result = "logging";

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
        if (!loginStatus.cookie) {
            loginStatus.result = "";
            return warn("未登录");
        }

        const p = (await ncmApi.login_status({ cookie: loginStatus.cookie }))
            .body.data?.profile;
        if (p && p.userId) {
            loginStatus.logged = true;
            loginStatus.uid = p?.userId;
            loginStatus.nickname = p?.nickname || "空用户名";
            loginStatus.result = "success";
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
        } else {
            warn("登录已失效或登录信息有误");
            loginStatus = {
                cookie: "",
                likePlaylistId: null,
                logged: false,
                nickname: null,
                uid: null,
                result: "invalid",
            };
            return;
        }
        log("登录成功", loginStatus.nickname, loginStatus.uid);
        ncmDailyCheckIn &&
            ncmStatusCheck(
                ncmApi.daily_signin({ type: 1, cookie: loginStatus.cookie })
            )
                .then(resp => {
                    log("签到成功", resp.body.message);
                })
                .catch(e => {
                    warn("签到失败", e);
                });
        return;
    } catch (e) {
        warn("无法获取登录信息", e);
        loginStatus = {
            cookie: "",
            likePlaylistId: null,
            logged: false,
            nickname: null,
            uid: null,
            result: "netErr",
        };
    }
}
async function backupPlaylistFile() {
    await fs.promises.copyFile(
        playlistPath,
        path.join(
            playlistPath,
            `../ncmPlaylist-backup-${dateForFileName()}.json`
        )
    );
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
    if (!id) return;
    currentSec = Math.ceil(currentSec);
    clearTimeout(historyTimeout);
    historyTimeout = setTimeout(() => {
        initNcmApi().then(() => {
            const updateNcmHistory =
                loginStatus.logged && !doNotUpdateNcmHistory;
            log(
                `${updateNcmHistory ? "已" : "未"}更新听歌历史`,
                id,
                sourceid,
                currentSec
            );

            if (updateNcmHistory) {
                ncmStatusCheck(
                    ncmApi.scrobble({
                        id,
                        sourceid:
                            sourceid == -1 ? "dailySongRecommend" : sourceid,
                        time: currentSec,
                        cookie: loginStatus.cookie,
                        r: "" + +new Date(),
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
    clearRetrySleeper?.();
    log(tts("已取消全部下载任务", false));
}
/** 下载有 MV 的付费音乐, 成功返回 false, 失败返回 true */
async function downloadMV(
    /** @type { Number | String } */ songId,
    /** @type { Number | String } */ mvId,
    /** @type { String } */ musicPath,
    /** @type { (musicPath: string) => void } */ callback
) {
    try {
        if (!songId || isNaN((songId = +songId))) return true;
        if (!mvId || isNaN((mvId = +mvId))) return true;
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

        await execFile("ffmpeg", ["-i", p, "-y", "-vn", musicPath], 180000);
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
    /** @type { String | Number | Number[] | String[] | {songs: []}[] } */ ids,
    playListId = 0,
    playlistName = "",
    addOnly = false,
    originalData = false
) {
    await initNcmApi();
    let lastMusicPath = "",
        timeUsed = 0,
        timeWillUseMin = 0,
        timeWillUseText = "",
        failures = [];
    let tempPlaylistFile = structuredClone(playlistFile);
    let downloadedFileNames = new Set(
        fs.readdirSync(path.join(appRootPath.get(), `data/musics/`))
    );
    try {
        if (!originalData) {
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
        }
        if (downloading) {
            warn(tts("下载仍在继续, 已添加到队列", false));
            downloadList.push(arguments);
            return;
        }

        log("正在准备下载");

        let sd = originalData
            ? ids
            : (
                  await ncmApi.song_detail({
                      cookie: loginStatus.cookie,
                      ids: ids.join(","),
                  })
              ).body;
        if (originalData) {
            ids = ids?.songs?.map(m => +m.id) || [];
        }

        if (playListId && playlistName) {
            tempPlaylistFile.playlists[playlistName] = tempPlaylistFile
                .playlists[playlistName] || {
                name: playlistName,
                pid: playListId,
                songs: ids,
            };
            tempPlaylistFile.playlists[playlistName].songs = [];
        }

        downloading = true;
        for (let stage = 0; stage < 2; stage++) {
            if (stage == 1 && addOnly) break;
            for (let i = 0; i < sd.songs.length; i++) {
                let D;
                if (!downloading) {
                    addOnly = true; // 取消下载后，将未下载的音乐添加至歌单
                }

                const m = sd.songs[i];
                let musicPath = "",
                    musicFileName = "",
                    /** @type { Boolean | String } */ reason,
                    retryCount = -1,
                    fileExists = false;
                const artAndName = `${m.ar.map(ar => ar.name).join("、")}-${
                    m.name
                }`;
                while (1) {
                    if (!downloading) {
                        addOnly = true;
                    }
                    if (++retryCount >= 2) {
                        error(tts("重试次数过多，已放弃下载", false));
                        failures.push(`${m.id}-${artAndName}`);
                        break;
                    }

                    D = new Date();
                    reason = await (async () => {
                        try {
                            musicFileName = sf(
                                `${m.id}-${artAndName}.mp3`
                            ).replaceAll(" ", "-");
                            musicPath = path.join(
                                appRootPath.get(),
                                `data/musics/`,
                                musicFileName
                            );
                            if (addOnly || stage == 0) {
                                lastMusicPath = musicPath;
                                return true;
                            }
                            if (
                                downloadedFileNames.has(musicFileName) &&
                                tempPlaylistFile.songs[m.id]?.errors.length == 0
                            ) {
                                fileExists = true;
                                stage == 1 &&
                                    log(
                                        "文件已存在",
                                        m.name,
                                        (lastMusicPath = musicPath)
                                    );
                                return true;
                            }

                            timeWillUseMin = Math.ceil(
                                (timeUsed * (sd.songs.length - i + 1)) /
                                    1000 /
                                    60
                            );
                            timeWillUseText =
                                "预计总用时: " +
                                (timeUsed == 0
                                    ? "计算中"
                                    : (timeWillUseMin <= 1
                                          ? "不到 1"
                                          : "大约 " + timeWillUseMin) +
                                      " 分钟");
                            log("正在下载:", artAndName, timeWillUseText);

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
                            fs.writeFileSync(
                                musicPath,
                                d.data,
                                writeFileOptions
                            );
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

                    const retryTimeout =
                        ncmRetryTimeout[retryCount] || 5 * 60 * 1000;
                    if (typeof reason === "string") {
                        error(
                            tts(
                                `下载失败, ${retryTimeout / 1000} 秒后重试: ` +
                                    reason
                            )
                        );
                        await sleep(retryTimeout, clearSleeper => {
                            clearRetrySleeper = clearSleeper;
                        });
                    } else if (
                        reason === false &&
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
                            !addOnly &&
                            stage == 1 &&
                            tts(
                                `下载成功, 第 ${i + 1} 个, 共 ${
                                    sd.songs.length
                                } 个 ` + timeWillUseText
                            );
                        const tempSong = tempPlaylistFile.songs[m.id];
                        const /** @type {import(".").Song} */ s = {
                                name: m.name,
                                sid: m.id,
                                path: musicPath,
                                errors: tempSong?.errors[0]
                                    ? tempSong.errors
                                    : [],
                                downloaded: addOnly
                                    ? downloadedFileNames.has(musicFileName)
                                    : true,
                                artists: m.ar.map(ar => ({
                                    name: ar.name,
                                    aid: ar.id,
                                })),
                            };
                        tempPlaylistFile.songs[m.id] = s;
                        if (playListId && playlistName) {
                            tempPlaylistFile.playlists[playlistName]
                                ? tempPlaylistFile.playlists[
                                      playlistName
                                  ].songs.push(s.sid)
                                : (tempPlaylistFile.playlists[playlistName] = {
                                      name: playlistName,
                                      pid: playListId,
                                      songs: [m.id],
                                  });
                        }
                        playlistEmitter.emit("addSong", {
                            song: s,
                            playlist:
                                playListId && playlistName
                                    ? tempPlaylistFile.playlists[playlistName]
                                    : null,
                        });

                        if (!fileExists) timeUsed = new Date() - D;
                        break;
                    }
                }
            }

            if (playListId && playlistName) {
                tempPlaylistFile.playlists[playlistName].songs = Array.from(
                    new Set(tempPlaylistFile.playlists[playlistName].songs)
                );
            }
            playlistFile = tempPlaylistFile;
            updatePlaylistFile();
        }

        log(tts(`下载完成, 共 ${failures.length} 首无法下载`, false));
        failures[0] && warn("无法下载:", failures.join(", "));
    } catch (e) {
        error(tts("下载失败: 无法获取歌曲信息或其他错误", false, false), e);
    }

    downloading = false;
    downloadSong(...(downloadList.shift() || []));
    return lastMusicPath;
}
async function downloadPlaylist(
    /** -1: 日推, -2: 喜欢, -3: 最喜欢 */ pid,
    intelligence = false,
    addOnly = false
) {
    const getPlaylistName = async () => {
        return (
            (intelligence ? "心动模式-" : "") +
            (pid == -1
                ? "日推"
                : `${
                      (
                          await ncmStatusCheck(
                              ncmApi.playlist_detail({
                                  id: pid,
                                  cookie: loginStatus.cookie,
                              })
                          )
                      ).body.playlist.name
                  }-${pid}`)
        );
    };
    try {
        await initNcmApi();
        if (!pid) return;
        if (intelligence && !loginStatus.logged) {
            return warn(tts("需要登录", false));
        }
        try {
            await axios.get("https://music.163.com/?t=" + +new Date());
        } catch (e) {
            return error(tts("网络不稳定，未获取播放列表", true));
        }

        let j;
        if (pid == -1) {
            if (!loginStatus.logged) {
                return warn(tts("需要登录", false));
            }
            // 日推 需要登录
            j = ncmStatusCheck(
                ncmApi.recommend_songs({
                    cookie: loginStatus.cookie,
                })
            );
            intelligence = false;
        } else if (pid == -2) {
            if (!loginStatus.logged) {
                return warn(tts("需要登录", false));
            }
            let downloadedIds = new Set(
                    Object.keys(playlistFile.songs).map(v => +v)
                ),
                /** @type {Set<Number>} */
                allLikeIds = new Set(
                    (
                        await ncmStatusCheck(
                            ncmApi.likelist({ cookie: loginStatus.cookie })
                        )
                    ).body.ids?.map(v => +v) || []
                ),
                localLikeIds = new Set(playlistFile.playlists["喜欢"].songs);

            let wait2Add = allLikeIds
                .difference(localLikeIds)
                .intersection(downloadedIds);
            playlistFile.playlists["喜欢"].songs = Array.from(
                wait2Add.add(...playlistFile.playlists["喜欢"].songs)
            );
            updatePlaylistFile();
            log("已添加到喜欢", wait2Add);
            return;
        } else if (pid == -3) {
            downloadSong(playlistFile.playlists["最喜欢"].songs);
            return;
        } else if (pid > 0 && !intelligence) {
            // 歌单 非心动模式 无需登录
            j = {
                body: {
                    songs: [],
                },
            };
            for (let i = 0; i < 34; i++) {
                const o = await ncmStatusCheck(
                    ncmApi.playlist_track_all({
                        id: pid,
                        cookie: loginStatus.cookie,
                        offset: i * 300,
                        limit: 300,
                    })
                );
                log(
                    `正在获取播放列表内歌曲，第 ${
                        i * 300 + (o?.body?.songs?.length || 0)
                    } 首`
                );
                if (o?.body?.songs?.[0])
                    j.body.songs = j.body.songs.concat(o.body.songs);
                else break;
            }
            downloadSong(j.body, pid, await getPlaylistName(), addOnly, true);
            return;
        } else if (pid > 0 && intelligence && loginStatus.logged)
            // 歌单 心动模式 需要登录
            j = ncmStatusCheck(
                ncmApi.playmode_intelligence_list({
                    cookie: loginStatus.cookie,
                    pid,
                    id: (
                        await ncmStatusCheck(
                            ncmApi.playlist_track_all({
                                id: pid,
                                cookie: loginStatus.cookie,
                                limit: 1,
                            })
                        )
                    ).body.songs[0].id,
                })
            );
        else throw new Error("未登录/非法参数");

        const playlistName = await getPlaylistName();
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
        downloadSong(ids, pid, playlistName, addOnly);
    } catch (e) {
        error(tts("无法获取播放列表", true), e);
    }
}
function removePlaylist() {
    chooseItem("选择播放列表", Object.keys(getPlaylistFile().playlists))
        .then(v => {
            if (downloading) return tts("下载仍在继续, 无法操作");
            if (playlistFile.playlists[v].pid <= 0)
                return tts("无法删除内置播放列表");
            delete playlistFile.playlists[v];
            updatePlaylistFile();
            tts("删除成功");
        })
        .catch(e => error(tts("无法删除播放列表", false), e));
}
/** 修复和清理音乐，在操作成功执行后 resolve */
async function fixSongs() {
    return new Promise((resolve, reject) => {
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
                                    !allFileNames.has(
                                        path.parse(s.path).base
                                    )) &&
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
                        downloadSong(downloadIds).then(() => resolve());
                    } else if (removeFileNames?.size >= 1) {
                        Promise.all(
                            Array.from(removeFileNames).map(n =>
                                fs.promises.rm(path.join(musicDir, n), {
                                    force: true,
                                })
                            )
                        )
                            .then(() => {
                                log(tts("完成", false));
                                resolve();
                            })
                            .catch(e => {
                                error(tts("操作失败", false), e);
                                resolve();
                            });
                    } else if (removeIds?.size >= 1) {
                        removeIds.forEach(id => {
                            delete playlistFile.songs[id];
                        });
                        updatePlaylistFile();
                        resolve();
                    }
                });
            })
            .catch(e => error(tts("无法修复已下载音乐", false), e));
    });
}
async function like(/** @type {Number} */ id) {
    await initNcmApi();
    try {
        const m = playlistFile.songs[id];
        let p,
            like,
            name = ` ${m?.name || "未知"}, 由 ${
                (m?.artists.map(ar => ar.name) || []).join("、") || "未知"
            } 演唱, id ${id}`;
        switch (
            (
                await chooseItem("添加到", [
                    "添加到喜欢" + name,
                    "添加到最喜欢" + name,
                    "从喜欢移除" + name,
                    "从最喜欢移除" + name,
                    "添加到其他歌单",
                ])
            ).replace(name, "")
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
            case "添加到其他歌单":
                if (!loginStatus.logged) return tts("需要登录");
                ncmStatusCheck(
                    ncmApi.user_playlist({
                        uid: loginStatus.uid,
                        cookie: loginStatus.cookie,
                    })
                )
                    .then(async resp => {
                        let pls = {};
                        resp.body?.playlist?.forEach(
                            pl => (pls[pl.name] = pl.id)
                        );
                        await ncmStatusCheck(
                            ncmApi.playlist_tracks({
                                pid: pls[
                                    await chooseItem(
                                        "添加到其他歌单",
                                        Object.keys(pls)
                                    )
                                ],
                                tracks: "" + id,
                                op: "add",
                                cookie: loginStatus.cookie,
                                r: "" + Math.random(),
                            })
                        );
                        tts("操作成功");
                    })
                    .catch(e => error(tts("操作失败"), e));
                return;
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
    return new Promise(async (resolve, reject) => {
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
                    (await chooseItem(`${kwd}的搜索结果`, ["单曲", "歌单"])) ==
                    "单曲"
                ) {
                    songs.forEach(item => {
                        items[
                            `${item.name} 由 ${item.ar.map(
                                ar => ar.name
                            )} 演唱 id ${item.id}`
                        ] = item.id;
                    });
                    const keys = Object.keys(items);
                    resolve(
                        downloadSong(
                            +items[
                                await chooseItem(`${kwd}的单曲搜索结果`, keys)
                            ]
                        )
                    );
                } else {
                    playLists.forEach(item => {
                        items[`${item.name} id ${item.id}`] = item.id;
                    });
                    const keys = Object.keys(items);
                    downloadPlaylist(
                        +items[await chooseItem(`${kwd}的歌单搜索结果`, keys)]
                    ).catch(e => error(tts("歌单下载失败", false), e));
                }
            })
            .catch(e => {
                error(e);
                tts("搜索失败");
            });
    });
}
async function getLyricText(id) {
    if (!id || isNaN(+id)) return "";

    try {
        const lrcPath = path.join(
            appRootPath.get(),
            "./data/lyrics/",
            id + ".lrc"
        );
        if (fs.existsSync(lrcPath))
            return (await fs.promises.readFile(lrcPath)).toString();
        else {
            await initNcmApi();
            const lrcText =
                (
                    await ncmStatusCheck(
                        ncmApi.lyric({ id, cookie: loginStatus.cookie })
                    )
                ).body?.lrc?.lyric || "";
            if (!lrcText) return "";

            fs.mkdirSync(path.join(appRootPath.get(), "data/lyrics/"), {
                recursive: true,
            });
            fs.promises.writeFile(lrcPath, lrcText, writeFileOptions);
            return lrcText;
        }
    } catch (e) {
        warn("无法获取歌词", e);
        return "";
    }
}

const playlistPath = path.join(appRootPath.get(), "data/ncmPlaylist.json");

const /** @type {import(".").PlaylistEmitterT} */ playlistEmitter =
        new EventEmitter();

let downloading = false,
    /** @type {NodeJS.Timeout} */ clearRetrySleeper,
    /** @type { Array[] } */ downloadList = [],
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
        result: "",
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
    "_ncm.backupPlaylistFile": k => {
        backupPlaylistFile();
    },
});

if (fs.existsSync(playlistPath)) {
    try {
        playlistFile = jsonfile.readFileSync(playlistPath);
    } catch (e) {
        warn("ncmPlaylist.json 已损坏, 正在备份并重新创建");
        backupPlaylistFile().then(() => updatePlaylistFile());
    }
} else updatePlaylistFile();
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
    backupPlaylistFile,
    updatePlaylistFile,
    getPlaylistFile,
    initNcmApi,
    like,
    search,
    playlistEmitter,
    getLyricText,
};

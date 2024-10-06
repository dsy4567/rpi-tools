"use strict";

const cp = require("child_process");
const fs = require("graceful-fs");
const mpg123 = require("mpg123");
const path = require("path");

const {
    enableMprisService,
    defaultPlayMode,
    runMprisProxy,
} = require("../config");
const {
    input,
    chooseItem,
    addMenuItems,
    activeMenu,
    isMainMenu,
} = require("../menus");
const ncm = require("./ncm");
const tts = require("../tts").tts;
const { logger, shuffle, appRootPath, execFile } = require("../utils");
const { log, error, warn } = logger("播放器");

async function switchPlaylist(
    /** @type { String | Number | String[] } */ pl = "全部",
    _controlledByUser = true
) {
    const playlistFile = ncm.getPlaylistFile();
    const playlists = playlistFile.playlists;
    let tempCurrentNcmPlaylist = null,
        tempCurrentNcmPlaylist2 = currentNcmPlaylist,
        tempOriginalMusicPaths = [],
        tempMusicPaths = [],
        tempMusicPathsIndex = 0;

    if (!isNaN(+pl)) {
        pl = Object.keys(playlists)[+pl];
        if (pl !== "全部" && !playlists[pl]?.songs[0])
            return tts("歌单为空或不存在");
    } else if (
        typeof pl === "string" &&
        pl !== "全部" &&
        playlists[pl] &&
        !playlists[pl].songs[0]
    ) {
        return tts("歌单为空");
    }

    if (Array.isArray(pl)) {
        tempOriginalMusicPaths = structuredClone(pl);
        tempMusicPaths = structuredClone(pl);
    } else if (!playlists[pl] || pl == "全部") {
        try {
            fs.readdirSync(musicDir).forEach(file => {
                tempOriginalMusicPaths.push(path.join(musicDir, file));
                tempMusicPaths.push(path.join(musicDir, file));
            });
        } catch (err) {
            error(tts("读取音乐目录失败", false), err);
            return;
        }
    } else {
        let count = 0;
        tempCurrentNcmPlaylist = playlists[pl];
        playlists[pl].songs.forEach(id => {
            if (playlistFile.songs[id]?.errors.length >= 1) {
                ++count <= 10 &&
                    warn("文件已损坏:", playlistFile.songs[id].path);
                return;
            }
            if (playlistFile.songs[id]?.downloaded === false) {
                ++count <= 10 &&
                    warn("文件不存在:", playlistFile.songs[id].path);
                return;
            }
            const p = playlistFile.songs[id]?.path;
            if (!p) return;
            tempOriginalMusicPaths.push(p);
            tempMusicPaths.push(p);
        });
        if (count > 5) warn("更多文件已损坏或不存在");
    }
    if (!tempMusicPaths[0]) {
        return tts("歌单为空");
    }
    originalMusicPaths = tempOriginalMusicPaths;
    musicPaths = tempMusicPaths;
    musicPathsIndex = tempMusicPathsIndex;
    controlledByUser = _controlledByUser;
    pl == "日推" ? setPlayMode("autonext", true) : setPlayMode(undefined, true);
    await updatePlayerStatus(
        null,
        !controlledByUser,
        musicPaths[musicPathsIndex]
    );
    currentNcmPlaylist = tempCurrentNcmPlaylist;
    currentPlaylist = pl;
    musicPaths[0] && mpgPlayer.play(musicPaths[0]);

    musicPathsIndex = 0;
    for (let i = 0; i < musicPaths.length; i++) {
        if (musicPaths[i] == playerStatus.path) {
            musicPathsIndex = i;
            break;
        }
    }

    fs.writeFile(
        path.join(appRootPath.get(), "data/fallbackPlaylist.pls"),
        musicPaths.map(p => path.basename(p)).join("\n"),
        e => {
            e && error("无法写入备用播放列表", e);
        }
    );
}
function setPlayMode(
    /** @type { import(".").PlayMode } */ mode = currentPlayMode,
    noResetIndex = false
) {
    switch (mode) {
        case "autonext":
            musicPaths = structuredClone(originalMusicPaths);
            break;
        case "shuffle":
            musicPaths = shuffle(structuredClone(originalMusicPaths));
            break;
        case "repeat":
            break;

        default:
            return;
    }
    if (!noResetIndex) {
        musicPathsIndex = 0;
        for (let i = 0; i < musicPaths.length; i++) {
            if (musicPaths[i] == playerStatus.path) {
                musicPathsIndex = i;
                break;
            }
        }
    }
    currentPlayMode = mode;
}
/** @returns { Promise<number> } */
async function getCurrentProgressSec() {
    return new Promise((resolve, reject) => {
        mpgPlayer.file
            ? mpgPlayer.getProgress(p => resolve(p * mpgPlayer.length || 0))
            : resolve(0);
    });
}
function parseSongId(/** @type { String } */ songPath) {
    return +path.parse(songPath).name.split("-")[0];
}
async function getPlayerStatus() {
    playerStatus.currentSec = await getCurrentProgressSec();
    return playerStatus;
}
async function updatePlayerStatus(
    /** @type { Boolean } */ playing,
    ended = false,
    /** @type { null | String} */ nextPath = null
) {
    playing !== undefined &&
        playing !== null &&
        (playerStatus.playing = playing);
    if (nextPath) {
        const currentSongId = playerStatus.songId,
            currentPid = currentNcmPlaylist?.pid || 0;
        if (ended) {
            // 结束播放，准备播放下一曲
            ncm.updateNcmHistory(currentSongId, currentPid, mpgPlayer.length);
        } else {
            controlledByUser = false;
            ncm.updateNcmHistory(
                currentSongId,
                currentPid,
                await getCurrentProgressSec()
            );
        }
        playerStatus.totalSec = 0;
        playerStatus.path = nextPath;
        playerStatus.songId = parseSongId(nextPath);
        playerStatus.song = ncm.getPlaylistFile().songs[playerStatus.songId];
        playerStatus.songName =
            playerStatus.song?.name || path.parse(playerStatus.path).name;
        playerStatus.currentSec = 0;
        log("正在播放:", playerStatus.songName);
    } else {
        playerStatus.totalSec = mpgPlayer.length;
        playerStatus.path = musicPaths[musicPathsIndex];
        playerStatus.songId = parseSongId(playerStatus.path);
        playerStatus.currentSec = await getCurrentProgressSec();
    }
    playerStatus.song = ncm.getPlaylistFile().songs[playerStatus.songId];
    playerStatus.songName =
        playerStatus.song?.name || path.parse(playerStatus.path).name;
}
function playPause() {
    mpgPlayer.file && mpgPlayer.pause();
}
async function previous() {
    if (--musicPathsIndex < 0) musicPathsIndex = musicPaths.length - 1;
    controlledByUser = true;
    const p = musicPaths[musicPathsIndex];
    if (p) {
        await updatePlayerStatus(false, false, p);
        mpgPlayer.play(musicPaths[musicPathsIndex]);
    }
}
async function next(_controlledByUser = true) {
    controlledByUser = _controlledByUser;
    if (++musicPathsIndex > musicPaths.length - 1) {
        return switchPlaylist(currentPlaylist, controlledByUser);
        // musicPathsIndex = 0;
        // if (currentPlayMode === "shuffle") setPlayMode("shuffle");
    }
    const p = musicPaths[musicPathsIndex];
    if (p) {
        await updatePlayerStatus(false, !controlledByUser, p);
        mpgPlayer.play(musicPaths[musicPathsIndex]);
    }
}

const musicDir = path.join(appRootPath.get(), "data/musics/");

const mpgPlayer = new mpg123.MpgPlayer();
let originalMusicPaths = [],
    musicPaths = [],
    /** @type { import(".").Playlist | null } */ currentNcmPlaylist = null,
    /** @type { String | Number | String[] } */ currentPlaylist;
let /** @type { "autonext" | "shuffle" | "repeat" } */ currentPlayMode =
        "autonext",
    playerStatus = {
        playing: false,
        path: "",
        songId: 0,
        songName: "",
        /** @type { import(".").Song | null } */ song: null,
        totalSec: 0,
        currentSec: 0,
    },
    musicPathsIndex = 0;
let controlledByUser = false;

let mprisService;
mpgPlayer.on("pause", e => {
    log("暂停");
    updatePlayerStatus(false);
});
mpgPlayer.on("end", async e => {
    log("结束");
    if (currentPlayMode === "repeat") {
        const p = musicPaths[musicPathsIndex];
        if (p) {
            await updatePlayerStatus(false, true, p);
            mpgPlayer.play(p);
        }
    } else next(false);
});
mpgPlayer.on("resume", e => {
    log("播放");
    updatePlayerStatus(true);
});
mpgPlayer.on("error", e => {
    if (("" + e).includes("No stream opened")) return;
    error(tts("播放失败: " + playerStatus.songName, false), e);
    if (currentPlayMode === "repeat") currentPlayMode = "autonext";
    playerStatus.song?.errors.push("" + e);
    if (!fs.existsSync(playerStatus.path) && playerStatus.song)
        playerStatus.song.downloaded = false;
    ncm.updatePlaylistFile();
    updatePlayerStatus(false);
});

if (enableMprisService) {
    if (runMprisProxy) {
        execFile("mpris-proxy", [])
            .then(() => {})
            .catch(e => {
                error("无法启动 mpris-proxy", e);
            });
    }

    setTimeout(() => {
        try {
            const MprisPlayer = require("@jellybrick/mpris-service");
            mprisService = new MprisPlayer({
                name: "dsy4567.rpi-tools.player",
                identity: "dsy4567.rpi-tools.player",
            });
            [
                // "raise",
                // "quit",
                "next",
                "previous",
                "pause",
                "playpause",
                // "stop",
                "play",
                // "seek",
                // "position",
                // "open",
                // "volume",
                // "loopStatus",
                // "shuffle",
            ].forEach(ev => {
                mprisService.on(ev, () => {
                    // 蓝牙耳机按钮
                    switch (ev) {
                        // 播放暂停按钮
                        case "play":
                        case "pause":
                        case "playpause":
                            if (isMainMenu()) {
                                activeMenu(" "); // 播放/暂停
                            } else {
                                activeMenu("\r"); // 选择当前菜单项
                            }

                            break;
                        case "next": // 下一曲按钮
                            if (isMainMenu()) {
                                if (playerStatus.playing) {
                                    activeMenu("n"); // 下一曲
                                } else {
                                    activeMenu("M"); // 快捷菜单
                                }
                            } else {
                                activeMenu("n"); // 下一个菜单项
                            }

                            break;
                        case "previous": // 上一曲按钮
                            if (isMainMenu()) {
                                if (playerStatus.playing) {
                                    activeMenu("M"); // 快捷菜单
                                } else {
                                    activeMenu("b"); // 上一曲
                                }
                            } else {
                                activeMenu("b"); // 上一个菜单项
                            }
                            break;

                        default:
                            break;
                    }
                });
            });
        } catch (e) {
            error("无法初始化 mpris 服务", e);
        }
    }, 5000);
}

addMenuItems("主页", {
    l: async k => {
        ncm.like(playerStatus.songId);
    },
    D: async k => {},
    d: async k => {
        const opinions = [
            "下载单曲",
            "下载歌单",
            "仅添加歌单",
            "备份播放列表",
            "修复",
            "取消全部下载任务",
        ];
        const choice = await chooseItem("下载", opinions);
        let id, intelligence;

        switch (choice) {
            case "下载单曲":
                id = +(await input("id"));
                try {
                    const p = (await ncm.downloadSong(id)) || "";
                    p && switchPlaylist([p]);
                } catch (e) {
                    error(tts("下载失败", false), e);
                }
                break;
            case "下载歌单":
                id = +(await input("id"));
                intelligence = (await input("心动模式 (y/N)")) == "y";
                try {
                    await ncm.downloadPlaylist(id, intelligence);
                } catch (e) {
                    error(tts("下载失败", false), e);
                }
                break;
            case "仅添加歌单":
                id = +(await input("id"));
                try {
                    await ncm.downloadPlaylist(id, false, true);
                } catch (e) {
                    error(tts("下载失败", false), e);
                }
                break;
            case "备份播放列表":
                ncm.backupPlaylistFile()
                    .then(() => log(tts("完成", false)))
                    .catch(e => err(tts("无法备份播放列表", false), e));
                break;
            case "修复":
                ncm.fixSongs().then(() => switchPlaylist(currentPlaylist));
                break;
            case "取消全部下载任务":
                ncm.cancelDownloading();
                break;

            default:
                break;
        }
    },
    i: async k => {
        try {
            tts(
                `${playerStatus.songName || "未知"}, 由 ${
                    (playerStatus.song?.artists.map(ar => ar.name) || []).join(
                        "、"
                    ) || "未知"
                } 演唱, id ${playerStatus.songId}`
            );
        } catch (e) {}
    },
    s: async k => {
        const p = await ncm.search();
        p && switchPlaylist([p]);
    },
    I: k => {
        // init();
    },
    U: async k => {
        ncm.downloadPlaylist(
            ncm.getPlaylistFile().playlists[
                await chooseItem(
                    "更新播放列表",
                    Object.keys(ncm.getPlaylistFile().playlists)
                )
            ].pid
        );
    },
    p: async k => {
        switchPlaylist(
            await chooseItem(
                "选择播放列表",
                Object.keys(ncm.getPlaylistFile().playlists)
            )
        );
    },
    R: k => {
        setPlayMode("repeat");
        tts("单曲循环");
    },
    S: k => {
        setPlayMode("shuffle");
        tts("随机播放");
    },
    N: k => {
        setPlayMode("autonext");
        tts("顺序播放");
    },
    b: k => {
        controlledByUser = true;
        previous();
    },
    n: k => {
        controlledByUser = true;
        next();
    },
    " ": k => {
        playPause();
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

ncm.playlistEmitter.on("addSong", data => {
    if (+currentPlaylist === 0 || currentPlaylist === "全部") {
        musicPaths.push(data.song.path);
        originalMusicPaths.push(data.song.path);
    } else if (
        data.playlist &&
        currentNcmPlaylist?.pid === data.playlist?.pid &&
        !musicPaths.includes(data.song.path)
    ) {
        musicPaths.push(data.song.path);
        originalMusicPaths.push(data.song.path);
        currentNcmPlaylist = data.playlist;
    }
});

setPlayMode(defaultPlayMode);
switchPlaylist(0, false);

module.exports = {
    mprisService,
    mpgPlayer,
    getPlayerStatus,
    playpause: playPause,
    previous,
    next,
    setPlayMode,
    updatePlayerStatus,
};

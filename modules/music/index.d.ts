import EventEmitter from "events";

type Artist = {
    aid: number;
    name: string;
};
type Song = {
    sid: number;
    path: string;
    name: string;
    artists: Artist[];
    downloaded: boolean;
    errors: string[];
};
type Playlist = {
    name: string;
    pid: number;
    songs: number[];
};
type PlaylistFile = {
    songs: Record<number, Song>;
    playlists: Record<string, Playlist>;
};

type LoginStatus = {
    logged: boolean;
    cookie: string;
    nickname: null | string;
    uid: null | number;
    likePlaylistId: null | number;
};

type PlayMode = "autonext" | "shuffle" | "repeat";

interface PlaylistEmitterT extends EventEmitter {
    emit(
        event: "update",
        data: {
            song: Song;
            playlist: Playlist | null;
        }
    ): this;
    on(
        event: "update",
        listener: (data: { song: Song; playlist: Playlist | null }) => void
    ): this;
}

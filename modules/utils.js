"use strict";

const clc = require("cli-color");
const cp = require("child_process");
const { EventEmitter } = require("events");
const fs = require("graceful-fs");
const path = require("path");
const sf = require("sanitize-filename");

const /** @type {import("./index").LoggerEmitterT} */ loggerEmitter =
        new EventEmitter();

const D = new Date();
let unwrittenLogs = "",
    logInterval;
let appRootPath = path.join(__dirname, "../");
let dateForFileName;

function log(
    /** @type {"info" | "error" | "warn"} */ type,
    moduleName,
    ...args
) {
    const colors = {
        info: "greenBright",
        warn: "yellowBright",
        error: "redBright",
    };

    process.stdout._betterClearLine();
    console[type]?.(
        clc[colors[type] || "greenBright"](`${type[0].toUpperCase()}:`),
        clc.cyanBright.cyan(`[${moduleName}]`),
        ...args
    );

    unwrittenLogs +=
        [
            `${type[0].toUpperCase()}:`,
            `[${new Date() - D}] [${moduleName}]`,
            ...args.map(arg => {
                const s = "" + arg;
                return typeof arg === "object"
                    ? s === "[object Object]"
                        ? JSON.stringify(arg)
                        : s
                    : arg;
            }),
        ].join(" ") + "\n";

    const f = () => {
        if (unwrittenLogs) {
            try {
                fs.mkdirSync(
                    path.join(module.exports.appRootPath.get(), "data/logs/"),
                    {
                        recursive: true,
                    }
                );
                fs.appendFileSync(
                    path.join(
                        module.exports.appRootPath.get(),
                        `data/logs/${dateForFileName}.log`
                    ),
                    unwrittenLogs
                );
                unwrittenLogs = "";
            } catch (e) {
                console.error("无法写入日志文件", e);
            }
        }
    };
    dateForFileName || (dateForFileName = module.exports.dateForFileName());
    logInterval ||
        ((logInterval = setInterval(f, 10000)) &&
            process.on("exit", code => {
                unwrittenLogs += `\nI: [${
                    new Date() - D
                }] 已退出, 代码: ${code}\n`;
                f();
            }));

    loggerEmitter.emit("afterLog", {});
}

const statusBar = {
    show() {},
    hide() {},
    setText(text) {},
};

process.stdout._betterWrite = (data, wholeLine = true) => {
    if (wholeLine) process.stdout._betterClearLine();
    process.stdout._curPos += Buffer.from(data).length;
    process.stdout.write(data);
};
process.stdout._betterClearLine = () => {
    process.stdout.cursorTo(0);
    process.stdout.write(" ".repeat(process.stdout._curPos));
    process.stdout.cursorTo(0);
    process.stdout._curPos = 0;
};

module.exports = {
    appRootPath: {
        get() {
            return appRootPath;
        },
        set(p) {
            fs.mkdirSync(path.join(p, "data/"), { recursive: true });
            return (appRootPath = p);
        },
    },
    escape(s) {
        return s.replace(/[\(\)'"\\\&\%\$\#\[\]\{\}\* ]/g, "\\$&");
    },
    dateForFileName() {
        try {
            return sf(cp.execSync("date").toString()).replaceAll(" ", "-");
        } catch (e) {
            const date = new Date();
            const year = date.getFullYear();
            const month = (date.getMonth() + 1).toString().padStart(2, "0");
            const day = date.getDate().toString().padStart(2, "0");
            const hour = date.getHours().toString().padStart(2, "0");
            const minute = date.getMinutes().toString().padStart(2, "0");
            const second = date.getSeconds().toString().padStart(2, "0");
            return `${year}-${month}-${day}-${hour}-${minute}-${second}`;
        }
    },
    logger(moduleName = "???") {
        return {
            log(...args) {
                log("info", moduleName, ...args);
            },
            error(...args) {
                log("error", moduleName, ...args);
            },
            warn(...args) {
                log("warn", moduleName, ...args);
            },
            emitter: loggerEmitter,
        };
    },
    async sleep(t, cb) {
        return new Promise((resolve, reject) => {
            const sleeper = setTimeout(() => {
                resolve();
            }, t);
            cb?.(() => {
                clearTimeout(sleeper);
                resolve();
            });
        });
    },
    shuffle(arr) {
        return arr.sort(() => Math.random() - 0.5);
    },
    execFile(
        /** @type {String} */ file,
        /** @type {String[]} */ args,
        exitTimeout = 0
    ) {
        return new Promise((resolve, reject) => {
            const chp = cp.execFile(file, args, e => {
                if (e) reject(e);
                else {
                    resolve();
                    clearTimeout(timeout);
                }
            });
            chp.stdout.on("data", d => {
                log("info", `${file} stdout`, d);
            });
            chp.stderr.on("data", d => log("error", `${file} stderr`, d));
            let timeout;
            timeout =
                exitTimeout &&
                setTimeout(() => {
                    reject(new Error(`${file} 未在规定时间内退出`));
                    chp.kill(9);
                }, exitTimeout);
        });
    },
};

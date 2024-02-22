const ncm = require("NeteaseCloudMusicApi");
const axios = require("axios").default;

module.exports = {
    escape(s) {
        return s.replace(/[\(\)'"\\\&\%\$\#\[\]\{\}\* ]/g, "\\$&");
    },
    async onlineStatusCheck() {
        return new Promise(resolve => {
            axios
                .get("https://www.baidu.com", { validateStatus: () => true })
                .then(r => resolve(true))
                .catch(e => resolve(false));
        });
    },
    async ncmStatusCheck(/** @type {Promise<ncm.Response>} */ res) {
        const resp = await res;
        if (resp.body.code === 200) return resp;
        throw new Error(resp);
    },
    async sleep(t) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                resolve();
            }, t);
        });
    },
};

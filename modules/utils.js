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
};

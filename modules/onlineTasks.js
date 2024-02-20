const { onlineStatusCheck } = require("./utils");

const axios = require("axios").default;

let /** @type {NodeJS.Timeout} */ onlineStatusInterval,
    online = false;

function startOnlineStatusCheck() {
    clearInterval(onlineStatusInterval);
    onlineStatusInterval = setInterval(async () => {
        if ((online = await onlineStatusCheck())) clearInterval(onlineStatusInterval);
    }, interval);
}

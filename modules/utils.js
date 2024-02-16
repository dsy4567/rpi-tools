module.exports = {
    escape(s) {
        return s.replace(/[\(\)'"\\\&\%\$\#\[\]\{\}\* ]/g, "\\$&");
    },
};

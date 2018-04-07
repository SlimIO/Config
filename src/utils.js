/**
 * @namespace utils
 */

// Require third-party NPM package(s)
const is = require("@sindresorhus/is");

/**
 * @exports utils/formatAjvErrors
 * @function formatAjvErrors
 * @desc format ajv errors
 * @param {ajv.ErrorObject[]} ajvErrors Array of ajv error Object
 * @returns {String}
 */
function formatAjvErrors(ajvErrors) {
    if (!is.array(ajvErrors)) {
        return "";
    }
    const stdout = [];
    for (const oErr of ajvErrors) {
        stdout.push(`Configuration ${oErr.message}\n`);
    }

    return stdout.join("");
}

module.exports = {
    formatAjvErrors
};

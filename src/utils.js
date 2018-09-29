/**
 * @namespace utils
 */

// Require third-party NPM package(s)
const is = require("@slimio/is");

/**
 * @exports utils/formatAjvErrors
 * @function formatAjvErrors
 * @memberof utils#
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
        // console.error(oErr);
        stdout.push(`property ${oErr.dataPath} ${oErr.message}\n`);
    }

    return stdout.join("");
}

/**
 * @exports utils/limitObjectDepth
 * @function limitObjectDepth
 * @memberof utils#
 * @desc Limit an given object depth!
 * @param {!Object} obj obj
 * @param {Number=} [depth=0] depth
 * @returns {Object | Array}
 */
function limitObjectDepth(obj, depth = 0) {
    if (!is.plainObject(obj)) {
        return obj;
    }

    if (depth === 0) {
        return Object.keys(obj);
    }

    // eslint-disable-next-line
    const subDepth = depth--;
    for (const [key, value] of Object.entries(obj)) {
        obj[key] = limitObjectDepth(value, subDepth);
    }

    return obj;
}

module.exports = {
    formatAjvErrors,
    limitObjectDepth
};

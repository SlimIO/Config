// Require Node.JS core packages
const { extname } = require('path');
const Events = require('events');

// Require third-party NPM package(s)
const is = require('@sindresorhus/is');

/**
 * @class Config
 * @classdesc Reactive JSON Config loader class
 *
 * @property {String} configFile Path to the configuration file
 */
class Config extends Events {

    /**
     * @constructor
     * @param {!String} configFilePath Absolute path to the configuration file
     *
     * @throws {TypeError}
     */
    constructor(configFilePath) {
        super();
        if(is(configFilePath) !== "string") {
            throw new TypeError("Config.constructor->configFilePath should be typeof <string>");
        }
        this.configFile = configFilePath;
    }

    async read() {

    }

}

module.exports = Config;

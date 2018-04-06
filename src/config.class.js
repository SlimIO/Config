// Require Node.JS core packages
const { parse, extname } = require("path");
const { promisify } = require("util");
const Events = require("events");
const {
    access,
    readFile,
    writeFile,
    watchFile,
    constants: { R_OK, W_OK }
} = require("fs");

// Require third-party NPM package(s)
const is = require("@sindresorhus/is");
const ajv = new (require("ajv"))();
const get = require("lodash.get");
const set = require("lodash.set");
const Observable = require("zen-observable");

// FS Async Wrapper
const FSAsync = {
    access: promisify(access),
    readFile: promisify(readFile),
    writeFile: promisify(writeFile)
};

/**
 * @class Config
 * @classdesc Reactive JSON Config loader class
 *
 * @property {String} configFile Path to the configuration file
 * @property {String} schemaFile Path to the schema configuration file
 * @property {Object} payload Configuration content
 * @property {Boolean} createOnStart
 * @property {Boolean} autoReload
 * @property {Boolean} writeOnSet
 * @property {Boolean} configHasBeenRead Know if the configuration has been read at least one time
 * @property {Boolean} autoReloadActivated Know if the autoReload is Enabled or Disabled
 */
class Config extends Events {

    /**
     * @constructor
     * @param {!String} configFilePath Absolute path to the configuration file
     * @param {Object=} [options={}] Config options
     * @param {Boolean=} [options.createOnStart=false] Create the configuration file on start
     * @param {Boolean=} [options.autoReload=false] Enable/Disable hot reload of the configuration file.
     * @param {Boolean=} [options.writeOnSet=false] Write configuration on the disk after a set action
     *
     * @throws {TypeError}
     */
    constructor(configFilePath, options = {}) {
        super();
        if (is(configFilePath) !== "string") {
            throw new TypeError("Config.constructor->configFilePath should be typeof <string>");
        }

        // Parse file and get the extension, name, dirname etc...
        const { dir, name, ext } = parse(configFilePath);
        if (ext !== ".json") {
            throw new Error("Config.constructor->configFilePath - file extension should be .json");
        }
        this.configFile = configFilePath;
        this.schemaFile = extname(name) === ".schema" ?
            `${dir}/${name}${ext}` :
            `${dir}/${name}.schema${ext}`;

        // Assign default class values
        this.payload = {};
        this.createOnStart = options.createOnStart || false;
        this.autoReload = options.autoReload || false;
        this.autoReloadActivated = false;
        this.writeOnSet = options.writeOnSet || false;
        this.configHasBeenRead = false;
    }

    /**
     * @public
     * @async
     * @method read
     * @desc Read the configuration file
     * @memberof Config#
     * @param {Object=} defaultPayload Optional default payload (if the file doesn't exist on the disk).
     * @return {Promise<void>}
     *
     * @throws {Error}
     */
    async read(defaultPayload) {
        let JSONConfig;
        try {
            await FSAsync.access(this.configFile, R_OK | W_OK);
            JSONConfig = JSON.parse(
                await FSAsync.readFile(this.configFile)
            );
        }
        catch (err) {
            if (!this.createOnStart || err.code !== "ENOENT") {
                throw err;
            }
            JSONConfig = is(defaultPayload) === "Object" ? defaultPayload : {};
            await FSAsync.writeFile(this.configFile, JSON.stringify(JSONConfig, null, 4));
        }

        await FSAsync.access(this.schemaFile, R_OK);
        const JSONSchema = JSON.parse(
            await FSAsync.readFile(this.schemaFile)
        );
        const schema = ajv.compile(JSONSchema);
        const schemaIsValid = schema(JSONConfig);
        if (schemaIsValid === false) {
            console.log(schema.errors);

            // TODO: Add error(s) granularity
            throw new Error("Config.read - Failed to validate configuration schema");
        }

        // TODO: Detect update(s) ?
        this.payload = JSONConfig;
        this.configHasBeenRead = true;
        if (this.autoReload) {
            this.setupAutoReload();
        }
    }

    /**
     * @public
     * @method setupAutoReload
     * @desc Setup autoReload
     * @memberof Config#
     * @return {void}
     */
    setupAutoReload() {
        if (!this.configHasBeenRead || this.autoReloadActivated) {
            return;
        }
        this.autoReloadActivated = true;
        watchFile(this.configFile, async(curr, prev) => {
            console.log(`the current mtime is: ${curr.mtime}`);
            console.log(`the previous mtime was: ${prev.mtime}`);
        });
    }

    /**
     * @public
     * @async
     * @method get
     * @desc Get a given field of the configuration
     * @param {String!} fieldPath Path to the field (separated with dot)
     * @memberof Config#
     * @return {Promise<void>}
     *
     * @throws {Error}
     */
    async get(fieldPath) {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.get - Unable to get a key, the configuration has not been initialized yet!"
            );
        }
    }

    /**
     * @public
     * @async
     * @method get
     * @desc Get a given field of the configuration
     * @param {String!} fieldPath Path to the field (separated with dot)
     * @param {any} fieldValue Field value
     * @memberof Config#
     * @return {Promise<void>}
     *
     * @throws {Error}
     */
    async set(fieldPath, fieldValue) {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.get - Unable to set a key, the configuration has not been initialized yet!"
            );
        }
    }

}

module.exports = Config;

// Require Node.JS core packages
const { parse, extname } = require("path");
const { promisify } = require("util");
const Events = require("events");
const {
    access,
    readFile,
    writeFile,
    watchFile,
    unwatchFile,
    constants: { R_OK, W_OK }
} = require("fs");

// Require third-party NPM package(s)
const is = require("@sindresorhus/is");
const ajv = new (require("ajv"))({ useDefaults: "shared" });
const get = require("lodash.get");
const clonedeep = require("lodash.clonedeep");
const set = require("lodash.set");
const Observable = require("zen-observable");

// FS Async Wrapper
const FSAsync = {
    access: promisify(access),
    readFile: promisify(readFile),
    writeFile: promisify(writeFile)
};

/**
 * @function formatAjvErrors
 * @desc format ajv errors
 * @param {!Array} ajvErrors Array of errors
 * @returns {String}
 */
function formatAjvErrors(ajvErrors) {
    if (ajvErrors instanceof Array === false) {
        return "";
    }
    const stdout = [];
    for (const objectErr of ajvErrors) {
        stdout.push(`Configuration ${objectErr.message}\n`);
    }

    return stdout.join("");
}

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
 * @property {Map<String, Observable>} observables Map of observables
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
        this._payload = null;
        this._schema = null;
        this.createOnStart = options.createOnStart || false;
        this.autoReload = options.autoReload || false;
        this.autoReloadActivated = false;
        this.writeOnSet = options.writeOnSet || false;
        this.configHasBeenRead = false;
        this.observables = new Map();
    }

    /**
     * @public
     * @memberof Config#
     * @member {Object} payload
     */
    get payload() {
        if (!this.configHasBeenRead) {
            return null;
        }

        return clonedeep(this._payload);
    }

    /**
     * @public
     * @memberof Config#
     * @member {Object} payload
     * @param {!Object} newPayload Newest payload to setup
     */
    set payload(newPayload) {
        if (is(newPayload) !== "Object") {
            throw new TypeError("Config#set.payload->newPayload should be typeof <Object>");
        }

        // TODO: Detect update(s) ?
        this._payload = clonedeep(newPayload);
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
        // Declare scoped variable(s) to the top
        let JSONConfig;
        let JSONSchema;

        // Get and parse the JSON Configuration file (if exist).
        // If he doesn't exist we replace it by the defaultPayload or the precedent loaded payload
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
            JSONConfig = is(defaultPayload) === "Object" ?
                defaultPayload :
                is.nullOrUndefined(this._payload) ? {} : this.payload;
            await FSAsync.writeFile(this.configFile, JSON.stringify(JSONConfig, null, 4));
        }

        // Get and parse the JSON Schema file (only if he exist).
        // If he doesn't exist we replace it with a default Schema
        try {
            await FSAsync.access(this.schemaFile, R_OK);
            JSONSchema = JSON.parse(
                await FSAsync.readFile(this.schemaFile)
            );
        }
        catch (err) {
            if (err.code !== "ENOENT") {
                throw err;
            }
            JSONSchema = {};
        }

        // Verify that the Configuration match the JSON Schema.
        const schema = ajv.compile(JSONSchema);
        const schemaIsValid = schema(JSONConfig);
        if (schemaIsValid === false) {
            console.error(schema.errors);

            // TODO: Add error(s) granularity
            this.emit("error", "Config.read - Failed to validate configuration schema");
            throw new Error("Config.read - Failed to validate configuration schema");
        }

        this._schema = schema;
        this.payload = JSONConfig;
        this.configHasBeenRead = true;
        if (this.autoReload) {
            this.setupAutoReload();
        }
    }

    /**
     * @public
     * @method setupAutoReload
     * @desc Setup configuration autoReload
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
            await this.read();
            this.emit("reload");
        });
    }

    /**
     * @public
     * @template T
     * @method get
     * @desc Get a given field of the configuration
     * @param {!String} fieldPath Path to the field (separated with dot)
     * @memberof Config#
     * @return {T}
     *
     * @throws {Error}
     * @throws {TypeError}
     */
    get(fieldPath) {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.get - Unable to get a key, the configuration has not been initialized yet!"
            );
        }
        if (is(fieldPath) !== "string") {
            throw new TypeError("Config.get->fieldPath should be typeof <string>");
        }

        return get(this.payload, fieldPath);
    }

    /**
     * @public
     * @template T
     * @method get
     * @desc Get a given field of the configuration
     * @memberof Config#
     * @param {!String} fieldPath Path to the field (separated with dot)
     * @param {!T} fieldValue Field value
     * @return {Promise<void>}
     *
     * @throws {Error}
     * @throws {TypeError}
     */
    set(fieldPath, fieldValue) {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.get - Unable to set a key, the configuration has not been initialized yet!"
            );
        }
        if (is(fieldPath) !== "string") {
            throw new TypeError("Config.get->fieldPath should be typeof <string>");
        }

        // Verify that the modification is okay!
        const tempPayload = set(this.payload, fieldPath, fieldValue);
        if (this._schema(tempPayload) === false) {
            console.error(this._schema.errors);

            // TODO: Add error(s) granularity
            const errors = formatAjvErrors(this._schema.errors);
            throw new Error(`Config.set - Failed to set new value for key <${fieldPath}>`);
        }

        // Apply new payload
        this.payload = tempPayload;

        // Write Configuration on Disk
        if (this.writeOnSet) {
            process.nextTick(this.writeOnDisk.bind(this));
        }
    }

    /**
     * @public
     * @method writeOnDisk
     * @desc Write the configuration on the Disk
     * @memberof Config#
     * @returns {Promise<void>}
     */
    async writeOnDisk() {
        if (!this.configHasBeenRead) {
            throw new Error("Config.writeOnDisk - Cannot write unreaded configuration on the disk");
        }
        if (this._schema(this._payload) === false) {
            // TODO: What do we do in this case ?
            throw new Error("Config.writeOnDisk - Cannot write on the disk unValid configuration");
        }

        await FSAsync.access(this.configFile, W_OK);
        await FSAsync.writeFile(this.configFile, JSON.stringify(this._payload, null, 4));
    }

    /**
     * @public
     * @method close
     * @desc Close the configuration
     * @memberof Config#
     * @returns {Promise<void>}
     */
    async close() {
        await this.writeOnDisk();
        if (this.autoReloadActivated) {
            unwatchFile(this.configFile);
        }
        this.configHasBeenRead = false;
    }

}

// Default JSON Schema!
Config.DEFAULTSchema = {
    title: "CONFIG",
    additionalProperties: true
};

module.exports = Config;

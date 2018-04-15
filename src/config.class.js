// Require Node.JS core packages
const { parse, extname } = require("path");
const { promisify } = require("util");
const Events = require("events");
const {
    access,
    readFile,
    writeFile,
    constants: { R_OK, W_OK }
} = require("fs");

// Require third-party NPM package(s)
const watcher = require("node-watch");
const is = require("@sindresorhus/is");
const ajv = new (require("ajv"))({ useDefaults: "shared" });
const get = require("lodash.get");
const clonedeep = require("lodash.clonedeep");
const set = require("lodash.set");
const Observable = require("zen-observable");

// Require internal dependencie(s)
const { formatAjvErrors } = require("./utils");

// FS Async Wrapper
const FSAsync = {
    access: promisify(access),
    readFile: promisify(readFile),
    writeFile: promisify(writeFile)
};

// Private Config Accessors
const payload = Symbol();
const schema = Symbol();

/**
 * @class Config
 * @classdesc Reactive JSON Config loader class
 * @template T
 *
 * @property {String} configFile Path to the configuration file
 * @property {String} schemaFile Path to the schema configuration file
 * @property {T} payload Configuration content
 * @property {Boolean} createOnNoEntry
 * @property {Boolean} autoReload
 * @property {Boolean} writeOnSet
 * @property {Boolean} configHasBeenRead Know if the configuration has been read at least one time
 * @property {Boolean} autoReloadActivated Know if the autoReload is Enabled or Disabled
 * @property {Array} subscriptionObservers
 * @property {Number} reloadDelay delay before reloading the configuration file (in millisecond).
 * @property {Object} defaultSchema
 */
class Config extends Events {

    /**
     * @constructor
     * @param {!String} configFilePath Absolute path to the configuration file
     * @param {Object} [options={}] Config options
     * @param {Boolean=} [options.createOnNoEntry=false] Create the configuration file when no entry are detected
     * @param {Boolean=} [options.autoReload=false] Enable/Disable hot reload of the configuration file.
     * @param {Boolean=} [options.writeOnSet=false] Write configuration on the disk after a set action
     * @param {Object=} options.defaultSchema Optional default Schema
     * @param {Number=} [options.reloadDelay=1000] Hot reload delay
     *
     * @throws {TypeError}
     * @throws {Error}
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
        this[payload] = null;
        this[schema] = null;
        this.createOnNoEntry = options.createOnNoEntry || false;
        this.autoReload = options.autoReload || false;
        this.autoReloadActivated = false;
        this.reloadDelay = options.reloadDelay || 1000;
        this.writeOnSet = options.writeOnSet || false;
        this.configHasBeenRead = false;
        this.subscriptionObservers = [];

        // Assign defaultSchema is exist!
        if (Reflect.has(options, "defaultSchema")) {
            this.defaultSchema = options.defaultSchema;
        }
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

        return clonedeep(this[payload]);
    }

    /**
     * @public
     * @memberof Config#
     * @member {Object} payload
     * @param {!Object} newPayload Newest payload to setup
     *
     * @throws {Error}
     * @throws {TypeError}
     */
    set payload(newPayload) {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.payload - cannot set a new payload when the config has not been read yet!"
            );
        }
        if (is(newPayload) !== "Object") {
            throw new TypeError("Config.payload->newPayload should be typeof <Object>");
        }

        const tempPayload = clonedeep(newPayload);
        if (this[schema](tempPayload) === false) {
            const errors = formatAjvErrors(this[schema].errors);
            const msg = `Config.payload - Failed to validate new configuration, err => ${errors}`;
            throw new Error(msg);
        }

        this[payload] = tempPayload;
        for (const [fieldPath, subscriptionObservers] of this.subscriptionObservers) {
            subscriptionObservers.next(this.get(fieldPath));
        }
    }

    /**
     * @public
     * @async
     * @method read
     * @desc Read the configuration file
     * @memberof Config#
     * @param {T=} defaultPayload Optional default payload (if the file doesn't exist on the disk).
     * @return {Promise<this>}
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
            if (!this.createOnNoEntry || err.code !== "ENOENT") {
                throw err;
            }
            JSONConfig = is(defaultPayload) === "Object" ?
                defaultPayload :
                is.nullOrUndefined(this[payload]) ? {} : this.payload;
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
            JSONSchema = is.nullOrUndefined(this.defaultSchema) ?
                Config.DEFAULTSchema :
                this.defaultSchema;
        }

        this[schema] = ajv.compile(JSONSchema);
        this.configHasBeenRead = true;
        this.payload = JSONConfig;
        if (this.autoReload) {
            this.setupAutoReload();
        }

        return this;
    }

    /**
     * @public
     * @method setupAutoReload
     * @desc Setup configuration autoReload
     * @memberof Config#
     * @return {void}
     */
    setupAutoReload() {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.setupAutoReaload - cannot setup autoReload when the config has not been read yet!"
            );
        }
        if (this.autoReloadActivated) {
            return;
        }

        this.autoReloadActivated = true;
        this.watcher = watcher(this.configFile, { delay: this.reloadDelay }, async(evt, name) => {
            await this.read();
            this.emit("reload");
        });
    }

    /**
     * @public
     * @template H
     * @method get
     * @desc Get a given field of the configuration
     * @param {!String} fieldPath Path to the field (separated with dot)
     * @memberof Config#
     * @return {H}
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
     * @method observableOf
     * @desc Observe a given configuration key with an Observable object!
     * @param {!String} fieldPath Path to the field (separated with dot)
     * @memberof Config#
     * @return {Observable}
     */
    observableOf(fieldPath) {
        const fieldValue = this.get(fieldPath);

        return new Observable((observer) => {
            observer.next(fieldValue);
            this.subscriptionObservers.push([fieldPath, observer]);
        });
    }

    /**
     * @public
     * @template H
     * @method set
     * @desc Set a field in the configuration
     * @memberof Config#
     * @param {!String} fieldPath Path to the field (separated with dot)
     * @param {!H} fieldValue Field value
     * @return {Promise<void>}
     *
     * @throws {Error}
     * @throws {TypeError}
     */
    set(fieldPath, fieldValue) {
        if (!this.configHasBeenRead) {
            throw new Error(
                "Config.set - Unable to set a key, the configuration has not been initialized yet!"
            );
        }
        if (is(fieldPath) !== "string") {
            throw new TypeError("Config.set->fieldPath should be typeof <string>");
        }

        this.payload = set(this.payload, fieldPath, fieldValue);
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
     *
     * @throws {Error}
     */
    async writeOnDisk() {
        if (!this.configHasBeenRead) {
            throw new Error("Config.writeOnDisk - Cannot write unreaded configuration on the disk");
        }
        if (this[schema](this[payload]) === false) {
            const errors = formatAjvErrors(this[schema].errors);
            throw new Error(
                `Config.writeOnDisk - Cannot write on the disk invalid config, err => ${errors}`
            );
        }

        await FSAsync.access(this.configFile, W_OK);
        await FSAsync.writeFile(this.configFile, JSON.stringify(this[payload], null, 4));
    }

    /**
     * @public
     * @method close
     * @desc Close the configuration
     * @memberof Config#
     * @returns {Promise<void>}
     */
    async close() {
        if (this.autoReloadActivated && !this.watcher.isClosed()) {
            this.watcher.close();
            this.autoReloadActivated = false;
        }
        await this.writeOnDisk();
        for (const [, subscriptionObservers] of this.subscriptionObservers) {
            subscriptionObservers.complete();
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

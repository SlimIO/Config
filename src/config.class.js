// Require Node.JS core packages
const { parse, extname } = require("path");
const events = require("events");
const {
    promises: {
        access,
        readFile,
        writeFile
    },
    constants: { R_OK, W_OK }
} = require("fs");

// Require Third-party NPM package(s)
const watcher = require("node-watch");
const is = require("@sindresorhus/is");
const ajv = new (require("ajv"))({ useDefaults: "shared" });
const get = require("lodash.get");
const clonedeep = require("lodash.clonedeep");
const set = require("lodash.set");
const Observable = require("zen-observable");

// Require Internal dependencie(s)
const { formatAjvErrors } = require("./utils");

// Private Config Accessors
const payload = Symbol("payload");
const schema = Symbol("schema");

/**
 * @class Config
 * @classdesc Reactive JSON Config loader class
 * @extends events
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
 *
 * @event reload
 *
 * @author Thomas GENTILHOMME <gentilhomme.thomas@gmail.com>
 * @version 0.1.0
 */
class Config extends events {

    /**
     * @constructor
     * @param {!String} configFilePath Absolute path to the configuration file
     * @param {Object} [options={}] Config options
     * @param {Boolean=} [options.createOnNoEntry=false] Create the configuration file when no entry are detected
     * @param {Boolean=} [options.autoReload=false] Enable/Disable hot reload of the configuration file.
     * @param {Boolean=} [options.writeOnSet=false] Write configuration on the disk after a set action
     * @param {Object=} options.defaultSchema Optional default Schema
     * @param {Number=} [options.reloadDelay=1000] Hot reload delay (in milliseconds)
     *
     * @throws {TypeError}
     * @throws {Error}
     *
     * @version 0.1.0
     *
     * @example
     * const cfgOptions = {
     *     autoReload: true,
     *     createOnNoEntry: true,
     *     writeOnSet: true,
     *     reloadDelay: 2000
     * };
     * const cfgM = new Config("./path/to/config.json", cfgOptions);
     */
    constructor(configFilePath, options = Object.create(null)) {
        super();
        if (!is.string(configFilePath)) {
            throw new TypeError("Config.constructor->configFilePath should be typeof <string>");
        }
        if (!is.nullOrUndefined(options) && !is.plainObject(options)) {
            throw new TypeError("Config.constructor->options should be instanceof Object prototype");
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
        this[payload] = Object.create(null);
        this[schema] = null;
        this.createOnNoEntry = is.boolean(options.createOnNoEntry) ? options.createOnNoEntry : false;
        this.autoReload = is.boolean(options.autoReload) ? options.autoReload : false;
        this.autoReloadActivated = false;
        this.reloadDelay = is.number(options.reloadDelay) ? options.reloadDelay : 500;
        this.writeOnSet = is.boolean(options.writeOnSet) ? options.writeOnSet : false;
        this.configHasBeenRead = false;

        /** @type {Array<[string, ZenObservable.SubscriptionObserver<any>]>} */
        this.subscriptionObservers = [];

        // Assign defaultSchema is exist!
        if (Reflect.has(options, "defaultSchema")) {
            if (!is.plainObject(options.defaultSchema)) {
                throw new TypeError("Config.constructor->options defaultSchema should be instanceof Object prototype");
            }
            this.defaultSchema = options.defaultSchema;
        }
    }

    /**
     * @public
     * @memberof Config#
     * @member {Object} payload
     * @desc Get a payload Object clone (or null if the configuration has not been read yet)
     *
     * @version 0.1.0
     *
     * @example
     * const cfg = new Config("./path/to/config.json");
     * await cfg.read();
     * const configContent = cfg.payload;
     * console.log(JSON.stringify(configContent, null, 2));
     */
    get payload() {
        return clonedeep(this[payload]);
    }

    /**
     * @public
     * @memberof Config#
     * @member {Object} payload
     * @param {!T} newPayload Newest payload to setup
     * @desc Set a new payload Object
     *
     * @throws {Error}
     * @throws {TypeError}
     *
     * @version 0.1.0
     *
     * @example
     * const cfg = new Config("./path/to/config.json");
     * await cfg.read();
     *
     * // Assign a new cfg (payload). It should match the cfg Schema (if there is any)
     * try {
     *     cfg.payload = {
     *         foo: "bar"
     *     };
     * }
     * catch (error) {
     *     // handle error here!
     * }
     */
    set payload(newPayload) {
        if (!this.configHasBeenRead) {
            throw new Error("Config.payload - cannot set a new payload when the config has not been read yet!");
        }
        if (!is.object(newPayload)) {
            throw new TypeError("Config.payload->newPayload should be typeof <Object>");
        }

        /** @type {T} */
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
     * @desc Read the configuration file (And optionaly apply a default payload value if the file doesn't exist)
     * @memberof Config#
     * @param {T=} defaultPayload Optional default payload (if the file doesn't exist on the disk).
     * @return {Promise<this>}
     *
     * @version 0.1.0
     *
     * @example
     * const myConfig = new Config("./path/to/config.json", {
     *     autoReload: true,
     *     createOnNoEntry: true
     * });
     *
     * async function main() {
     *    await myConfig.read({
     *        foo: "bar"
     *    });
     *    console.log(myConfig.payload);
     * }
     * main().catch(console.error);
     */
    async read(defaultPayload) {
        /** @type {T} */
        let JSONConfig;
        /** @type {Object} */
        let JSONSchema;

        // Verify configFile integrity!
        if (!is.string(this.configFile)) {
            throw new TypeError("Config.read - configFile should be typeof <string>");
        }

        // Get and parse the JSON Configuration file (if exist).
        // If he doesn't exist we replace it by the defaultPayload or the precedent loaded payload
        try {
            await access(this.configFile, R_OK | W_OK);
            const buf = await readFile(this.configFile);
            JSONConfig = JSON.parse(buf.toString());
        }
        catch (err) {
            if (!this.createOnNoEntry || Reflect.has(err, "code") && err.code !== "ENOENT") {
                throw err;
            }
            JSONConfig = is.object(defaultPayload) ?
                defaultPayload :
                is.nullOrUndefined(this[payload]) ? Object.create(null) : this.payload;
            const configStr = JSON.stringify(JSONConfig, null, 4);
            await writeFile(this.configFile, configStr);
        }

        // Get and parse the JSON Schema file (only if he exist).
        // If he doesn't exist we replace it with a default Schema
        try {
            await access(this.schemaFile, R_OK);
            const buf = await readFile(this.schemaFile);
            JSONSchema = JSON.parse(buf.toString());
        }
        catch (err) {
            if (Reflect.has(err, "code") && err.code !== "ENOENT") {
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
     * @return {Boolean}
     *
     * @version 0.1.0
     *
     * @throws {Error}
     */
    setupAutoReload() {
        if (!this.configHasBeenRead) {
            throw new Error("Config.setupAutoReaload - cannot setup autoReload when the config has not been read yet!");
        }

        // Return if autoReload is already equal to true.
        if (this.autoReloadActivated) {
            return false;
        }

        const watcherOptions = { delay: this.reloadDelay };
        this.watcher = watcher(this.configFile, watcherOptions, () => {
            this.read().then(() => {
                this.emit("reload");
            }).catch(console.error);
        });
        this.autoReloadActivated = true;

        return true;
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
     *
     * @version 0.1.0
     *
     * @example
     * const myConfig = new Config("./path/to/config.json", {
     *     createOnNoEntry: true
     * });
     *
     * async function main() {
     *    await myConfig.read({
     *        foo: "bar"
     *    });
     *    const value = myConfig.get("path.to.key");
     * }
     * main().catch(console.error);
     */
    get(fieldPath) {
        if (!this.configHasBeenRead) {
            throw new Error("Config.get - Unable to get a key, the configuration has not been initialized yet!");
        }
        if (!is.string(fieldPath)) {
            throw new TypeError("Config.get->fieldPath should be typeof <string>");
        }

        return get(this.payload, fieldPath);
    }

    /**
     * @public
     * @template H
     * @method observableOf
     * @desc Observe a given configuration key with an Observable object!
     * @param {!String} fieldPath Path to the field (separated with dot)
     * @memberof Config#
     * @return {ZenObservable.ObservableLike<H>}
     *
     * @version 0.1.0
     *
     * @example
     * const myConfig = new Config("./config.json", {
     *     autoReload: true,
     *     createOnNoEntry: true
     * });
     * const { writeFile } = require("fs");
     * const { promisify } = require("util");
     *
     * // Promisify fs.writeFile
     * const asyncwriteFile = promisify(writeFile);
     *
     * async function main() {
     *    await myConfig.read({
     *        foo: "bar"
     *    });
     *
     *    // Observe initial and futur value(s) of foo
     *    myConfig.observableOf("foo").subscribe(console.log);
     *
     *    // Re-write local config file
     *    await asyncwriteFile("./config.json", JSON.stringify(
     *      { foo: "world!" }, null, 4
     *    ));
     * }
     * main().catch(console.error);
     */
    observableOf(fieldPath) {
        if (!is.string(fieldPath)) {
            throw new TypeError("Config.observableOf->fieldPath should be typeof <string>");
        }

        /**
         * Retrieve the field value first
         * @type {H}
         */
        const fieldValue = this.get(fieldPath);

        return new Observable((observer) => {
            // Send it as first Observed value!
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
     * @return {this}
     *
     * @throws {Error}
     * @throws {TypeError}
     *
     * @version 0.1.0
     *
     * @example
     * const myConfig = new Config("./config.json", {
     *     createOnNoEntry: true,
     *     // writeOnSet: true
     * });
     *
     * async function main() {
     *    await myConfig.read({
     *        foo: "bar"
     *    });
     *
     *    // Set a new value for foo
     *    myConfig.set("foo", "hello world!");
     *
     *    // Write on disk the configuration
     *    await myConfig.writeOnDisk();
     * }
     * main().catch(console.error);
     */
    set(fieldPath, fieldValue) {
        if (!this.configHasBeenRead) {
            throw new Error("Config.set - Unable to set a key, the configuration has not been initialized yet!");
        }
        if (!is.string(fieldPath)) {
            throw new TypeError("Config.set->fieldPath should be typeof <string>");
        }

        // Setup the new cfg by using the getter/setter payload
        this.payload = set(this.payload, fieldPath, fieldValue);

        // If writeOnSet option is actived, writeOnDisk at the next loop iteration (lazy)
        if (this.writeOnSet) {
            setImmediate(() => {
                this.writeOnDisk().catch(console.error);
            });
        }

        return this;
    }

    /**
     * @public
     * @method writeOnDisk
     * @desc Write the configuration on the Disk
     * @memberof Config#
     * @returns {Promise<void>}
     *
     * @throws {Error}
     *
     * @version 0.1.0
     *
     * @example
     * // Config can be created with the option `writeOnSet` that enable cfg auto-writing on disk after every set!
     * const cfg = new Config("./path/to/config.json");
     * await cfg.read();
     * cfg.set("field.path", "value");
     * await cfg.writeOnDisk();
     */
    async writeOnDisk() {
        if (!this.configHasBeenRead) {
            throw new Error("Config.writeOnDisk - Cannot write unreaded configuration on the disk");
        }

        await access(this.configFile, W_OK);
        await writeFile(this.configFile, JSON.stringify(this[payload], null, 4));
    }

    /**
     * @public
     * @method close
     * @desc Close (and write on disk) the configuration (it will close the watcher and clean all active observers).
     * @memberof Config#
     * @returns {Promise<void>}
     *
     * @throws {Error}
     *
     * @version 0.1.0
     *
     * @example
     * const cfg = new Config("./path/to/config.json");
     * await cfg.read();
     * await cfg.close();
     */
    async close() {
        if (!this.configHasBeenRead) {
            throw new Error("Config.close - Cannot close unreaded configuration");
        }

        // Close sys hook watcher
        if (this.autoReloadActivated) {
            this.watcher.close();
            this.autoReloadActivated = false;
        }

        // Write the Configuration on the disk to be safe
        await this.writeOnDisk();

        // Complete all observers
        for (const [index, subscriptionObservers] of this.subscriptionObservers) {
            subscriptionObservers.complete();
            // this.subscriptionObservers.splice(index, 1);
        }
        this.configHasBeenRead = false;
    }

}

// Default JSON Schema!
Config.DEFAULTSchema = {
    title: "CONFIG",
    additionalProperties: true
};

// Export class
module.exports = Config;

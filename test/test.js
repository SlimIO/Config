"use strict";

// Require Node.JS Dependencies
const { writeFile, readFile, unlink, access } = require("fs").promises;
const { join } = require("path");
const os = require("os");

// Require Third-Party Dependencies!
const avaTest = require("ava");
const is = require("@slimio/is");

// Require Internal Dependencies
const Config = require("../src/config.class");
const { formatAjvErrors, limitObjectDepth } = require("../src/utils.js");

// LOAD SCHEMA & DEFAULT CONFIG PAYLOAD
const configSchemaJSON = require("./config.schema.json");
const jsonPayload = require("./config.json");

// ENSURE EVERY THINGS IS CLEAR ON LOCAL DISK
let count = 0;
const CFG_TO_CLEAR = [];
avaTest.after.always("Guaranteed cleanup", async() => {
    const toDelete = [];
    for (let num = 1; num < count + 1; num++) {
        toDelete.push(unlink(`./test/config${num}.schema.json`));
        toDelete.push(unlink(`./test/config${num}.json`));
    }
    for (const cfg of CFG_TO_CLEAR) {
        toDelete.push(unlink(cfg));
    }
    await Promise.all(toDelete);
});

async function createNewConfiguration(options = Object.create(null)) {
    const num = ++count;
    const schemaName = `./test/config${num}.schema.json`;
    const configName = `./test/config${num}.json`;
    await Promise.all([
        writeFile(schemaName, JSON.stringify(configSchemaJSON)),
        writeFile(configName, JSON.stringify(jsonPayload))
    ]);

    return { num, config: new Config(configName, options) };
}

function assertConfigTypesAndValues(assert, config, checkDefaultValues = false) {
    assert.true(is.directInstanceOf(config, Config));
    assert.true(is.bool(config.createOnNoEntry));
    assert.true(is.bool(config.autoReload));
    assert.true(is.bool(config.autoReloadActivated));
    assert.true(is.number(config.reloadDelay));
    assert.true(is.bool(config.writeOnSet));
    assert.true(is.bool(config.configHasBeenRead));
    assert.true(is.array(config.subscriptionObservers));

    // Check default class properties values
    if (checkDefaultValues) {
        assert.false(config.createOnNoEntry);
        assert.false(config.autoReload);
        assert.false(config.autoReloadActivated);
        assert.is(config.reloadDelay, 500);
        assert.false(config.writeOnSet);
        assert.false(config.configHasBeenRead);
        assert.deepEqual(config.subscriptionObservers, []);
    }
}

avaTest("Default payload types and values are right", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config, true);

    await config.read();
    assert.true(is.plainObject(config.payload));
    assert.true(is.string(config.payload.foo));
    assert.true(is.string(config.payload.test));
    assert.is(config.payload.foo, "world!");
    assert.is(config.payload.test, "hello world!");
    await config.close();
});

avaTest("Constructor options are applied as default properties", async(assert) => {
    const { config } = await createNewConfiguration({
        createOnNoEntry: true,
        autoReload: true,
        reloadDelay: 700,
        writeOnSet: true
    });
    assertConfigTypesAndValues(assert, config);

    assert.true(config.createOnNoEntry);
    assert.true(config.autoReload);
    assert.true(config.writeOnSet);
    assert.is(config.reloadDelay, 700);
});

avaTest("Update/Set multiple payload values", async(assert) => {
    const { config } = await createNewConfiguration({
        autoReload: true
    });
    assertConfigTypesAndValues(assert, config);

    await config.read();
    let payload = config.payload;
    assert.true(is.plainObject(payload));
    assert.true(is.string(payload.foo));
    assert.true(is.undefined(payload.bar));
    assert.is(payload.foo, "world!");

    // Set new values
    config.set("foo", "Hello");
    config.set("bar", 10);

    // Verify if old payload has reference to new payload
    assert.is(payload.foo, "world!");
    assert.true(is.undefined(payload.bar));

    // Verify new payload
    payload = config.payload;
    assert.is(payload.foo, "Hello");
    assert.is(payload.bar, 10);

    await config.close();
});

avaTest("Set payload value by rewriting config on the disk", async(assert) => {
    const { config, num } = await createNewConfiguration({
        autoReload: true
    });
    assertConfigTypesAndValues(assert, config);

    await config.read();
    assert.is(config.payload.foo, "world!");

    // Write a new configuration on the disk
    await new Promise((resolve, reject) => {
        config.on("reload", resolve);
        config.on("error", reject);
        writeFile(
            `./test/config${num}.json`,
            JSON.stringify({ foo: "Hello" })
        ).catch(reject);
    });

    // Verify if foo is equal to the new payload value
    assert.is(config.payload.foo, "Hello");

    await config.close();
});

avaTest("Observe the same fieldPath multiple time", async(assert) => {
    assert.plan(6);
    const { config } = await createNewConfiguration({
        autoReload: true,
        reloadDelay: 100
    });

    await config.read();
    const obs = config.observableOf("foo");

    await new Promise((resolve) => {
        obs.subscribe((curr) => {
            if (curr === "world!" || curr === "Wahou!") {
                assert.pass();
            }
        });
        obs.subscribe((curr) => {
            if (curr === "world!" || curr === "Wahou!") {
                assert.pass();
            }
        });
        config.set("foo", "Wahou!");
        setTimeout(resolve, 200);
    });

    assert.is(config.subscriptionObservers.length, 2);
    for (const [, obs] of config.subscriptionObservers) {
        obs.complete();
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
    assert.is(config.subscriptionObservers.length, 0);
    await config.close();
});

avaTest("Verify STRINGIFY_SPACE", async(assert) => {
    assert.is(Config.STRINGIFY_SPACE, 4);

    const { num, config } = await createNewConfiguration();
    await config.read();

    Config.STRINGIFY_SPACE = 2;
    await config.writeOnDisk();

    const dPayload = {
        foo: "world!",
        test: "hello world!"
    };
    const buf = await readFile(join(__dirname, `config${num}.json`));
    assert.is(JSON.stringify(dPayload, null, 2), buf.toString());

    await config.close();
    Config.STRINGIFY_SPACE = 4;
});

avaTest("Observe a value and stream/wait update", async(assert) => {
    assert.plan(5);
    const { config } = await createNewConfiguration();
    await config.read();
    const obs = config.observableOf("foo");

    await new Promise((resolve, reject) => {
        obs.subscribe((curr) => {
            if (curr === "world!") {
                // Subscriber return the first original value!
                assert.pass();
            }
            else if (curr === "Wahou!") {
                assert.pass();
                resolve();
            }
        });
        config.set("foo", "Wahou!");
        // Timeout after 1,000ms
        setTimeout(reject, 1000);
    });

    assert.is(config.subscriptionObservers.length, 1);
    assert.is(config.payload.foo, "Wahou!");
    await config.close();
    assert.is(config.subscriptionObservers.length, 0);
});

avaTest("Get payload without triggering read()", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    const payload = config.payload;
    assert.true(is.plainObject(payload));
    assert.deepEqual(payload, Object.create(null));
});

avaTest("Constructor throw error 'configFilePath should be typeof <string>'", (assert) => {
    assert.throws(() => {
        new Config(10);
    }, { instanceOf: TypeError, message: "Config.constructor->configFilePath should be typeof <string>" });
});

avaTest("Constructor throw error 'configFilePath - file extension should be .json'", (assert) => {
    assert.throws(() => {
        new Config("test.txt");
    }, { instanceOf: Error, message: "Config.constructor->configFilePath - file extension should be .json or .toml" });
});

avaTest("Constructor throw error 'options should be instanceof Object prototype'", (assert) => {
    assert.throws(() => {
        new Config("./test.json", 150);
    }, { instanceOf: Error, message: "Config.constructor->options should be instanceof Object prototype" });
});

avaTest("Constructor throw error 'defaultSchema should be instanceof Object prototype'", (assert) => {
    const error = assert.throws(() => {
        new Config("./test.json", { defaultSchema: 150 });
    }, { instanceOf: Error, message: "Config.constructor->options defaultSchema should be instanceof Object prototype" });
});

avaTest("Can't set a new payload when config has not been read", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    assert.throws(() => {
        config.payload = {};
    }, { instanceOf: Error, message: "Config.payload - cannot set a new payload when the config has not been read yet!" });
});

avaTest("New (set) payload should be typeof <Object>", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);
    await config.read();

    assert.throws(() => {
        config.payload = 10;
    }, { instanceOf: TypeError, message: "Config.payload->newPayload should be typeof <Object>" });

    await config.close();
});

avaTest("Set a new payload that doesn't match the current Schema", async(test) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(test, config);
    await config.read();

    test.throws(() => {
        config.payload = { foo: 10 };
    }, {
        instanceOf: Error,
        message: "Config.payload - Failed to validate new configuration, err => property .foo should be string\n"
    });

    await config.close();
});

avaTest("formatAjvErrors return empty string when the argument is not an array", (assert) => {
    const result = formatAjvErrors(10);
    assert.true(is.string(result));
    assert.is(result, "");
});

avaTest("Zero configuration (with createOnNoEntry equal true)", async(assert) => {
    const cfgPath = join(__dirname, "zeroConfig.json");
    const config = new Config(cfgPath, {
        createOnNoEntry: true
    });
    CFG_TO_CLEAR.push(cfgPath);

    await config.read();
    await new Promise((resolve, reject) => {
        const tOut = setTimeout(reject, 1000);
        config.on("configWritten", () => {
            clearTimeout(tOut);
            resolve();
        });
        config.on("error", reject);
    });
    await access(cfgPath);

    await config.close();
    assert.pass();
});

avaTest("Create a configuration with noEntry (Should throw)", async(assert) => {
    const config = new Config(join(__dirname, "zeroConfig2.json"));

    await assert.throwsAsync(config.read(), { code: "ENOENT" });
});

avaTest("Read a config with a default Payload", async(assert) => {
    const defaultPayload = { test: "ooops" };
    const cfgPath = join(__dirname, "defaultPayload.json");

    const config = new Config(cfgPath, {
        createOnNoEntry: true
    });
    CFG_TO_CLEAR.push(cfgPath);

    await config.read(defaultPayload);
    await new Promise((resolve, reject) => {
        const tOut = setTimeout(reject, 1000);
        config.on("configWritten", () => {
            clearTimeout(tOut);
            resolve();
        });
        config.on("error", reject);
    });
    await access(cfgPath);
    assert.is(config.payload.test, "ooops");

    await config.close();
});

avaTest("Read a corrupted json", async(assert) => {
    const config = new Config(join(__dirname, "corrupted.json"), {
        createOnNoEntry: false,
        defaultSchema: configSchemaJSON
    });

    await assert.throwsAsync(config.read(), {
        instanceOf: Error,
        message: "Config.payload - Failed to validate new configuration, err => property .foo should be string\n"
    });
    assert.deepEqual(config.payload, Object.create(null));
    assert.is(config.configHasBeenRead, false);
});

avaTest("Read config with no default payload", async(assert) => {
    const cfgPath = join(__dirname, "noDataPayload.json");
    const config = new Config(cfgPath, {
        createOnNoEntry: true
    });
    CFG_TO_CLEAR.push(cfgPath);

    await config.read();
    assert.true(is.plainObject(config.payload));
    assert.deepEqual(config.payload, Object.create(null));

    await config.close();
});

avaTest("Reasign default payload", async(assert) => {
    const cfgPath = join(__dirname, "reRead.json");
    const config = new Config(cfgPath, {
        createOnNoEntry: true
    });
    CFG_TO_CLEAR.push(cfgPath);

    await config.read(jsonPayload);
    await new Promise((resolve, reject) => {
        const tOut = setTimeout(reject, 1000);
        config.on("configWritten", () => {
            clearTimeout(tOut);
            resolve();
        });
        config.on("error", reject);
    });
    await unlink(cfgPath);

    await config.read();
    assert.deepEqual(config.payload, jsonPayload);
    await new Promise((resolve, reject) => {
        const tOut = setTimeout(reject, 1000);
        config.on("configWritten", () => {
            clearTimeout(tOut);
            resolve();
        });
        config.on("error", reject);
    });
    await access(cfgPath);

    await config.close();
});

avaTest("Setup autoReload error before config has been read", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    assert.throws(() => {
        config.setupAutoReload();
    }, { instanceOf: Error, message: "Config.setupAutoReaload - cannot setup autoReload when the config has not been read yet!" });
});

avaTest("Setup autoReload twice for return", async(assert) => {
    const { config } = await createNewConfiguration({
        autoReload: true
    });
    assertConfigTypesAndValues(assert, config);

    await config.read();
    const ret = config.setupAutoReload();
    assert.is(ret, false);
    await config.close();
});

avaTest("Get config filedPath error before read", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    assert.throws(() => {
        config.get("foo");
    }, { instanceOf: Error, message: "Config.get - Unable to get a key, the configuration has not been initialized yet!" });
});

avaTest("Get config filedPath error without string", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    await config.read();
    assert.throws(() => {
        config.get(10);
    }, { instanceOf: TypeError, message: "Config.get->fieldPath should be typeof <string>" });
});

avaTest("Set config key error before read", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    assert.throws(() => {
        config.set("foo", "Hello");
    }, { instanceOf: Error, message: "Config.set - Unable to set a key, the configuration has not been initialized yet!" });
});

avaTest("Set config filedPath error without string", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    await config.read();
    assert.throws(() => {
        config.set(10);
    }, { instanceOf: TypeError, message: "Config.set->fieldPath should be typeof <string>" });
});

avaTest("Write on set", async(assert) => {
    const { config } = await createNewConfiguration({ writeOnSet: true });
    assertConfigTypesAndValues(assert, config);

    await config.read();
    assert.is(config.payload.foo, "world!");
    config.set("foo", "yopyop");

    await new Promise((resolve, reject) => {
        const tOut = setTimeout(reject, 1000);
        config.on("configWritten", () => {
            clearTimeout(tOut);
            resolve();
        });
        config.on("error", reject);
    });
    assert.is(config.payload.foo, "yopyop");
});

avaTest("Set a new value and writeOnDisk manually", async(assert) => {
    assert.plan(3);
    const { config } = await createNewConfiguration();

    await config.read();
    assert.is(config.payload.foo, "world!");
    config.set("foo", "yopyop");
    config.on("configWritten", () => {
        assert.pass();
    });
    await config.writeOnDisk();

    // Await one loop iteration (to be safe with the EventEmitter).
    await new Promise((resolve) => setImmediate(resolve));
    assert.is(config.payload.foo, "yopyop");
});

avaTest("Read a config with noEntry and wait for watcherInitializer", async(assert) => {
    assert.plan(4);
    const cfgPath = join(__dirname, "watcherDelay.json");
    const config = new Config(cfgPath, {
        createOnNoEntry: true,
        reloadDelay: 100,
        autoReload: true
    });
    CFG_TO_CLEAR.push(cfgPath);

    config.once("configWritten", () => {
        assert.pass();
    });
    config.once("watcherInitialized", () => {
        assert.pass();
    });
    await config.read();

    // wait 250ms
    await new Promise((resolve) => setTimeout(resolve, 250));
    config.once("reload", () => {
        assert.pass();
    });
    await writeFile(cfgPath, JSON.stringify({ hey: "oh" }));

    // wait 500ms
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.is(config.payload.hey, "oh");
    await config.close();
});

avaTest("Read defaultPayload should be a plainObject (if not undefined)", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    await assert.throwsAsync(config.read(10), {
        instanceOf: TypeError,
        message: "defaultPayload argument should be a plain JavaScript Object!"
    });
});

avaTest("Re-write configFile property after Config construction", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);
    config.configFile = undefined;

    await assert.throwsAsync(config.read(), {
        instanceOf: TypeError,
        message: "Config.read - configFile should be typeof <string>"
    });
});

avaTest("Write on disk error before read", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    await assert.throwsAsync(config.writeOnDisk(), {
        instanceOf: Error,
        message: "Config.writeOnDisk - Cannot write unreaded configuration on the disk"
    });
});

avaTest("observableOf fieldPath should be a string!", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    assert.throws(() => {
        config.observableOf(10);
    }, { instanceOf: TypeError, message: "Config.observableOf->fieldPath should be typeof <string>" });
});

avaTest("Can't close config if read has not been triggered before!", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    await assert.throwsAsync(config.close(), {
        instanceOf: Error,
        message: "Config.close - Cannot close unreaded configuration"
    });
});

avaTest("Can't lazyWriteDisk if config has not been read", async(assert) => {
    const { config } = await createNewConfiguration();
    assertConfigTypesAndValues(assert, config);

    assert.throws(() => {
        config.lazyWriteOnDisk();
    }, { instanceOf: Error, message: "Config.lazyWriteOnDisk - Cannot lazy write unreaded configuration on the disk" });
});

avaTest("Closed configuration should not be hot reloaded!", async(assert) => {
    const { config } = await createNewConfiguration({
        autoReload: true,
        reloadDelay: 50
    });
    config.on("reload", () => {
        assert.fail();
    });

    await config.read();
    config.set("foo", "world!");
    await config.writeOnDisk();

    await config.close();
    await new Promise((resolve) => setTimeout(resolve, 200));

    assert.pass();
});

avaTest("Config set invalid value", async(assert) => {
    const { config } = await createNewConfiguration({
        writeOnSet: true
    });
    assertConfigTypesAndValues(assert, config);

    await config.read();
    assert.throws(() => {
        config.set("foo", 10);
    }, {
        instanceOf: Error,
        message: "Config.payload - Failed to validate new configuration, err => property .foo should be string\n"
    });
});

avaTest("limitObjectDepth", (assert) => {
    // Return value if not plainObject
    const num = limitObjectDepth(5);
    assert.is(num, 5);

    // Return array of keys if depth is equal to 0
    const objKeys = limitObjectDepth({ keya: 0, keyb: 0 }, 0);
    assert.deepEqual(objKeys, ["keya", "keyb"]);

    const completeObj = {
        hey: "oh",
        depth: {
            keya: 0,
            keyb: {
                foo: "bar"
            }
        },
        arrV: [1, 2]
    };
    const limitedObj = limitObjectDepth(completeObj, 1);
    assert.deepEqual(limitedObj, {
        hey: "oh",
        depth: ["keya", "keyb"],
        arrV: [1, 2]
    });
});

avaTest("Test config as a SlimIO Core Mirror", async(assert) => {
    assert.plan(2);
    const cfgPath = join(__dirname, "coreMirror.json");
    const configObj = {
        addons: {
            cpu: {
                active: false,
                standalone: false
            }
        }
    };
    await writeFile(cfgPath, JSON.stringify(configObj, null, 4));
    CFG_TO_CLEAR.push(cfgPath);

    const config = new Config(cfgPath, {
        createOnNoEntry: true,
        writeOnSet: true,
        autoReload: true,
        reloadDelay: 500
    });

    let state = false;
    await config.read({
        hostname: os.hostname(),
        platform: os.platform(),
        release: os.release(),
        addons: {}
    });
    config.observableOf("addons.cpu").subscribe((curr) => {
        assert.is(curr.active, state);
        state = !state;
    }, console.error);

    config.set("addons.cpu.active", true);
    await new Promise((resolve, reject) => {
        setTimeout(reject, 1000);
        config.once("error", reject);
        config.once("configWritten", resolve);
    });

    await config.close();
});

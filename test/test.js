/* eslint no-new: off */

// Require Dependencies!
const avaTest = require("ava");
const is = require("@sindresorhus/is");
const Config = require("../src/config.class");
const { promisify } = require("util");
const {
    access,
    readFile,
    writeFile,
    unlink
} = require("fs");

// FS Async Wrapper
const FSAsync = {
    access: promisify(access),
    readFile: promisify(readFile),
    writeFile: promisify(writeFile),
    unlink: promisify(unlink)
};

const configSchemaJSON = {
    title: "Config",
    type: "object",
    properties: {
        foo: {
            type: "string"
        }
    },
    required: ["foo"]
};

const configJSON = {
    foo: "world!"
};

let count = 0;

avaTest.after.always("Guaranteed cleanup", async() => {
    // Promise all ?
    for (let num = 1; num < count + 1; num++) {
        await FSAsync.unlink(`./test/config${num}.schema.json`);
        await FSAsync.unlink(`./test/config${num}.json`);
    }
});

async function createFiles(options) {
    const num = ++count;
    await FSAsync.writeFile(
        `./test/config${num}.schema.json`,
        JSON.stringify(configSchemaJSON, null, 4)
    );
    await FSAsync.writeFile(
        `./test/config${num}.json`,
        JSON.stringify(configJSON, null, 4));

    return new Config(`./test/config${num}.json`, options);
}

function configTypeChecker(test, config, checkInitConfig = false) {
    test.is(is(config), "Object");
    test.is(is(config.createOnNoEntry), "boolean");
    test.is(is(config.autoReload), "boolean");
    test.is(is(config.autoReloadActivated), "boolean");
    test.is(is(config.reloadDelay), "number");
    test.is(is(config.writeOnSet), "boolean");
    test.is(is(config.configHasBeenRead), "boolean");
    test.is(is(config.subscriptionObservers), "Array");
    if (checkInitConfig) {
        test.is(config.createOnNoEntry, false);
        test.is(config.autoReload, false);
        test.is(config.autoReloadActivated, false);
        test.is(config.reloadDelay, 1000);
        test.is(config.writeOnSet, false);
        test.is(config.configHasBeenRead, false);
        test.deepEqual(config.subscriptionObservers, []);
    }
}

avaTest("Basic", async(test) => {
    const config = await createFiles();
    configTypeChecker(test, config, true);
    await config.read();
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "world!");
    await config.close();
});

avaTest("AutoReload", async(test) => {
    // Rewrite with writeFile function
    const options = {
        autoReload: true
    };
    const config = await createFiles(options);
    configTypeChecker(test, config);
    await config.read();
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "world!");

    config.set("foo", "Hello"); 
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "Hello");

    await config.close();
});

avaTest("Observable", async(te) => {
    const config = await createFiles();
    configTypeChecker(te, config);
    await config.read();
    te.is(is(config.payload), "Object");
    te.is(is(config.payload.foo), "string");
    te.is(config.payload.foo, "world!");

    const obs = config.observableOf("foo");
    let subbed = false;
    await new Promise((resolve) => {
        obs.subscribe((curr) => {
            if (curr === "Hello") {
                subbed = true;
                resolve();
            }
        });
        config.set("foo", "Hello");
        te.is(is(config.payload), "Object");
        te.is(is(config.payload.foo), "string");
        te.is(config.payload.foo, "Hello");
    });
    te.is(subbed, true);
    
    await config.close();
});

avaTest("Get Payload without read", async(te) => {
    const config = await createFiles();
    configTypeChecker(te, config);
    const payload = config.payload;
    te.is(payload, null);
});

avaTest("Constructor throw error 'configFilePath should be typeof <string>'", (test) => {
    const error = test.throws(() => {
        new Config(10);
    }, TypeError);
    test.is(error.message, "Config.constructor->configFilePath should be typeof <string>");
});

avaTest("Constructor throw error 'configFilePath - file extension should be .json'", (test) => {
    const error = test.throws(() => {
        new Config("test.txt");
    }, Error);
    test.is(error.message, "Config.constructor->configFilePath - file extension should be .json");
});

avaTest("Constructor .schema default config file", (test) => {
    const config = new Config("./test/config.schema.json");
    configTypeChecker(test, config);
});

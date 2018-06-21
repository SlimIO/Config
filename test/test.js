/* eslint no-new: off */
/* eslint max-len: off */

// Require Node.JS Dependencies
const {
    writeFile,
    unlink
} = require("fs").promises;

// Require Third-Party Dependencies!
const avaTest = require("ava");
const is = require("@sindresorhus/is");

// Require Internal Dependencies
const Config = require("../src/config.class");
const { formatAjvErrors } = require("../src/utils.js");


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
    const toDelete = [];
    for (let num = 1; num < count + 1; num++) {
        toDelete.push(unlink(`./test/config${num}.schema.json`));
        toDelete.push(unlink(`./test/config${num}.json`));
    }
    toDelete.push(unlink("./test/basicConfig.json"));
    toDelete.push(unlink("./test/basicConfig3.json"));
    toDelete.push(unlink("./test/basicConfig4.json"));
    toDelete.push(unlink("./test/defaultSchemaConfig1.json"));
    toDelete.push(unlink("./test/defaultSchemaConfig2.json"));

    await Promise.all(toDelete);
});

async function createFiles(options = {}) {
    const num = ++count;
    await writeFile(
        `./test/config${num}.schema.json`,
        JSON.stringify(configSchemaJSON, null, 4)
    );
    await writeFile(
        `./test/config${num}.json`,
        JSON.stringify(configJSON, null, 4)
    );

    return {
        num,
        config: new Config(`./test/config${num}.json`, options)
    };
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
    const { config } = await createFiles();
    configTypeChecker(test, config, true);
    await config.read();
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "world!");
    await config.close();
});

avaTest("Basic defaultSchema", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config, true);
    await config.read();
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "world!");
    await config.close();
});

avaTest("AutoReload by set", async(test) => {
    // Rewrite with writeFile function
    const options = {
        autoReload: true
    };
    const { config } = await createFiles(options);
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

avaTest("AutoReload by writeFile", async(test) => {
    const options = {
        autoReload: true
    };
    const { config, num } = await createFiles(options);
    configTypeChecker(test, config);
    await config.read();
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "world!");

    await new Promise(async(resolve) => {
        const newConfigJSON = { foo: "Hello" };
        config.on("reload", () => {
            test.is(is(config.payload), "Object");
            test.is(is(config.payload.foo), "string");
            test.is(config.payload.foo, "Hello");
            resolve();
        });
        await writeFile(`./test/config${num}.json`, JSON.stringify(newConfigJSON, null, 4));
    });
    await config.close();
});

avaTest("Observable", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    await config.read();
    test.is(is(config.payload), "Object");
    test.is(is(config.payload.foo), "string");
    test.is(config.payload.foo, "world!");

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
        test.is(is(config.payload), "Object");
        test.is(is(config.payload.foo), "string");
        test.is(config.payload.foo, "Hello");
    });
    test.is(config.subscriptionObservers.length, 1);
    test.is(subbed, true);
    await config.close();
});

avaTest("Get Payload without read", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    const payload = config.payload;
    test.deepEqual(payload, Object.create(null));
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

avaTest("Option Default Schema", async(test) => {
    const options = {
        defaultSchema: {
            title: "Config",
            type: "object",
            properties: {
                foo: {
                    type: "string"
                }
            },
            required: ["foo"]
        }
    };
    await writeFile(
        "./test/defaultSchemaConfig1.json",
        JSON.stringify(configJSON, null, 4)
    );
    const config = new Config("./test/defaultSchemaConfig1.json", options);
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

avaTest("Default Schema", async(test) => {
    await writeFile(
        "./test/defaultSchemaConfig2.json",
        JSON.stringify(configJSON, null, 4)
    );
    const config = new Config("./test/defaultSchemaConfig2.json");
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

avaTest("Set Payload: can't set a new payload when not been read", async(test) => {
    const newPayload = {
        foo: "test"
    };
    const { config } = await createFiles();
    configTypeChecker(test, config);
    const error = test.throws(() => {
        config.payload = newPayload;
    });
    test.is(error.message, "Config.payload - cannot set a new payload when the config has not been read yet!");
});

avaTest("Set Payload: newPayload should be typeof <Object>", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    await config.read();
    const error = test.throws(() => {
        config.payload = 10;
    });
    test.is(error.message, "Config.payload->newPayload should be typeof <Object>");
    await config.close();
});

avaTest("Set Payload which is not validate whit the schema", async(test) => {
    const newPayload = {
        foo: 10
    };
    const { config } = await createFiles();
    configTypeChecker(test, config);
    await config.read();
    const error = test.throws(() => {
        config.payload = newPayload;
    }, Error);
    test.is(error.message, "Config.payload - Failed to validate new configuration, err => property .foo should be string\n");
    await config.close();
});

avaTest("formatAjvErrors no param array error", (test) => {
    const result = formatAjvErrors(10);
    test.is(is(result), "string");
    test.is(result, "");
});

avaTest("Zero configuration", async(test) => {
    const options = {
        createOnNoEntry: true
    };
    const config = new Config("./test/basicConfig.json", options);
    configTypeChecker(test, config);
    await config.read();
    await config.close();
});

avaTest("Zero configuration without createOnNoEntry", async(test) => {
    const config = new Config("./test/basicConfig2.json");
    configTypeChecker(test, config);
    const error = await test.throws(config.read());
    test.is(is(error.errno), "number");
    test.is(is(error.code), "string");
    test.is(is(error.syscall), "string");
    test.is(error.errno, -4058);
    test.is(error.code, "ENOENT");
    test.is(error.syscall, "access");
});

avaTest("Read deafault payload", async(test) => {
    const options = {
        createOnNoEntry: true
    };
    const config = new Config("./test/basicConfig3.json", options);
    configTypeChecker(test, config);
    await config.read(configJSON);
    await config.close();
});

// Find another name ?
avaTest("Reasign default payload", async(test) => {
    const options = {
        createOnNoEntry: true
    };
    const config = new Config("./test/basicConfig4.json", options);
    configTypeChecker(test, config);
    await config.read(configJSON);
    await unlink("./test/basicConfig4.json");
    await config.read();
    await config.close();
});

avaTest("SetupAutoReaload error before read", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    const error = test.throws(() => {
        config.setupAutoReload();
    }, Error);
    test.is(error.message, "Config.setupAutoReaload - cannot setup autoReload when the config has not been read yet!");
});

avaTest("SetupAutoReaload twice for return", async(test) => {
    const options = {
        autoReload: true
    };
    const { config } = await createFiles(options);
    configTypeChecker(test, config);
    await config.read();
    config.setupAutoReload();
    await config.close();
});

avaTest("Get config filedPath error before read", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    const error = test.throws(() => {
        config.get("foo");
    }, Error);
    test.is(error.message, "Config.get - Unable to get a key, the configuration has not been initialized yet!");
});

avaTest("Get config filedPath error without string", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    await config.read();
    const error = test.throws(() => {
        config.get(10);
    }, TypeError);
    test.is(error.message, "Config.get->fieldPath should be typeof <string>");
});

avaTest("Set config key error before read", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    const error = test.throws(() => {
        config.set("foo", "Hello");
    }, Error);
    test.is(error.message, "Config.set - Unable to set a key, the configuration has not been initialized yet!");
});

avaTest("Set config filedPath error without string", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    await config.read();
    const error = test.throws(() => {
        config.set(10);
    }, TypeError);
    test.is(error.message, "Config.set->fieldPath should be typeof <string>");
});

avaTest("Write on set", async(test) => {
    const options = {
        writeOnSet: true
    };
    const { config } = await createFiles(options);
    configTypeChecker(test, config);
    await config.read();
    config.set("foo", "Hello");
});

avaTest("Write on disk error before read", async(test) => {
    const options = {
        writeOnSet: true
    };
    const { config } = await createFiles(options);
    configTypeChecker(test, config);
    const error = await test.throws(config.writeOnDisk());
    test.is(error.message, "Config.writeOnDisk - Cannot write unreaded configuration on the disk");
});

avaTest("Can't close config if read has not been triggered before!", async(test) => {
    const { config } = await createFiles();
    configTypeChecker(test, config);
    const error = await test.throws(config.close());
    test.is(error.message, "Config.close - Cannot close unreaded configuration");
});

// avaTest("Write on disk error invalid by ajv", async(test) => {
//     const options = {
//         writeOnSet: true
//     };
//     const { config } = await createFiles(options);
//     configTypeChecker(test, config);
//     await config.read();
//     const error = test.throws(config.set("foo", 10));
//     console.log(error);
//     test.is(error.message, "Config.writeOnDisk - Cannot write on the disk invalid config, err => ");
// });

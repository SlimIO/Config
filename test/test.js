// Require Dependencies!
const test = require("ava");
const is = require("@sindresorhus/is");
const Config = require("../src/config.class");
const { promisify } = require("util");
const {
    access,
    readFile,
    writeFile,
    unlink,
    constants: { R_OK, W_OK }
} = require("fs");

// FS Async Wrapper
const FSAsync = {
    access: promisify(access),
    readFile: promisify(readFile),
    writeFile: promisify(writeFile),
    unlink: promisify(unlink)
};

const configSchemaJSON = {
    "title": "Config",
    "type": "object",
    "properties": {
        "foo": {
            "type": "string"
        }
    },
    "required": ["foo"]
};

const configJSON = {
    "foo": "world!"
};

let count = 0;

test.after.always('guaranteed cleanup', async t => {
    for(let i = 1; i < count+1; i++){
        await FSAsync.unlink(`./test/config${i}.schema.json`);
        await FSAsync.unlink(`./test/config${i}.json`);
    }
});

async function createFiles(options){
    const num = ++count;
    await FSAsync.writeFile(`./test/config${num}.schema.json`, JSON.stringify(configSchemaJSON, null, 4));
    await FSAsync.writeFile(`./test/config${num}.json`, JSON.stringify(configJSON, null, 4));
    return new Config(`./test/config${num}.json`, options);
}

function configTypeChecker(t, config, checkInitConfig = false){
    t.is(is(config), "Object");
    t.is(is(config.createOnNoEntry), "boolean");
    t.is(is(config.autoReload), "boolean");
    t.is(is(config.autoReloadActivated), "boolean");
    t.is(is(config.reloadDelay), "number");
    t.is(is(config.writeOnSet), "boolean");
    t.is(is(config.configHasBeenRead), "boolean");
    t.is(is(config.subscriptionObservers), "Array");
    if(checkInitConfig){
        t.is(config.createOnNoEntry, false);
        t.is(config.autoReload, false);
        t.is(config.autoReloadActivated, false);
        t.is(config.reloadDelay, 1000);
        t.is(config.writeOnSet, false);
        t.is(config.configHasBeenRead, false);
        t.deepEqual(config.subscriptionObservers, []);
    }
}

test("Basic", async t => {
    const config = await createFiles();
    configTypeChecker(t, config, true);
    await config.read();
    t.is(is(config.payload), "Object");
    t.is(is(config.payload.foo), "string");
    t.is(config.payload.foo, "world!");
    await config.close();
});

test("AutoReload", async t => {
    // Rewrite with writeFile function
    const options = {
        autoReload : true
    };
    const config = await createFiles(options);
    configTypeChecker(t, config);
    await config.read();
    t.is(is(config.payload), "Object");
    t.is(is(config.payload.foo), "string");
    t.is(config.payload.foo, "world!");

    config.set("foo", "Hello"); 
    t.is(is(config.payload), "Object");
    t.is(is(config.payload.foo), "string");
    t.is(config.payload.foo, "Hello");

    await config.close();
});

test("Observable", async t => {
    const config = await createFiles();
    configTypeChecker(t, config);
    await config.read();
    t.is(is(config.payload), "Object");
    t.is(is(config.payload.foo), "string");
    t.is(config.payload.foo, "world!");

    const obs = config.observableOf("foo");
    let subbed = false;
    await new Promise((resolve) => {
        obs.subscribe( (curr) => {
            if(curr === "Hello"){
                subbed = true;
                resolve();
            }
        });
        config.set("foo", "Hello");
        t.is(is(config.payload), "Object");
        t.is(is(config.payload.foo), "string");
        t.is(config.payload.foo, "Hello");
    });
    t.is(subbed, true);
    
    await config.close();
});

test("Get Payload without read", async t => {
    const config = await createFiles();
    configTypeChecker(t, config);
    const payload = config.payload;
    t.is(payload, null);
});

test("Constructor throw error 'configFilePath should be typeof <string>'", t => {
    const error = t.throws(() => {
        new Config(10, options);
    }, Error);
    console.log(error);
    // t.is(error);
});
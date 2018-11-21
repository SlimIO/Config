# Config

[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/SlimIO/Config/commit-activity)
[![GitHub license](https://img.shields.io/github/license/Naereen/StrapDown.js.svg)](https://github.com/SlimIO/Config/blob/master/LICENSE)
[![Known Vulnerabilities](https://snyk.io/test/github/SlimIO/Config/badge.svg?targetFile=package.json)](https://snyk.io/test/github/SlimIO/Config?targetFile=package.json)

SlimIO - Reactive JSON Config loader

## Features

- Hot-reloading of configuration
- Reactive with observable key(s)
- Safe with [JSON Schema](https://json-schema.org/) validation

## Getting Started

This package is available in the Node Package Repository and can be easily installed with [npm](https://docs.npmjs.com/getting-started/what-is-npm) or [yarn](https://yarnpkg.com).

```bash
$ npm i @slimio/config
# or
$ yarn add @slimio/config
```

## Usage example

Create a simple json file for your project (As below)

```json
{
    "loglevel": 5,
    "logsize": 4048,
    "login": "administrator"
}
```

Now, create a new Configuration instance and read it

```js
const Config = require("@slimio/config");

async function main() {
    const cfg = new Config("./path/to/config.json");
    await cfg.read();
    console.log(cfg.get("loglevel")); // stdout: 5

    // Observe (with an Observable Like) the update made to login property
    cfg.observableOf("login").subscribe(console.log);
    cfg.set("login", "admin");

    await cfg.close();
}
main().catch(console.error);
```

## Events
Configuration class is extended by a Node.js EventEmitter. The class can trigger several events:

| event name | description |
| --- | --- |
| configWritten | The configuration payload has been written on the local disk |
| watcherInitialized | The file watcher has been initialized (it will hot reload the configuration on modification) |
| reload | The configuration has been hot reloaded successfully |
| close | Event triggered when the configuration is asked to be closed |

## API

### constructor<T>(configFilePath: string, options?: Config.ConstructorOptions)
Create a new Configuration instance
```js
const cfg = new Config("./path/to/file.json", {
    createOnNoEntry: true,
    autoReload: true
});
```

Available options are:

| name | type | default value | description |
| --- | --- | --- | --- |
| createOnNoEntry | boolean | false | Create the file with default payload value if he doesn't exist on the local disk |
| writeOnSet | boolean | false | Write the file on the disk after each time .set() is called |
| autoReload | boolean | false | Setup hot reload of the configuration file |
| reloadDelay | number | 500ms | The delay to wait before hot reloading the configuration, it's a security to avoid event spamming |
| defaultSchema | plainObject | null | The default JSON Schema for the configuration |

> **Note**: When no schema is provided, it will search for a file prefixed by `.schema` with the same config name.

### read(defaultPayload?: T): Promise< this >;
Will trigger and read the local configuration (on disk). A default `payload` value can be provided in case the file doesn't exist !

```js
const cfg = new Config("./path/to/file.json");
assert.equal(cfg.configHasBeenRead, false); // true
await cfg.read();
assert.equal(cfg.configHasBeenRead, true); // true
```

Retriggering the method will made an hot-reload of all properties. For a cold reload you will have to close the configuration before.

> **Warning** When the file doesn't exist, the configuration is written at the next loop iteration (with lazyWriteOnDisk).

<p align="center">
    <img src="https://i.imgur.com/uMY4DZV.png" height="500">
</p>

### setupAutoReload(): void;
Setup hot reload (with a file watcher). This method is automatically triggered if the Configuration has been created with the option `autoReload` set to true.

We use the package [node-watch](https://www.npmjs.com/package/node-watch) to achieve the hot reload.

### get<H>(fieldPath: string, depth?: number): H
Get a value from a key (field path).

For example, image a json file with a `foo` field.
```js
const cfg = new Config("./path/to/file.json");
await cfg.read();
const fooValue = cfg.get("foo");
```

> Under the hood the method work with `lodash.get` function.

### set<H>(fieldPath: string, fieldValue: H): void;
Set a given field in the configuration.

```js
const cfg = new Config("./config.json", {
    createOnNoEntry: true
});

await cfg.read({ foo: "bar" });
cfg.set("foo", "hello world!");
await cfg.writeOnDisk();
```

> Under the hood the method work with `lodash.set` function.

### observableOf(fieldPath: string, depth?: number): ObservableLike;
Observe a given configuration key with an Observable Like object!

```js
const { writeFile } = require("fs").promises;
const cfg = new Config("./config.json", {
    autoReload: true,
    createOnNoEntry: true
});
await cfg.read({ foo: "bar" });

// Observe initial and next value(s) of foo
cfg.observableOf("foo").subscribe(console.log);

// Re-write local config file
const newPayload = { foo: "world" };
await writeFile("./config.json", JSON.stringify(newPayload, null, 4));
```

### writeOnDisk(): Promise< void >
Write the configuration on the disk.

### lazyWriteOnDisk(): void
Write the configuration on the disk (only at the next event-loop iteration). Use the event `configWritten` to known when the configuration will be written.

```js
const cfg = new Config("./config.json", {
    createOnNoEntry: true
});
await cfg.read();
cfg.once("configWritten", () => {
    console.log("Configuration written!");
});
cfg.lazyWriteOnDisk();
```

### close(): Promise< void >
Close (and write on disk) the configuration (it will close the watcher and complete/clean all active observers subscribers).

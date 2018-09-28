# Config

[![Maintenance](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://github.com/SlimIO/Config/commit-activity)
[![GitHub license](https://img.shields.io/github/license/Naereen/StrapDown.js.svg)](https://github.com/SlimIO/Config/blob/master/LICENSE)

SlimIO - Reactive JSON Config loader

## Features

- Hot-reloading of configuration
- Reactive with observable key(s)
- Safe with JSON Schema validation

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

Now create a new Configuration instance and read it

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
Configuration Class have many events to warn developer when things happen:

| event name | description |
| --- | --- |
| configWritten | The configuration payload has been written on the local disk |
| watcherInitialized | The file watcher has been initialized (it will hot reload the configuration on modification) |
| reload | The configuration has been hot reloaded successfully |

## API

### constructor<T>(configFilePath: string, options?: Config.ConstructorOptions)
Create a new Configuration instance
```js
const options = { autoReload: true };
const cfg = new Config("./path/to/file.json", options);
```

Available options are
```ts
interface ConstructorOptions {
    createOnNoEntry?: boolean;
    writeOnSet?: boolean;
    autoReload?: boolean;
    reloadDelay?: number;
    defaultSchema?: object;
}
```

### read(defaultPayload?: T): Promise< this >;
Will trigger and read the local configuration (on disk).

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

### get<H>(fieldPath: string): H
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

### observableOf(fieldPath: string): ObservableLike;
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

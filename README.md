# Config
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

Create a simple config file for your project (take this example)

```json
{
    "loglevel": 5,
    "logsize": 4048,
    "login": "administrator"
}
```

Install and use our package like this to recover values (with commonjs).

```js
const Config = require("@slimio/config");

async function main() {
    const myConfig = new Config("./path/to/config.json");
    await myConfig.read();

    console.log(myConfig.get("loglevel"));
}
main().catch(console.error);
```

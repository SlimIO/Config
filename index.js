const Config = require("./src/config.class");

async function main() {
    const cfg = new Config("./tests/conig.json", {
        createOnStart: true,
        autoReload: true
    });
    await cfg.read({
        foo: "hello world!"
    });
}
main().catch(console.error);

const Config = require("./src/config.class");

async function main() {
    const cfg = new Config("./tests/config.json", {
        createOnStart: true,
        autoReload: true
    });
    await cfg.read();
    console.log(cfg.payload);
    cfg.set("foo.mdr", "mdr");
    console.log(cfg.payload);
    await cfg.close();
}
main().catch(console.error);

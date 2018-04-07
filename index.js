const Config = require("./src/config.class");
const { writeFile } = require("fs");
const { promisify } = require("util");
const writeFileAsync = promisify(writeFile);

async function main() {
    const cfg = new Config("./tests/config.json", {
        autoReload: true,
        reloadDelay: 200
    });
    await cfg.read();
    cfg.observeKey("foo").subscribe(
        (keyValue) => console.log(`foo curr value => ${keyValue}`),
        console.error,
        () => console.log("completed!")
    );
    await writeFileAsync("./tests/config.json", JSON.stringify({
        foo: "world!"
    }, null, 4));
    setTimeout(() => {
        cfg.close();
    }, 1000);
}
main().catch(console.error);

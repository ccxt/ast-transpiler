// jest transform: TS and the ESM-only typescript@7 package -> CJS via esbuild (ts-jest needs the TS6 compiler API)
const { transformSync } = require("esbuild");
const { pathToFileURL } = require("url");

module.exports = {
    process(sourceText, sourcePath) {
        const { code, map } = transformSync(sourceText, {
            loader: sourcePath.endsWith(".ts") ? "ts" : "js",
            format: "cjs",
            target: "node18",
            sourcemap: "inline",
            sourcefile: sourcePath,
            define: { "import.meta.url": JSON.stringify(pathToFileURL(sourcePath).href), "import.meta.resolve": "undefined" },
        });
        return { code, map };
    },
};

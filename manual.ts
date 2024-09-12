import { Transpiler } from './src/transpiler.js';
import * as fs from 'fs';
import { IInput } from './src/types.js';

const { readFileSync, writeFileSync } = fs;

const transpiler = new Transpiler({
    python: {
        uncamelcaseIdentifiers: true,
    },
    php:  {
        uncamelcaseIdentifiers: true,
},
    csharp: {
        parser: {
            "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
            "ELEMENT_ACCESS_WRAPPER_CLOSE": ")",
            'VAR_TOKEN': 'var',
        }
    },
    go: {
        wrapThisCalls: false,
        wrapCallMethods: ["name", "f"]
    }
});

function customPropAssignment(node, identation) {
    return "";
}

transpiler.csharpTranspiler.printCustomRightSidePropertyAssignment = customPropAssignment;

transpiler.setPHPPropResolution(['super', 'Precise']);

transpiler.setPythonStringLiteralReplacements({
    'sha256': 'hashlib.sha256',
});

const file = "tmp.ts";

const i = 0;
// // while (i < 150) {
//     const pythonRes = transpiler.transpilePythonByPath(file);
//     const php = transpiler.transpilePhpByPath(file);
//     // const csharp = transpiler.transpileCSharpByPath(file);
//     // i++;
// // }

// const phpRes = `<?php\n${php.content}\n?>`;

// transpiler.setPhpAsyncTranspiling(false);
// const phpSyncRes = `<?php\n${transpiler.transpilePhpByPath(file).content}\n?>`;

// transpiler.setPythonAsyncTranspiling(false);
// const pythonSync = transpiler.transpilePythonByPath(file).content;

const config = [
    // {
    //     language: "php",
    //     async: true
    // },
    // {
    //     language: "php",
    //     async: false
    // },
    // {
    //     language: "python",
    //     async: false
    // },

    {
        language: "csharp",
        async: true
    },

    {
        language: "python",
        async: true
    },
    {
        language: "php",
        async: true
    },
    {
        language: "go",
        async: true
    },
]

const result = transpiler.transpileDifferentLanguagesByPath(config as any, file);

const phpRes = `<?php\n${result[2].content}\n?>`;
// const phpSyncRes = `<?php\n${result[1].content}\n?>`;
// const pythonSync = result[2].content;
const pythonAsync = result[1].content;

const csharp = result[0].content;
const PHP_OUTPUT = "./out/output.php";
const PHP_SYNC_OUTPUT = "./out/output-sync.php";
const PYTHON_OUTPUT = "./out/output.py";
const PYTHON_SYNC_OUTPUT = "./out/output-sync.py";
const CSHARP_OUTPUT = "./out/output.cs";

const GO_OUTPUT = "./out/output.go";
const go = result[3].content;

writeFileSync(PHP_OUTPUT, phpRes);
// // writeFileSync(PYTHON_OUTPUT, pythonRes.content ?? "");
writeFileSync(PYTHON_OUTPUT, pythonAsync ?? "");
// writeFileSync(PYTHON_SYNC_OUTPUT, pythonSync ?? "");
// writeFileSync(PHP_SYNC_OUTPUT, phpSyncRes);

writeFileSync(CSHARP_OUTPUT, csharp);
writeFileSync(GO_OUTPUT, go);

console.log("TRANSPILED!!");



import { Transpiler } from '../../src/transpiler.js';
import * as fs from 'fs';
import { exec } from "node:child_process";
import { green, yellow, red } from "colorette";
const { readFileSync, writeFileSync } = fs;

const TS_TRANSPILABLE_FILE = "./tests/integration/source/transpilable.ts";
const PY_TRANSPILABLE_FILE = "./tests/integration/py/transpilable.py";
const PHP_TRANSPILABLE_FILE = "./tests/integration/php/transpilable.php";
const CS_TRANSPILABLE_FILE = "./tests/integration/cs/transpilable.cs";
const CPP_TRANSPILABLE_FILE = "./tests/integration/cpp/transpilable.cpp";

const TS_FILE = "./tests/integration/source/init.ts";
const PY_FILE = "./tests/integration/py/init.py";
const PHP_FILE = "./tests/integration/php/init.php";
const CS_FILE = "./tests/integration/cs";
const CPP_FILE = "./tests/integration/cpp/helpers.cpp";

const langConfig = [
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
        language: "cpp",
        async: true
    },
]

function transpileTests() {
    const parseConfig = {
        "verbose": false,
        "csharp": {
            "parser": {
                "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
                "ELEMENT_ACCESS_WRAPPER_CLOSE": ")",
            }
        },
    }
    const transpiler = new Transpiler(parseConfig);
    const result = transpiler.transpileDifferentLanguagesByPath(langConfig as any, TS_TRANSPILABLE_FILE);

    let phpRes = `<?php\nfunction custom_echo($x){ echo (string)$x . "\n";}\n${result[2].content}\n?>` as string;
    phpRes = (phpRes as any).replaceAll('var_dump', 'custom_echo');
    const pythonAsync = result[1].content;
    let csharp = 'namespace tests;\n' + result[0].content;
    csharp = csharp.replace('class Test', 'partial class Test');

    const cppImports = [
        '#include <iostream>',
        '#include <any>',
        '#include <string>',
        '#include <vector>',
        '#include "helpers.h"',
        '',
        '',
    ]

    const cppContent = cppImports.join('\n') + result[3].content;

    writeFileSync(PHP_TRANSPILABLE_FILE, phpRes.toString());
    writeFileSync(PY_TRANSPILABLE_FILE, pythonAsync);
    writeFileSync(CS_TRANSPILABLE_FILE, csharp);
    writeFileSync(CPP_TRANSPILABLE_FILE, cppContent);
}

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (stderr !== undefined || stderr !== null) {
                stderr = stderr.replace('Debugger attached.\nWaiting for the debugger to disconnect...\n', '');
            }
            if (error) {
                reject(error);
                return;
            }
            if (stderr) {
                reject(stderr);
                return;
            }
            resolve(stdout.trim());
        });
    });
}

async function runTS() {
    const command = "node --no-warnings --loader ts-node/esm " + TS_FILE;
    const result = await runCommand(command);
    return result;
}

async function runPHP() {
    const command = "php " + PHP_FILE;
    const result = await runCommand(command);
    return result;
}

async function runPy() {
    const command = "python3 " + PY_FILE;
    const result = await runCommand(command);
    return result;
}

async function runCS() {
    const buildCommand = "dotnet build " + CS_FILE;
    await runCommand(buildCommand);
    const command = "dotnet run --project " + CS_FILE + '/cs.csproj';
    const result = await runCommand(command);
    return result;
}

async function main() {
    transpileTests();

    const promises = [
        runTS(),
        runPHP(),
        runPy(),
        runCS()
    ];
    const results = await Promise.all(promises);
    const [ts, php, py, cs] = results;

    let success = true;
    if (php !== ts) {
        success = false;
        console.log(red("PHP and TS outputs are not equal"));
    }
    if (py !== ts) {
        success = false;
        console.log(red("Python and TS outputs are not equal"));
    }
    if (cs !== ts) {
        success = false;
        console.log(red("C# and TS outputs are not equal"));
    }

    if (success) {
        console.log(green("Integration test passed!"));
    }

}

main()
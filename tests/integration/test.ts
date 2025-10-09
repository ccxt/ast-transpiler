import { Transpiler } from '../../src/transpiler.js';
import * as fs from 'fs';
import { exec } from "node:child_process";
import { green, yellow, red, blue } from "colorette";
const { readFileSync, writeFileSync } = fs;

const TS_TRANSPILABLE_FILE = "./tests/integration/source/transpilable.ts";
const PY_TRANSPILABLE_FILE = "./tests/integration/py/transpilable.py";
const PHP_TRANSPILABLE_FILE = "./tests/integration/php/transpilable.php";
const CS_TRANSPILABLE_FILE = "./tests/integration/cs/transpilable.cs";
const GO_TRANSPILABLE_FILE = "./tests/integration/go/transpilable.go";
const JAVA_TRANSPILABLE_FILE = "./tests/integration/java/app/src/main/java/org/example/Transpilable.java";


const TS_FILE = "./tests/integration/source/init.ts";
const PY_FILE = "./tests/integration/py/init.py";
const PHP_FILE = "./tests/integration/php/init.php";
const CS_FILE = "./tests/integration/cs";
const GO_FILE = "./tests/integration/go";
const JAVA_FILE = "./tests/integration/java/"


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
        language: "go",
        async: true
    },
    {
        language: "java",
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

    const java = `package org.example;\n` + result[4].content;

    const goImports = [
        '\n',
        'import (',
        '    "fmt"',
        ')',
        '\n'
    ].join('\n');
    const go = 'package main\n' + goImports + result[3].content;

    writeFileSync(PHP_TRANSPILABLE_FILE, phpRes.toString());
    writeFileSync(PY_TRANSPILABLE_FILE, pythonAsync);
    writeFileSync(CS_TRANSPILABLE_FILE, csharp);
    writeFileSync(GO_TRANSPILABLE_FILE, go);
    writeFileSync(JAVA_TRANSPILABLE_FILE, java);
}

function runCommand(command) {
    return new Promise((resolve, reject) => {
        exec(command, (error, stdout, stderr) => {
            if (stderr !== undefined || stderr !== null) {
                stderr = stderr.replace('Debugger attached.\nWaiting for the debugger to disconnect...\n', '');
            }
            if (stderr.startsWith("Debugger listening") && stderr.includes("For help, see: https://nodejs.org/en/docs/inspector")) {
                stderr = undefined;
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
    console.log(blue("Executed TS"))
    return result;
}

async function runPHP() {
    const command = "php " + PHP_FILE;
    const result = await runCommand(command);
    console.log(blue("Executed PHP"))
    return result;
}

async function runPy() {
    const command = "python3 " + PY_FILE;
    const result = await runCommand(command);
    console.log(blue("Executed PY"))
    return result;
}

async function runCS() {
    const buildCommand = "dotnet build " + CS_FILE;
    await runCommand(buildCommand);
    const command = "dotnet run --project " + CS_FILE + '/cs.csproj';
    const result = await runCommand(command);
    console.log(blue("Executed CS"))
    return result;
}

async function runGO() {
    const buildCommand = "go build " + GO_FILE;
    await runCommand(buildCommand);
    const command = "go run " + GO_FILE;
    const result = await runCommand(command);
    console.log(blue("Executed GO"))
    return result;
}

async function runJava() {
    // ./tests/integration/java/gradlew -p ./tests/integration/java/ run
    const buildCommand = JAVA_FILE + "gradlew -p" + JAVA_FILE + " build";
    await runCommand(buildCommand);
    const run = JAVA_FILE + "gradlew -p" + JAVA_FILE + "-q --console=plain run";
    const result = await runCommand(run);
    console.log(blue("Executed JAVA"))
    return result;
}

async function main() {
    transpileTests();

    const promises = [
        runTS(),
        runPHP(),
        runPy(),
        runCS(),
        runGO(),
        runJava(),
    ];
    const results = await Promise.all(promises);
    const [ts, php, py, cs, go, java]: any = results;

    let success = true;
    if (php !== ts) {
        success = false;
        compareOutputs("PHP", ts, php);
    }
    if (py !== ts) {
        success = false;
        compareOutputs("PY", ts, py);
    }
    if (cs !== ts) {
        success = false;
        compareOutputs("CS", ts, cs);
    }

    if (go !== ts) {
        success = false;
        compareOutputs("GO", ts, go);
    }

    if (java !== ts) {
        success = false;
        compareOutputs("JAVA", ts, java);
    }

    if (success) {
        console.log(green("Integration tests passed!"));
    }
}


function compareOutputs(language: string, tsOutput: string, output: string) {
    if (tsOutput !== output) {
        console.log(red(`${language} and TS outputs are not equal`));
        console.log(yellow("TS output:"));
        console.log(tsOutput);
        console.log(yellow(`${language} output:`));
        console.log(output);
    }
}

main()
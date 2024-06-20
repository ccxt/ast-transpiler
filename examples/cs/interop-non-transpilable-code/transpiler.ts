
// Small POC showcasing how this library can be applied to real-world libraries
// where not every code is transpilable

import { Transpiler } from '../../../src/transpiler.js';
import { writeFileSync } from 'fs';

import { fileURLToPath, pathToFileURL } from 'url';
const __dirname = fileURLToPath (new URL ('.', import.meta.url));

const FILE_INPUT = __dirname + "/input/index.ts";
const FILE_OUTPUT = __dirname + "/output/index.cs";

const transpiler = new Transpiler({
    csharp: {
        parser: {
            "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
            "ELEMENT_ACCESS_WRAPPER_CLOSE": ")"
        }  
    }
});


const transpiledCode = transpiler.transpileCSharpByPath(FILE_INPUT);

// handle imports (here we're making use of namespaces to access the method so there is not much to do)
const imports = transpiledCode.imports;
console.log(imports);

let requireStr = "";
imports.forEach(imp => {
    // custom logic to resolve ts->php imports
    if (imp.path === "./nonTranspilableHelper.js" && imp.name === 'nonTranspilableFeature') {
        requireStr = "using Helpers;"
    }
})


const finalCode = requireStr + '\n\n' + transpiledCode.content;

writeFileSync(FILE_OUTPUT, finalCode);
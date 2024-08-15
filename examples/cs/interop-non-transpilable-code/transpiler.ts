
// Small POC showcasing how this library can be applied to real-world libraries
// where not every code is transpilable

import { Transpiler } from '../../../src/transpiler.js';
import { writeFileSync } from 'fs';

const transpiler = new Transpiler({
    csharp: {
        parser: {
            "ELEMENT_ACCESS_WRAPPER_OPEN": "getValue(",
            "ELEMENT_ACCESS_WRAPPER_CLOSE": ")"
        }  
    }
});

const FILE_INPUT = "./input/index.ts";
const FILE_OUTPUT = "./output/index.cs";

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
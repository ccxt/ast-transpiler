
// Small POC showcasing how this library can be applied to real-world libraries
// where not every code is transpilable

import { Transpiler } from '../../../src/transpiler.js';
import { writeFileSync } from 'fs';

const transpiler = new Transpiler({
    python: {
        uncamelcaseIdentifiers: true,   
    }
});

const FILE_INPUT = "./input/index.ts";
const FILE_OUTPUT = "./output/index.py";

const transpiledCode = transpiler.transpilePythonByPath(FILE_INPUT);

// handle imports
const imports = transpiledCode.imports;
let importsStr = "";
imports.forEach(imp => {
    let impName = "";
    let impPackage = "";
    // custom logic to resolve ts->py imports
    if (imp.name === 'nonTranspilableFeature') {
        impName = "non_transpilable_feature"
    } 
    if (imp.path === "./nonTranspilableHelper.js") {
        impPackage = "helper"
    }
    importsStr+= `from ${impPackage} import ${impName}\n`;
})

const finalCode = importsStr + '\n\n' + transpiledCode.content;

writeFileSync(FILE_OUTPUT, finalCode);
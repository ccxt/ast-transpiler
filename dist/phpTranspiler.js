import { BaseTranspiler } from "./pureAst.js";
import ts from 'typescript';
const SyntaxKind = ts.SyntaxKind;
const filename = "tmp.ts";
const program = ts.createProgram([filename], {});
const sourceFile = program.getSourceFile(filename);
const typeChecker = program.getTypeChecker();
global.src = sourceFile;
global.checker = typeChecker;
const config = {
    'ELSEIF_TOKEN': 'else if',
    'THIS_TOKEN': '$this',
    'AMPERSTAND_APERSAND_TOKEN': '&&',
    'BAR_BAR_TOKEN': '||',
    'TRUE_KEYWORD': 'true',
    'FALSE_KEYWORD': 'false',
    'PROPERTY_ACCESS_TOKEN': '->',
    'UNDEFINED_TOKEN': 'null',
    'IF_COND_CLOSE': ')',
    'IF_COND_OPEN': '(',
    'IF_OPEN': '{',
    'IF_CLOSE': '}',
    'NOT_TOKEN': '!',
    'ELSE_OPEN_TOKEN': '{',
    'ELSE_CLOSE_TOKEN': '}',
};
export class PhpTranspiler extends BaseTranspiler {
    constructor() {
        super(config);
        this.initConfig();
    }
    getIdentifierValueKind(identifier) {
        var _a;
        const idValue = (_a = identifier.text) !== null && _a !== void 0 ? _a : identifier.escapedText;
        if (idValue === "undefined") {
            return this.UNDEFINED_TOKEN;
        }
        return "$" + idValue; // check this later
    }
    initConfig() {
    }
}
// const transpiler = new PhpTranspiler();
// const res = transpiler.printNode(sourceFile)
// console.log(res)

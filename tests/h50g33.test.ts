import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/transpiler';

let run = 0;
const BASE =
    'export type Str = string | undefined;\n' +
    'export type Dict = { [key: string]: any };\n' +
    'export class Exchange {\n' +
    "    id: string = 'x';\n" +
    '    has: Dict = {};\n' +
    '    safeBool (o: any, k: any, d: any = undefined): boolean { return d; }\n' +
    '    outcomeSearchQuery (outcomeSymbol: string): Str {\n' +
    "        if (outcomeSymbol.indexOf ('0x') === 0) {\n" +
    '            return undefined;\n' +
    '        }\n' +
    "        const words: string[] = outcomeSymbol.split ('_');\n" +
    "        return words.join (' ');\n" +
    '    }\n' +
    '    other (v: any): any { return v; }\n' +
    '}\n';
const printFile = (file: string, members: string): string => {
    run += 1;
    const root = path.join (__dirname, 'files', 'tmp-h50g33', 'r' + run, 'ts', 'src');
    fs.mkdirSync (path.join (root, 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
    fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + members + '\n}\n');
    const t = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 }, asyncMethodSuffix: 'Async' } });
    for (const f of [ installCcxtGoHooks, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ]) {
        (f as any) (t.goTranspiler);
    }
    return t.transpileGoByPath (path.join (root, file)).content;
};

describe ('h50g33: outcomeSearchQuery (: Str) joins the *string base family', () => {
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h50g33'), { recursive: true, force: true }));
    test ('base method prints a *string signature, nil path kept', () => {
        const out = printFile (path.join ('base', 'Exchange.ts'), '');
        expect (out).toMatch (/OutcomeSearchQuery\(outcomeSymbol \w+\) \*string \{/);
        expect (out).toContain ('return nil');
    });
    test ('venue nil test of the call', () => {
        const out = printFile ('venue.ts', '    a (s: string) {\n        if (this.outcomeSearchQuery (s) === undefined) {\n            return 1;\n        }\n        const q = this.outcomeSearchQuery (s);\n        if ((q !== undefined) && this.safeBool (this.has, \'x\', false)) {\n            return { \'query\': q };\n        }\n        return 2;\n    }\n');
        expect (out).toContain ('var q *string = this.OutcomeSearchQuery(s)');
        expect (out).not.toContain ('var q any');
    });
});

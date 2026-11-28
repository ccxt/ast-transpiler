import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a virtual-dispatch parse call (printed `<-this.callInternal("parseX", ..)`) whose Go return is a proven
// container types the local it initialises; an unproven or non-container callee keeps the box.
describe ('go virtual-dispatch parse results bound to locals', () => {
    const HEAD = 'type Dict = { [key: string]: any };\nclass Exchange {\n'
        + '    parseBorrowRate (info: any, currency: any = undefined): Dict { return {}; }\n'
        + '    parseCurrency (raw: Dict): Dict { return {}; }\n'
        + '    parseIncome (info: Dict, market: any = undefined): object { return {}; }\n'
        + '    parseNumbers (x: any): any { return x; }\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        t.goTranspiler.wrapCallMethods = [ 'parseBorrowRate', 'parseCurrency', 'parseIncome', 'parseNumbers' ];
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g46-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'x.ts');
            fs.writeFileSync (file, HEAD + '    run (arr: any[]) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test ('a proven map parser types its local (fails on the base printer)', () => {
        const out = print ('const result = [];\nfor (let i = 0; i < arr.length; i++) {\n    const borrowRate = this.parseBorrowRate (arr[i]);\n    result.push (borrowRate);\n}\nreturn result;');
        expect (out).toContain ('var borrowRate map[string]any = <-this.callInternal("parseBorrowRate"');
    });
    test ('a nil test of the typed local prints the native comparison', () => {
        const out = print ('const parsed = this.parseCurrency (arr[0]);\nif (parsed === undefined) {\n    return undefined;\n}\nreturn parsed;');
        expect (out).toContain ('var parsed map[string]any = <-this.callInternal("parseCurrency"');
        expect (out).not.toContain ('IsEqual(parsed, nil)');
    });
    test ('a parser the Go interface leaves `any` keeps the box', () => {
        const out = print ('const parsed = this.parseIncome (arr[0]);\nreturn parsed;');
        expect (out).toContain ('var parsed any = <-this.callInternal("parseIncome"');
    });
    test ('an unknown parser keeps the box', () => {
        const out = print ('const n = this.parseNumbers (arr[0]);\nreturn n;');
        expect (out).toContain ('var n any = <-this.callInternal("parseNumbers"');
    });
    test ('a reassigned local with a non-map write keeps the box', () => {
        const out = print ('let parsed = this.parseCurrency (arr[0]);\nparsed = this.parseNumbers (arr[1]);\nreturn parsed;');
        expect (out).not.toContain ('var parsed map[string]any');
    });
});

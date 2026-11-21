import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go list elements of filterBy / sortBy results read without DerefScalar', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\ntype List = any[];\ninterface Trade { id: Str; timestamp: number; }\nclass Exchange {\n    options: Dict = {};\n'
        + '    safeString (d: any, k: any, def: any = undefined): Str { return d; }\n'
        + '    safeValue (d: any, k: any, def: any = undefined): any { return d; }\n'
        + '    safeList (d: any, k: any, def: any = undefined): any[] { return d; }\n'
        + '    filterBy (a: any, k: any, v: any = undefined): any[] { return a; }\n'
        + '    sortBy (a: any, k: any, d = false, x: any = undefined): any[] { return a; }\n'
        + '    toArray (a: any): any[] { return a; }\n'
        + '    parseTrade (t: Dict): Trade { return undefined; }\n'
        + '    async publicGetX (p: Dict = {}): Promise<any> { return {}; }\n';
    const print = (sig: string, body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g38-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, HEAD + '    ' + sig + ' {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    const FILTER = "const matches = this.filterBy (positions, 'symbol', symbol);\nconst n = matches.length;\nif (n > 0) {\n    return matches[0];\n}\nreturn undefined;";
    test('an element of a filterBy result reads bare inside the guard (fails on the base printer)', () => {
        const out = print ('handle (positions: any, symbol: string)', FILTER);
        // the h26-G24 length-guard proof takes the `n > 0` test as the bounds check, so no second guard prints
        expect (out).toMatch (/if n > 0 \{\n\s*return matches\[0\]\n/);
        expect (out).not.toContain ('func() any');
        expect (out).not.toContain ('DerefScalar(matches[0])');
    });
    test('a sortBy of a list of parsed structures reads bare in the loop (fails on the base printer)', () => {
        const out = print ('handle (data: any[])', "const newTrades: Trade[] = [];\nfor (let i = 0; i < data.length; i++) {\n    newTrades.push (this.parseTrade (data[i]));\n}\nconst sorted = this.sortBy (newTrades, 'timestamp');\nconst out = [];\nfor (let j = 0; j < sorted.length; j++) {\n    const t = sorted[j];\n    out.push (t);\n}\nreturn out;");
        expect (out).toContain ('var t any = sorted[j]');
    });
    test('a sortBy of a list that can hold a string pointer keeps DerefScalar', () => {
        const out = print ('handle (data: any[])', "const ids = [];\nids.push (this.safeString (data, 'a'));\nconst sorted = this.sortBy (ids, 0);\nconst out = [];\nfor (let j = 0; j < sorted.length; j++) {\n    const t = sorted[j];\n    out.push (t);\n}\nreturn out;");
        expect (out).toContain ('DerefScalar(sorted[j])');
    });
    test('a filterBy local rebound from an untyped value keeps DerefScalar', () => {
        const out = print ('handle (positions: any, symbol: string)', "let matches = this.filterBy (positions, 'symbol', symbol);\nmatches = this.safeValue (positions, 'x');\nconst n = matches.length;\nif (n > 0) {\n    return matches[0];\n}\nreturn undefined;");
        expect (out).not.toMatch (/return matches\[0\]\n/);
    });
    test('a toArray of an untyped parameter keeps DerefScalar and the nil guard', () => {
        const out = print ('handle (array: any)', "const parsed = this.toArray (array);\nconst out = [];\nfor (let i = 0; i < parsed.length; i++) {\n    const e = parsed[i];\n    out.push (e);\n}\nreturn out;");
        expect (out).toContain ('DerefScalar(parsed[i])');
    });
});

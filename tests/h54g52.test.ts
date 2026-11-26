import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h54g52: a ternary whose condition folds to a Go constant prints the selected arm', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass BaseExchange {\n'
        + '    parseToInt (x: any): number { return x; }\n'
        + '    id: string;\n}\nclass Exchange extends BaseExchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h54g52-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'unifiedStringParams': { 'pick': [ 0 ] } } };
            const t: any = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('a Go string parameter tested against undefined: the false arm only', () => {
        const out = print ('    pick (toAccount: string, params: Dict = {}) {\n        const toId = this.parseToInt ((toAccount === undefined) ? 0 : toAccount);\n        return toId;\n    }\n');
        expect (out).toContain ('this.ParseToInt(toAccount)');
        expect (out).not.toContain ('func() any {');
        expect (out).not.toContain ('if false {');
    });
    test ('a nullable parameter keeps the literal with its nil test', () => {
        const out = print ('    a (code: string, toAccount: Str = undefined, params: Dict = {}) {\n        const toId = this.parseToInt ((toAccount === undefined) ? 0 : toAccount);\n        return toId;\n    }\n');
        expect (out).toContain ('func() any {');
        expect (out).toContain ('return 0');
    });
    test ('a condition that is not a constant keeps both arms', () => {
        const out = print ('    a (n: number, params: Dict = {}) {\n        const k = this.parseToInt ((n > 5) ? 0 : n);\n        return k;\n    }\n');
        expect (out).toContain ('func() any {');
        expect (out).toContain ('return 0');
    });
});

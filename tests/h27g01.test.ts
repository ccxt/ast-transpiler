import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a string parameter of x.ts whose only non-string caller lives in prediction/x.ts, a different
// class that merely shares the name x, prints as a Go string; a real subclass caller still vetoes it
describe ('h27g01: namesake classes in another ts/src tree do not veto a string parameter', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    privateKey: string;\n    note (h: any): any { return h; }\n}\nexport { Exchange };\nexport default Exchange;\n';
    const PRED = 'import { Exchange } from \'./Exchange.js\';\nclass PredictionExchange extends Exchange {\n}\nexport default PredictionExchange;\n';
    const SIGN = '    signHash (hash: string, privateKey: string): Dict {\n        const r = hash.slice (-64) + privateKey.slice (-64);\n        return { \'r\': r };\n    }\n'
        + '    act () {\n        return this.signHash (\'abc\', this.privateKey);\n    }\n';
    const OTHER = '    signHash (hash: string, privateKey: string): Dict {\n        return { \'r\': hash + privateKey };\n    }\n'
        + '    act (m: any) {\n        return this.signHash (this.note (m), this.privateKey);\n    }\n';
    const print = (pro: string | undefined): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g01-'));
        try {
            const src = path.join (dir, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'prediction'), { 'recursive': true });
            fs.mkdirSync (path.join (src, 'pro'), { 'recursive': true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (path.join (src, 'base', 'PredictionExchange.ts'), PRED);
            const file = path.join (src, 'x.ts');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nexport default class x extends Exchange {\n' + SIGN + '}\n');
            fs.writeFileSync (path.join (src, 'prediction', 'x.ts'), 'import Exchange from \'../base/PredictionExchange.js\';\nexport default class x extends Exchange {\n' + OTHER + '}\n');
            if (pro !== undefined) {
                fs.writeFileSync (path.join (src, 'pro', 'x.ts'), 'import xRest from \'../x.js\';\nexport default class x extends xRest {\n' + pro + '}\n');
            }
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    test ('the prediction namesake caller is not a caller of x.signHash', () => {
        const out = print (undefined);
        expect (out).toContain ('SignHash(hash string, privateKey string)');
        expect (out).toContain ('hash[max(len(hash) - 64, 0):]');
    });
    test ('a real pro subclass caller passing a box keeps the box', () => {
        const out = print ('    w (m: any) {\n        return this.signHash (this.note (m), this.privateKey);\n    }\n');
        expect (out).toContain ('SignHash(hash any, privateKey string)');
    });
    test ('a base method is still proven against every tree', () => {
        const out = print (undefined);
        expect (out).not.toContain ('Note(h string)');
    });
    test ('a real pro subclass caller passing a nil-able local keeps the box', () => {
        const out = print ('    w (m: Str) {\n        return this.signHash (m, this.privateKey);\n    }\n');
        expect (out).toContain ('SignHash(hash any, privateKey string)');
    });
});

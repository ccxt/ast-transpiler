import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('h26g05: a venue string parameter whose sibling-file callers pass a proven *string local', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleMarketTypeAndParams (m: string, market: any = undefined, params: Dict = {}): [Str, Dict] { return [ undefined, params ]; }\n'
        + '    safeString (d: any, k: string, v: Str = undefined): Str { return v; }\n'
        + '    note (h: any) { return h; }\n}\nexport default Exchange;\n';
    const CALLEE = '    isLin (type: string, sub: Str = undefined): boolean {\n'
        + '        if (sub === undefined) {\n            return (type === \'future\') || (type === \'swap\');\n        }\n'
        + '        return sub === \'linear\';\n    }\n'
        + '    one (params: Dict = {}) {\n        const type = this.safeString (params, \'type\');\n        return this.isLin (type);\n    }\n';
    const print = (callee: string, sibling: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h26g05-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'pro'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nexport default class x extends Exchange {\n' + callee + '}\n');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'pro', 'x.ts'), 'import xRest from \'../x.js\';\nexport default class x extends xRest {\n' + sibling + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const tupleCaller = '    w (params: Dict = {}) {\n        const [ marketType, p ] = this.handleMarketTypeAndParams (\'w\', undefined, params);\n'
        + '        return this.isLin (marketType);\n    }\n';
    test ('a sibling handleMarketTypeAndParams slot plus a same-name local makes the parameter *string', () => {
        const out = print (CALLEE + '    two (m: any) {\n        const isLin = m[\'linear\'] === true;\n        return isLin;\n    }\n', tupleCaller);
        expect (out).toContain ('IsLin(typeVar *string, ');
        expect (out).toContain ('(typeVar != nil && *typeVar == "future")');
    });
    test ('a sibling local written from a non-string keeps the box', () => {
        const out = print (CALLEE, '    w (params: Dict = {}) {\n        let marketType = this.note (params);\n'
            + '        marketType = this.safeString (params, \'t\');\n        return this.isLin (marketType);\n    }\n');
        expect (out).toContain ('IsLin(typeVar any, ');
    });
    test ('a sibling tuple slot that is re-assigned another type keeps the box', () => {
        const out = print (CALLEE, '    w (params: Dict = {}) {\n        const [ marketType, p ] = this.handleMarketTypeAndParams (\'w\', undefined, params);\n'
            + '        let t = marketType;\n        t = this.note (p);\n        return this.isLin (t);\n    }\n');
        expect (out).toContain ('IsLin(typeVar any, ');
    });
    test ('a bare reference to the method (not a same-name local) keeps the box', () => {
        const out = print (CALLEE + '    two () {\n        const f = this.isLin;\n        return f;\n    }\n', tupleCaller);
        expect (out).toContain ('IsLin(typeVar any, ');
    });
});

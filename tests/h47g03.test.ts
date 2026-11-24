import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `this.safeDict (rows, i, {})` argument (never nil, always a map) proves a Dict handler slot map[string]any
describe ('h47g03: an inline {}-defaulted safeDict argument types a Dict handler slot', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nexport class Exchange {\n'
        + '    safeDict (a: any, k: any, d: any = undefined): any { return a; }\n'
        + '    safeList (a: any, k: any, d: any = undefined): any[] { return a; }\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    resolveIt (m: any, h: string) { return m; }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h47g03-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const file = path.join (src, 'pro', 'ex.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Str } from \'../base/Exchange\';\nexport default class ex extends Exchange {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const handler = (arg: string) => '    handleOrderUpdate (client: any, message: Dict) {\n'
        + '        const dataList = this.safeList (message, \'data\');\n'
        + '        if (dataList !== undefined) {\n'
        + '            for (let i = 0; i < dataList.length; i++) {\n'
        + '                this.handleOrder (client, ' + arg + ');\n'
        + '            }\n'
        + '        }\n'
        + '    }\n'
        + '    handleOrder (client: any, message: Dict) {\n'
        + '        const id = this.safeString (message, \'id\');\n'
        + '        this.resolveIt (message, \'orders\');\n'
        + '        return id;\n'
        + '    }\n';
    test ('positive: the {} default types the slot and the argument prints the map read', () => {
        const out = run (handler ('this.safeDict (dataList, i, {})'));
        expect (out).toMatch (/HandleOrder\(client \w+, message map\[string\]any\)/);
        expect (out).toContain ('dataListDict');
        expect (out).toContain (', _ := dataList[i].(map[string]any)');
        expect (out).not.toContain ('SafeDict');
    });
    test ('positive: a later argument behind a call keeps the helper read but no box', () => {
        const out = run (handler ('this.safeDict (dataList, i, {})').replace ('this.handleOrder (client, this', 'this.handleOrder (this.safeDict (message, \'c\'), this'));
        expect (out).not.toContain (', _ := dataList[i].(map[string]any)');
    });
    test ('negative: no default keeps the slot boxed (nil is a real answer)', () => {
        const out = run (handler ('this.safeDict (dataList, i)'));
        expect (out).toMatch (/HandleOrder\(client \w+, message any\)/);
    });
    test ('negative: a non-empty default keeps the slot boxed', () => {
        const out = run (handler ('this.safeDict (dataList, i, { \'a\': 1 })'));
        expect (out).toMatch (/HandleOrder\(client \w+, message any\)/);
    });
    test ('negative: a boxed sibling caller keeps the slot boxed', () => {
        const out = run (handler ('this.safeDict (dataList, i, {})').replace ('    handleOrder (client', '    other (client: any, x: any) {\n        this.handleOrder (client, x);\n    }\n    handleOrder (client'));
        expect (out).toMatch (/HandleOrder\(client \w+, message any\)/);
    });
});

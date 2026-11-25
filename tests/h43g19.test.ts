import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go dict params: parseMarginMode row', () => {
    const root = path.join (__dirname, 'files', 'tmp-h43g19', 'ts', 'src');
    const BASE = (body: string) =>
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n' +
        '    run (rows: Dict[], x: any) {\n' + body + '    }\n' +
        '    safeDict (d: any, k: any, v: any = undefined): any { return undefined; }\n' +
        '    extend (...args: any[]): any { return {}; }\n' +
        '    parseMarginMode (marginMode: Dict, market: any = undefined): any {\n        return marginMode;\n    }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE (body));
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h43g19'), { recursive: true, force: true }));

    test ('a defaulted safeDict row types the parameter', () => {
        const out = print ('        this.parseMarginMode (this.safeDict (rows, 0, {}));\n');
        expect (out).toContain ('ParseMarginMode(marginMode map[string]any');
    });
    test ('nil, an any value or an undefaulted safeDict keeps the box', () => {
        expect (print ('        this.parseMarginMode (undefined);\n')).toContain ('ParseMarginMode(marginMode any');
        expect (print ('        this.parseMarginMode (x);\n')).toContain ('ParseMarginMode(marginMode any');
        expect (print ('        this.parseMarginMode (this.safeDict (rows, 0));\n')).toContain ('ParseMarginMode(marginMode any');
    });
});

describe ('go dict params: a nil-seeded list local read at a literal index', () => {
    const root = path.join (__dirname, 'files', 'tmp-h44g07', 'ts', 'src');
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'),
            'type Dict = { [key: string]: any };\n' +
            'export class Exchange {\n' +
            '    safeDict (d: any, k: any, v: any = undefined): any { return v; }\n' +
            '    toArray (d: any): any[] { return d; }\n' +
            '    parseLedgerEntry (item: Dict, c: any = undefined) {\n        return item[\'a\'];\n    }\n' +
            '    run (data: any, c: any) {\n' + body + '    }\n' +
            '}\n');
        const t = new Transpiler ({ verbose: false, go: { wrapCallMethods: [ 'parseLedgerEntry' ] } });
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h44g07'), { recursive: true, force: true }));

    test ('a nil-seeded []any local reads index 0 with a bounds test', () => {
        const out = print ('        let xs: Dict[] = undefined;\n        if (c) {\n            xs = this.toArray (data);\n        }\n        return this.parseLedgerEntry (this.safeDict (xs, 0, {}), c);\n');
        expect (out).toMatch (/var (xsDict\d+) map\[string\]any\n\s*if len\(xs\) > 0 \{\n\s*\1, _ = xs\[0\]\.\(map\[string\]any\)\n\s*\}\n\s*if \1 == nil \{/);
        expect (out).not.toContain ('SafeDictMap');
    });
    test ('an untyped receiver keeps the wrap', () => {
        const out = print ('        return this.parseLedgerEntry (this.safeDict (data, 0, {}), c);\n');
        expect (out).toContain ('this.SafeDictMap(data, 0, map[string]any{})');
    });
});

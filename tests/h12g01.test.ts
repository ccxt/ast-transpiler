import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go orderbookChecksumMessage takes a *string symbol', () => {
    const root = path.join (__dirname, 'files', 'tmp-h12g01', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    orderbookChecksumMessage (symbol: Str): string {\n' +
        '        if (symbol === undefined) {\n' +
        "            throw new Error (this.id + ' requires a symbol');\n" +
        '        }\n' +
        "        return symbol + ' : failed';\n" +
        '    }\n' +
        '    otherMessage (symbol: Str): string {\n' +
        '        if (symbol === undefined) {\n' +
        "            throw new Error (this.id + ' requires a symbol');\n" +
        '        }\n' +
        "        return symbol + ' : failed';\n" +
        '    }\n' +
        '}\n';
    const print = (install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoHooks (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h12g01'), { recursive: true, force: true }));

    test ('the tabled input prints *string, a nil compare and a native deref concat', () => {
        const out = print ();
        expect (out).toContain ('OrderbookChecksumMessage(symbol *string)');
        expect (out).toContain ('*symbol + " : failed"');
        // an untabled sibling keeps the box and the helper
        expect (out).toContain ('OtherMessage(symbol any)');
        expect (out).toContain ('Add(symbol, " : failed")');
        expect (print (false)).not.toContain ('OrderbookChecksumMessage(symbol *string)');
    });
});

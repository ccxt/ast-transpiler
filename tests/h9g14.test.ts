import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoDictParams } from '../src/transpiler';

describe ('go dict params: cleanOrderBook map receiver', () => {
    const root = path.join (__dirname, 'files', 'tmp-h9g14', 'ts', 'src');
    const BASE =
        'type Dict = { [key: string]: any };\n' +
        'export class Exchange {\n' +
        '    safeList (a, b, c?) { return c; }\n' +
        '    storeByKey (dict: Dict, key: string, value: any) {\n' +
        '        const k = key;\n' +
        '        if (k !== undefined) {\n' +
        '            dict[k] = value;\n' +
        '        }\n' +
        '    }\n' +
        '}\n';
    const VENUE = (call: string) =>
        "import { Exchange } from './base/Exchange';\n" +
        'type Dict = { [key: string]: any };\n' +
        'export class ex extends Exchange {\n' +
        '    cleanOrderBook (data: Dict): Dict {\n' +
        "        const bids = this.safeList (data, 'bids', []);\n" +
        "        data['bids'] = bids;\n" +
        '        return data;\n' +
        '    }\n' +
        '    run (x: any) {\n' + call + '    }\n' +
        '}\n';
    const print = (file: string, call: string, install = true): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'ex.ts'), VENUE (call));
        const t = new Transpiler ({ verbose: false, go: {} });
        if (install) { installCcxtGoDictParams (t.goTranspiler); }
        return t.transpileGoByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h9g14'), { recursive: true, force: true }));

    test ('a venue map receiver no call site boxes stores natively', () => {
        const out = print ('ex.ts', '        return 0;\n');
        expect (out).toContain ('CleanOrderBook(data map[string]any)');
        expect (out).toContain ('data["bids"] = bids');
        expect (print ('ex.ts', '        return 0;\n', false)).toContain ('AddElementToObject(data');
    });
    test ('a call site passing an untyped value fails the transpile instead of typing', () => {
        expect (() => print ('ex.ts', '        this.cleanOrderBook (x);\n')).toThrow (/cleanOrderBook\(data\) keeps the box/);
    });
});

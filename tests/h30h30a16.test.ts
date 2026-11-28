import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';

// a loop row of `this.toArray (response)` over an awaited endpoint response holds one decoded JSON element: it
// reads through the comma-ok map; a list from a parameter, a written list or a written response keeps the box
describe ('h30a16: loop row of toArray over an endpoint response', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    request (path: any, api: any = undefined, method: any = undefined, params: any = undefined): any { return undefined; }\n'
        + '    toArray (o: any): any[] { return o; }\n'
        + '    safeDict (o: any, k: any, d: any = undefined): Dict { return o; }\n'
        + '    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (process.env.TMPDIR ?? os.tmpdir (), 'h30a16-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\ntype Dict = { [key: string]: any };\nclass x extends Exchange {\n'
                + '    publicGetRows (params = {}) { return this.request (\'rows\', \'public\', \'GET\', params); }\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t = new Transpiler (config);
            installCcxtGoHooks ((t as any).goTranspiler);
            installCcxtGoLocalTypes ((t as any).goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    // `pre` goes between the endpoint await and the conversion, `mid` between the conversion and the loop
    const method = (name: string, list: string, row: string, pre = '', mid = '', listDecl = 'Dict[]'): string =>
        '    async ' + name + ' (params = {}) {\n'
        + '        const response = await this.publicGetRows (params);\n' + pre
        + '        const ' + list + ': ' + listDecl + ' = this.toArray (response);\n' + mid
        + '        const result = [];\n'
        + '        for (let i = 0; i < ' + list + '.length; i++) {\n'
        + '            const ' + row + ' = ' + list + '[i];\n'
        + '            const nested = this.safeDict (' + row + ', \'n\', {});\n'
        + '            result.push ({ \'id\': this.safeString (' + row + ', \'id\'), \'a\': this.safeString (nested, \'a\'), \'info\': ' + row + ' });\n'
        + '        }\n'
        + '        return result;\n'
        + '    }\n';
    test ('a row of toArray over a read-only endpoint response reads through the comma-ok map', () => {
        const out = print (method ('stored', 'rawMarkets', 'market'));
        expect (out).toMatch (/var market, _ = rawMarkets\[i\]\.\(map\[string\]any\)/);
        expect (out).toMatch (/"info": +rawMarkets\[i\]/);
        expect (out).not.toContain ('SafeMapTyped(market');
    });
    test ('negative: a list written through keeps the boxed row', () => {
        const out = print (method ('writtenList', 'cells', 'cell', '', '        cells[0] = {};\n'));
        expect (out).not.toMatch (/var cell, _ = /);
    });
    test ('negative: a response written before the conversion keeps the boxed row', () => {
        const out = print (method ('writtenResponse', 'entries', 'entry', '        response[\'x\'] = 1;\n'));
        expect (out).not.toMatch (/var entry, _ = /);
    });
    test ('negative: a response also handed to a callee keeps the boxed row', () => {
        const out = print (method ('handed', 'items', 'item', '', '        this.toArray (response);\n'));
        expect (out).not.toMatch (/var item, _ = /);
    });
    test ('negative: a nil-tested row keeps the boxed row', () => {
        const body = method ('nilTested', 'rows', 'row').replace ('            const nested', '            if (row === undefined) {\n                continue;\n            }\n            const nested');
        const out = print (body);
        expect (out).not.toMatch (/var row, _ = /);
    });
});

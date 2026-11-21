import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';
import { installCcxtGoLocalTypes, installFmGo5G01 } from '../src/goTranspiler';

// a `[]any` row of a JSON-origin list: loop-counter reads and constant slots behind a length guard print the
// comma-ok assertion; a list from a parameter, a rebound counter or a list written through keep the wrap
describe ('go JSON-origin list row read (list of lists)', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28a10', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any = undefined, method: any = undefined, params: any = undefined): any { return undefined; }\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    publicGetRows (params = {}) { return this.request (\'rows\', \'public\', \'GET\', params); }\n' +
        '    async loopRows (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < data.length; i++) {\n' +
        '            const row = this.safeList (data, i);\n' +
        '            ids.push (this.safeString (row, 0));\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async firstSlot (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const head = this.safeList (data, 2);\n' +
        '        return this.safeString (head, 0);\n' +
        '    }\n' +
        '    fromParam (response: Dict) {\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < data.length; i++) {\n' +
        '            const item = this.safeList (data, i);\n' +
        '            ids.push (this.safeString (item, 0));\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async rebound (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < data.length; i++) {\n' +
        '            const entry = this.safeList (data, i);\n' +
        '            ids.push (this.safeString (entry, 0));\n' +
        '            i = i + 1;\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async writtenThrough (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const data = this.safeList (response, \'data\', []);\n' +
        '        data.push ([ 1 ]);\n' +
        '        const slot = this.safeList (data, 0);\n' +
        '        return this.safeString (slot, 0);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const cwd = process.cwd ();
        process.chdir (path.join (root, '..', '..'));
        try {
            out = new Transpiler ({ verbose: false }).transpileGoByPath (file).content;
        } finally {
            process.chdir (cwd);
        }
    });
    afterAll (() => {
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h28a10'), { recursive: true, force: true });
    });
    test ('loop-counter row prints the comma-ok assertion', () => {
        expect (out).toMatch (/var row, _ = data\[i\]\.\(\[\]any\)/);
    });
    test ('constant slot prints a typed declaration and a length-guarded assignment', () => {
        expect (out).toMatch (/var head \[\]any\n\s*if 2 < len\(data\) \{\n\s*head, _ = data\[2\]\.\(\[\]any\)\n\s*\}/);
    });
    test ('a list from a parameter is not asserted', () => {
        expect (out).not.toMatch (/var item, _ =/);
    });
    test ('a counter the body writes is not asserted', () => {
        expect (out).not.toMatch (/var entry, _ =/);
    });
    test ('a list written through is not asserted', () => {
        expect (out).not.toMatch (/slot, _ = data/);
    });
    test ('ws frame list rows and constant slots print the comma-ok assertion', () => {
        const wsRoot = path.join (__dirname, 'files', 'tmp-h28a10ws', 'ts', 'src', 'pro');
        fs.mkdirSync (wsRoot, { recursive: true });
        const file = path.join (wsRoot, 'wsvenue.ts');
        fs.writeFileSync (file, [
            'type Dict = { [key: string]: any };',
            'class Client { }',
            'class Base {',
            '    safeList (a: any, b: any, c: any = undefined) { return undefined; }',
            '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
            '    handleMessage (client: Client, message: any) { }',
            '}',
            'class wsvenue extends Base {',
            '    override handleMessage (client: Client, message: Dict) {',
            '        if (this.safeString (message, \'e\') === \'b\') {',
            '            this.handleBook (client, message);',
            '        }',
            '    }',
            '    handleBook (client: Client, message: Dict) {',
            '        const bids = this.safeList (message, \'b\');',
            '        const out = [];',
            '        for (let i = 0; i < bids.length; i++) {',
            '            const bid = this.safeList (bids, i);',
            '            out.push (this.safeString (bid, 0));',
            '        }',
            '        if (bids === undefined) {',
            '            return out;',
            '        }',
            '        const best = this.safeList (bids, 0);',
            '        out.push (this.safeString (best, 1));',
            '        return out;',
            '    }',
            '}',
            '',
        ].join ('\n'));
        const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        installCcxtGoLocalTypes (x.goTranspiler);
        installFmGo5G01 (x.goTranspiler);
        const cwd = process.cwd ();
        process.chdir (path.join (wsRoot, '..', '..', '..'));
        let ws = '';
        try {
            ws = x.transpileGoByPath (file).content as string;
        } finally {
            process.chdir (cwd);
            fs.rmSync (path.join (__dirname, 'files', 'tmp-h28a10ws'), { recursive: true, force: true });
        }
        expect (ws).toMatch (/var bid, _ = bids\[i\]\.\(\[\]any\)/);
        expect (ws).toMatch (/var best \[\]any\n\s*if 0 < len\(bids\) \{\n\s*best, _ = bids\[0\]\.\(\[\]any\)\n\s*\}/);
        expect (ws).not.toMatch (/SafeListTyped\(bids/);
    });
});

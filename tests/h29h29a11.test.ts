import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

// a row read in a bounded loop over a JSON-origin list is itself JSON origin: lists read from it by literal key
// (and indexBy of those) get the comma-ok reads; a written row, a parameter source or an unbounded read keep the wrap
describe ('go nested loop rows of a JSON-origin list carry the JSON-origin proof', () => {
    const root = path.join (__dirname, 'files', 'tmp-h29a11', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    request (path: any, api: any = undefined, method: any = undefined, params: any = undefined): any { return undefined; }\n' +
        '    safeList (o: any, k: any, d: any[] = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: string = undefined): string { return o[k]; }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    publicGetRows (params = {}) { return this.request (\'rows\', \'public\', \'GET\', params); }\n' +
        '    indexBy (a: any, k: any): Dict { return {}; }\n' +
        '    async nested (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const accounts = this.safeList (response, \'accounts\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < accounts.length; i++) {\n' +
        '            const entry = this.safeDict (accounts, i, {});\n' +
        '            const coins = this.safeList (entry, \'coins\', []);\n' +
        '            for (let j = 0; j < coins.length; j++) {\n' +
        '                const coin = this.safeDict (coins, j, {});\n' +
        '                ids.push (this.safeString (coin, \'id\'));\n' +
        '            }\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async rowWritten (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const accounts = this.safeList (response, \'accounts\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < accounts.length; i++) {\n' +
        '            const acct = this.safeDict (accounts, i, {});\n' +
        '            acct[\'coins\'] = [];\n' +
        '            const wcoins = this.safeList (acct, \'coins\', []);\n' +
        '            for (let j = 0; j < wcoins.length; j++) {\n' +
        '                const wcoin = this.safeDict (wcoins, j, {});\n' +
        '                ids.push (this.safeString (wcoin, \'id\'));\n' +
        '            }\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    fromParam (response: Dict) {\n' +
        '        const paccounts = this.safeList (response, \'accounts\', []);\n' +
        '        const ids = [];\n' +
        '        for (let i = 0; i < paccounts.length; i++) {\n' +
        '            const prow = this.safeDict (paccounts, i, {});\n' +
        '            const pcoins = this.safeList (prow, \'coins\', []);\n' +
        '            for (let j = 0; j < pcoins.length; j++) {\n' +
        '                const pcoin = this.safeDict (pcoins, j, {});\n' +
        '                ids.push (this.safeString (pcoin, \'id\'));\n' +
        '            }\n' +
        '        }\n' +
        '        return ids;\n' +
        '    }\n' +
        '    async unbounded (params = {}) {\n' +
        '        const response = await this.publicGetRows (params);\n' +
        '        const accounts = this.safeList (response, \'accounts\', []);\n' +
        '        const ids = [];\n' +
        '        const first = this.safeDict (accounts, 0, {});\n' +
        '        const fcoins = this.safeList (first, \'coins\', []);\n' +
        '        for (let j = 0; j < fcoins.length; j++) {\n' +
        '            const fcoin = this.safeDict (fcoins, j, {});\n' +
        '            if (fcoin === undefined) { ids.push (j); }\n' +
        '        }\n' +
        '        return ids;\n' +
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
        fs.rmSync (path.join (__dirname, 'files', 'tmp-h29a11'), { recursive: true, force: true });
    });
    test ('a list read from a loop row of a JSON-origin list and its rows print comma-ok reads', () => {
        expect (out).toMatch (/coins, _ = entry\["coins"\]\.\(\[\]any\)/);
        expect (out).toMatch (/var coin, _ = coins\[j\]\.\(map\[string\]any\)/);
    });
    test ('a row written through keeps the wrap on lists read from it', () => {
        expect (out).not.toMatch (/wcoins, _ = acct\["coins"\]/);
        expect (out).toMatch (/var wcoins \[\]any = SafeListTyped\(acct, "coins"\)/);
    });
    test ('a loop row of a parameter list keeps the wrap', () => {
        expect (out).not.toMatch (/pcoins, _ = prow\["coins"\]/);
    });
    test ('a row read by index out of a JSON-origin list proves the nested list too', () => {
        expect (out).toMatch (/fcoins, _ = first\["coins"\]\.\(\[\]any\)/);
        expect (out).toMatch (/var fcoin, _ = fcoins\[j\]/);
    });
});

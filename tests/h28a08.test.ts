import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a row read `this.safeDict|safeList (xs, K)` from a read-only JSON-origin []any local prints the comma-ok element
// assertion (bounds-proven, or tested in a statement); other receivers keep the SafeMapTyped / SafeListTyped wrap
describe ('go literal-index row read: widened JSON-origin container', () => {
    const root = path.join (__dirname, 'files', 'tmp-h28a08', 'ts', 'src');
    const SRC =
        'type Dict = { [key: string]: any };\n' +
        'class Exchange {\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict { return o[k]; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '    parseX (o: Dict): Dict { return o; }\n' +
        '    request (path: any, api: any = undefined, method: any = undefined, params: any = {}): any { return {}; }\n' +
        '    publicGetRows (params: any = {}): any { return this.request (\'rows\', \'public\', \'GET\', params); }\n' +
        '}\n' +
        'class venue extends Exchange {\n' +
        '    async unguarded () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const rows = this.safeList (response, \'data\', []);\n' +
        '        const first = this.safeDict (rows, 0);\n' +
        '        return this.parseX (first);\n' +
        '    }\n' +
        '    async guarded () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const items = this.safeList (response, \'items\', []);\n' +
        '        if (items.length > 1) {\n' +
        '            const second = this.safeList (items, 1);\n' +
        '            return second;\n' +
        '        }\n' +
        '        return undefined;\n' +
        '    }\n' +
        '    async nilTested () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const lst = this.safeList (response, \'lst\', []);\n' +
        '        const head = this.safeDict (lst, 0);\n' +
        '        if (head === undefined) {\n' +
        '            return undefined;\n' +
        '        }\n' +
        '        return this.parseX (head);\n' +
        '    }\n' +
        '    async defaulted () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const dl = this.safeList (response, \'dl\', []);\n' +
        '        const d0 = this.safeDict (dl, 0, {});\n' +
        '        d0[\'x\'] = 1;\n' +
        '        return d0;\n' +
        '    }\n' +
        '    async infoReturned () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const data = this.safeDict (response, \'data\', {});\n' +
        '        const accounts = this.safeList (data, \'accounts\', []);\n' +
        '        const firstAccount = this.safeDict (accounts, 0, {});\n' +
        '        const address = this.safeString (firstAccount, \'address\');\n' +
        '        const code = this.safeString (response, \'code\');\n' +
        '        return { \'info\': response, \'address\': address, \'code\': code };\n' +
        '    }\n' +
        '    async handedOut () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const hd = this.safeDict (response, \'data\', {});\n' +
        '        const hl = this.safeList (hd, \'accounts\', []);\n' +
        '        const h0 = this.safeDict (hl, 0, {});\n' +
        '        this.parseX (response);\n' +
        '        return { \'info\': h0 };\n' +
        '    }\n' +
        '    async writtenAfter () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const wd = this.safeDict (response, \'data\', {});\n' +
        '        const wa = this.safeList (wd, \'accounts\', []);\n' +
        '        const wa0 = this.safeDict (wa, 0);\n' +
        '        const out = { \'info\': response };\n' +
        '        out[\'info\'][\'x\'] = wa0;\n' +
        '        return out;\n' +
        '    }\n' +
        '    paramList (prs: any[]) {\n' +
        '        const pr = this.safeDict (prs, 0);\n' +
        '        return this.parseX (pr);\n' +
        '    }\n' +
        '    async written () {\n' +
        '        const response = await this.publicGetRows ();\n' +
        '        const wl = this.safeList (response, \'wl\', []);\n' +
        '        wl.push ({});\n' +
        '        const w0 = this.safeDict (wl, 0);\n' +
        '        return this.parseX (w0);\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, SRC);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h28a08'), { recursive: true, force: true }));
    test ('positive: a response also read by safeString and returned as info', () => {
        expect (out).toMatch (/firstAccount, _ = accounts\[0\]\.\(map\[string\]any\)/);
        expect (out).not.toMatch (/SafeDictMap\(accounts, 0/);
    });
    test ('negative: a response handed to a callee that may write it', () => {
        expect (out).not.toMatch (/h0, _ = hl\[0\]/);
    });
    test ('negative: a response stored into a literal that is not returned', () => {
        expect (out).not.toMatch (/wa0, _ = wa\[0\]/);
    });
});

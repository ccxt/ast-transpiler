import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A pro `handle*` method's non-frame `string[]` parameter prints `[]any` when every caller passes the `[]any`
// the printer builds and the method is only ever called directly (never handed out by name).
describe ('go pro handler list parameter typed from its direct callers', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g10', 'ts', 'src');
    const BASE =
        'type Dict = { [key: string]: any };\n' +
        'export default class Exchange {\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n' +
        '    clean (h: string) { return h; }\n' +
        '}\n';
    const handler = (fn: string) =>
        `    ${fn} (client: any, hashes: string[]) {\n` +
        '        for (let i = 0; i < hashes.length; i++) {\n' +
        '            const h = this.safeString (hashes, i, \'\');\n' +
        '            this.clean (h);\n' +
        '        }\n' +
        '    }\n';
    const PRO =
        'import Exchange from \'../base/Exchange.js\';\n' +
        'type Dict = { [key: string]: any };\n' +
        'export default class venue extends Exchange {\n' +
        handler ('handleUnsubs') +
        handler ('handleBoxed') +
        handler ('handleByName') +
        '    run (client: any, r: Dict, h: string) {\n' +
        '        this.handleUnsubs (client, [ h ]);\n' +
        '        const hashes = [];\n' +
        '        hashes.push (\'x:\' + h);\n' +
        '        this.handleUnsubs (client, hashes);\n' +
        '        this.handleBoxed (client, this.safeValue (r, \'hashes\'));\n' +
        '        this.handleByName (client, [ h ]);\n' +
        '        const table: Dict = { \'u\': this.handleByName };\n' +
        '        return table;\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        const file = path.join (root, 'pro', 'venue.ts');
        fs.writeFileSync (file, PRO);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g10'), { recursive: true, force: true }));

    test ('positive: direct callers passing []any type the handler parameter', () => {
        expect (out).toMatch (/\) HandleUnsubs\(client any, hashes \[\]any\) \{/);
        expect (out).toMatch (/i < len\(hashes\)/);
    });

    test ('negative: a boxed argument keeps the box', () => {
        expect (out).toMatch (/\) HandleBoxed\(client any, hashes any\)/);
        expect (out).toMatch (/GetArrayLength\(hashes\)/);
    });

    test ('negative: a handler referenced by name keeps the box', () => {
        expect (out).toMatch (/\) HandleByName\(client any, hashes any\)/);
    });
});

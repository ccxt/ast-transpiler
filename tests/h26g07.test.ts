import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// A venue `Dict[]` parameter read only in a bounded loop prints `[]any` when a sibling (pro) file passes a local
// bound once from a base list producer whose Go signature returns `[]any` (filterBySymbolSinceLimit, parseOrders..).
describe ('go list parameter proven by a sibling []any producer local', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g07', 'ts', 'src');
    const BASE =
        'type Dict = { [key: string]: any };\n' +
        'export default class Exchange {\n' +
        '    markets: Dict;\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n' +
        '    safeBool (o: any, k: any, d: any = undefined): boolean { return o[k]; }\n' +
        '    safeDict (o: any, k: any, d: any = undefined): Dict { return o[k]; }\n' +
        '    safeValue (o: any, k: any, d: any = undefined): any { return o[k]; }\n' +
        '    filterBySymbolSinceLimit (a: any, s: any = undefined, since: any = undefined, limit: any = undefined): any[] { return a; }\n' +
        '}\n';
    const loop = (fn: string, p: string) =>
        `    ${fn} (${p}: Dict[]): Dict[] {\n` +
        '        const result: Dict[] = [];\n' +
        `        for (let i = 0; i < ${p}.length; i++) {\n` +
        `            const entry = ${p}[i];\n` +
        '            if (this.safeBool (entry, \'stock\', false)) {\n' +
        '                result.push (entry);\n' +
        '            }\n' +
        '        }\n' +
        '        return result;\n' +
        '    }\n';
    const VENUE =
        'import Exchange from \'./base/Exchange.js\';\n' +
        'type Dict = { [key: string]: any };\n' +
        'export default class venue extends Exchange {\n' +
        loop ('filterStock', 'entries') +
        loop ('filterBoxed', 'boxed') +
        loop ('filterRebound', 'rebound') +
        loop ('filterChained', 'chained') +
        '}\n';
    const PRO =
        'import venueRest from \'../venue.js\';\n' +
        'export default class venue extends venueRest {\n' +
        '    run (orders: any, r: any) {\n' +
        '        const filtered = this.filterBySymbolSinceLimit (orders, \'A\', undefined, undefined);\n' +
        '        const a = this.filterStock (filtered);\n' +
        '        const raw = this.safeValue (r, \'data\');\n' +
        '        const b = this.filterBoxed (raw);\n' +
        '        let again = this.filterBySymbolSinceLimit (orders);\n' +
        '        again = this.safeValue (r, \'x\');\n' +
        '        const c = this.filterRebound (again);\n' +
        '        const head = this.filterBySymbolSinceLimit (orders)[0];\n' +
        '        const d = this.filterChained (head);\n' +
        '        return [ a, b, c, d ];\n' +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'pro'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'pro', 'venue.ts'), PRO);
        const file = path.join (root, 'venue.ts');
        fs.writeFileSync (file, VENUE);
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (file).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g07'), { recursive: true, force: true }));

    test ('positive: a sibling producer local proves the slice and the reads go native', () => {
        expect (out).toMatch (/\) FilterStock\(entries \[\]any\) \[\]any \{/);
        expect (out).toMatch (/i < len\(entries\)/);
        expect (out).toMatch (/var entry any = entries\[i\]/);
    });

    test ('negative: a boxed sibling argument keeps the box', () => {
        expect (out).toMatch (/\) FilterBoxed\(boxed any\)/);
        expect (out).toMatch (/GetArrayLength\(boxed\)/);
    });

    test ('negative: a producer local rebound to a nilable box keeps the box', () => {
        expect (out).toMatch (/\) FilterRebound\(rebound any\)/);
    });

    test ('negative: an element of a producer call is not the slice', () => {
        expect (out).toMatch (/\) FilterChained\(chained any\)/);
    });
});

import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// `const xs: List = await this.m (..)` where every return of the venue method m is a local seeded `[]` and
// filled only by `push (this.extend (..))`: the rows are Go maps, so the bounded read `xs[i]` is the plain index.
describe ('go awaited list of pushed extend rows reads natively', () => {
    const root = path.join (__dirname, 'files', 'tmp-h48g30', 'ts', 'src');
    const BASE =
        'export type Dict = { [key: string]: any };\n' +
        'export type List = any[];\n' +
        'export class Exchange {\n' +
        '    extend (...args: any[]): any { return args[0]; }\n' +
        '    safeString (o: any, k: any, d: any = undefined): string { return o; }\n' +
        '    safeDict (o: any, k: any): any { return o; }\n' +
        '    safeList (o: any, k: any, d: any = undefined): any[] { return o; }\n' +
        '    async publicGetRows (p: any): Promise<any> { return p; }\n' +
        '}\n';
    const VENUE =
        "import { Exchange, Dict, List } from './base/Exchange.js';\n" +
        'export default class v extends Exchange {\n' +
        '    async fetchRows (plain: Dict): Promise<List> {\n' +
        '        const entries: List = [];\n' +
        '        const response = await this.publicGetRows (plain);\n' +
        "        const rows = this.safeList (response, 'rows', []);\n" +
        '        for (let j = 0; j < rows.length; j++) {\n' +
        "            entries.push (this.extend (this.safeDict (plain, 'a'), rows[j]));\n" +
        '        }\n' +
        '        return entries;\n' +
        '    }\n' +
        '    async fetchMixed (plain: Dict): Promise<List> {\n' +
        '        const entries: List = [];\n' +
        "        entries.push (this.safeString (plain, 'x'));\n" +
        '        return entries;\n' +
        '    }\n' +
        '    async fetchRaw (plain: Dict): Promise<List> {\n' +
        '        const response = await this.publicGetRows (plain);\n' +
        '        return response;\n' +
        '    }\n' +
        '    async usePushed (plain: Dict) {\n' +
        '        const details: List = await this.fetchRows (plain);\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < details.length; i++) {\n' +
        "            out.push (this.safeString (details[i], 'venue'));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    async useMixed (plain: Dict) {\n' +
        '        const mixed: List = await this.fetchMixed (plain);\n' +
        '        const out = [];\n' +
        '        for (let i = 0; i < mixed.length; i++) {\n' +
        "            out.push (this.safeString (mixed[i], 'venue'));\n" +
        '        }\n' +
        '        return out;\n' +
        '    }\n' +
        '    async useOutside (plain: Dict) {\n' +
        '        const first: List = await this.fetchRows (plain);\n' +
        "        return this.safeString (first[0], 'venue');\n" +
        '    }\n' +
        '}\n';
    let out = '';
    beforeAll (() => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE);
        fs.writeFileSync (path.join (root, 'v.ts'), VENUE);
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        out = t.transpileGoByPath (path.join (root, 'v.ts')).content;
    });
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h48g30'), { recursive: true, force: true }));

    const body = (name: string) => {
        const at = out.indexOf (') ' + name + '(');
        return out.substring (at, out.indexOf ('\n}\n', at));
    };

    test ('positive: a bounded read of the pushed-row list is the plain index', () => {
        expect (body ('usePushedBody')).toMatch (/this\.SafeString\(details\[i\], "venue"\)/);
        expect (body ('usePushedBody')).not.toMatch (/GetValue\(details, i\)/);
    });

    test ('negative: a list that also takes a scalar push keeps the helper', () => {
        expect (body ('useMixedBody')).toMatch (/GetValue\(mixed, i\)/);
    });

    test ('negative: a read outside a bounded loop keeps its guard', () => {
        expect (body ('useOutsideBody')).toMatch (/GetValue\(first, 0\)/);
    });
});

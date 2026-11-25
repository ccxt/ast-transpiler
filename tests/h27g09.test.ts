import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe ('go string[] local filled with nil-guarded safeString pointers', () => {
    const root = path.join (__dirname, 'files', 'tmp-h27g09', 'ts', 'src');
    const BASE =
        'export type Str = string | undefined;\n' +
        'export class Exchange {\n' +
        "    id: string = 'x';\n" +
        '    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n' +
        '}\n';
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), BASE + 'export default Exchange;\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import Exchange from './base/Exchange.js';\n" +
            'export default class venue extends Exchange {\n    m (rows: any[]): any {\n' + body + '\n    }\n}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h27g09'), { recursive: true, force: true }));

    const body = (guard: string, tail: string) => '        const ids: string[] = [];\n' +
        '        for (let i = 0; i < rows.length; i++) {\n' +
        "            const id = this.safeString (rows[i], 'id');\n" +
        '            ' + guard + '\n' +
        '        }\n' + tail;

    test ('positive: a push guarded by a nil test keeps the list []string', () => {
        const out = print (body ('if (id !== undefined) {\n                ids.push (id);\n            }', "        const n = ids.length;\n        return n > 0 ? ids[0] : '';"));
        expect (out).toContain ('var ids []string = []string{}');
        expect (out).toContain ('ids = append(ids, *id)');
    });

    test ('negative: an unguarded Str push keeps the box', () => {
        const out = print (body ('ids.push (id as string);', '        return ids.length;'));
        expect (out).not.toContain ('var ids []string');
        expect (out).not.toContain ('*id)');
    });

    test ('negative: a push of a non-string value keeps the box', () => {
        const out = print (body ('if (id !== undefined) {\n                ids.push (id);\n            }\n            ids.push (rows[i] as any);', '        return ids.length;'));
        expect (out).not.toContain ('var ids []string');
    });

    test ('negative: a guard on another local does not prove the pushed one', () => {
        const out = print (body ("const other = this.safeString (rows[i], 'x');\n            if (other !== undefined) {\n                ids.push (id as string);\n            }", '        return ids.length;'));
        expect (out).not.toContain ('var ids []string');
    });
});

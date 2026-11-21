import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go map writes of pointer-free list rows', () => {
    const root = path.join (__dirname, 'files', 'tmp-h15m24', 'ts', 'src');
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), 'export class Exchange {\n    safeString (o: any, k: any, d: any = undefined): string { return o[k]; }\n    safeInteger (o: any, k: any, d: any = undefined): number { return o[k]; }\n    async privateGetOrders (p: any = {}): Promise<any> { return {}; }\n}\n');
        fs.writeFileSync (path.join (root, 'venue.ts'), "import { Exchange } from './base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        return t.transpileGoByPath (path.join (root, 'venue.ts')).content;
    };
    const body = (rows: string, decl: string, loop = 'for (let i = 0; i < rows.length; i++) {') => '    async run () {\n        const rows = ' + rows + ';\n        const byId = {};\n        ' + loop + '\n            ' + decl + ' row = rows[i];\n            const id = this.safeString (row, \'id\');\n            if (id !== undefined) {\n                byId[id] = row;\n            }\n        }\n        return byId;\n    }\n';
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h15m24'), { recursive: true, force: true }));

    test ('a const row of an endpoint list read in its bounded loop is stored natively', () => {
        const out = print (body ('await this.privateGetOrders ()', 'const'));
        expect (out).toContain ('byId[*id] = row');
        expect (out).not.toContain ('AddElementToObject(byId');
    });

    test ('negatives keep the helper', () => {
        // a list that may hold scalar pointers
        expect (print (body ('[ this.safeInteger ({}, \'a\') ]', 'const'))).toContain ('AddElementToObject(byId, id, row)');
        // a `let` row may be rebound to anything
        expect (print (body ('await this.privateGetOrders ()', 'let'))).toContain ('AddElementToObject(byId, id, row)');
        // a read not bounded by its loop
        expect (print (body ('await this.privateGetOrders ()', 'const', 'for (let i = 0; i < 3; i++) {'))).toContain ('AddElementToObject(byId, id, row)');
    });
});

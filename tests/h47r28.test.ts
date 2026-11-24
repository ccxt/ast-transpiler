import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust venue cancelOrdersRequest ids is a lent string slice', () => {
    const root = path.join (__dirname, 'files', 'tmp-h47r28', 'ts', 'src');
    const base = 'export class Exchange {\n    safeString (d: any, k: any, def: any = undefined): any { return undefined; }\n'
        + '    async cancelOrders (ids: string[], symbol: string = undefined, params = {}): Promise<any> { return undefined; }\n}\n';
    const print = (venue: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'venue.ts'), "import { Exchange } from './base/Exchange';\nexport default class venue extends Exchange {\n" + venue + '}\n');
        const t = new Transpiler ({ verbose: false, rust: {} });
        return t.transpileRustByPath (path.join (root, 'venue.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h47r28'), { recursive: true, force: true }));

    const caller = '    async cancelOrders (ids: string[], symbol: string = undefined, params = {}): Promise<any> {\n'
        + '        const request = this.cancelOrdersRequest (ids, symbol, params);\n        return request;\n    }\n';
    const reader = '    cancelOrdersRequest (ids: string[], symbol: string = undefined, params = {}): any {\n'
        + '        const out = [];\n        for (let i = 0; i < ids.length; i++) {\n            out.push (this.safeString (ids, i));\n        }\n        return out;\n    }\n';
    const stored = '    cancelOrdersRequest (ids: string[], symbol: string = undefined, params = {}): any {\n'
        + '        const n = [];\n        for (let i = 0; i < ids.length; i++) {\n            n.push (1);\n        }\n        return { \'digests\': ids, \'n\': n };\n    }\n';

    test ('a safeString read by loop index keeps the list lent', () => {
        const out = print (caller + reader);
        expect (out).toContain ('ids: &[crate::Value]');
        expect (out).not.toContain ('cancelOrdersRequest(&self, ids: Value');
        // the lent slice is handed to the reader as it is, never copied
        expect (out).not.toContain ('ids.clone()');
        expect (out).toMatch (/(?:safe_string(?:_opt)?|safeString)\(ids, /);
    });

    test ('negatives keep the box', () => {
        // the list stored whole into a request map
        expect (print (caller + stored)).not.toContain ('ids: &[crate::Value]');
        // a non-counter key
        const strKey = '    cancelOrdersRequest (ids: string[], symbol: string = undefined, params = {}): any {\n        return this.safeString (ids, symbol);\n    }\n';
        expect (print (caller + strKey)).not.toContain ('ids: &[crate::Value]');
        // an `any[]` list is not a string list
        const anyList = '    cancelOrdersRequest (ids: any[], symbol: string = undefined, params = {}): any {\n        const out = [];\n        for (let i = 0; i < ids.length; i++) {\n            out.push (this.safeString (ids, i));\n        }\n        return out;\n    }\n';
        expect (print (caller + anyList)).not.toContain ('ids: &[crate::Value]');
    });
});

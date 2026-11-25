import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue `Promise<Dict>` method returning an optional map local narrowed by a `!== undefined` guard returns `Dict`
const base = 'export interface Dict { [key: string]: any }\nexport type NullableDict = Dict | undefined;\n' +
    'export default class Exchange {\n    options: Dict = {};\n' +
    '    safeDict (o: any, k: any, d: Dict): Dict;\n    safeDict (o: any, k: any, d?: Dict): Dict | undefined;\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    safeString (o: any, k: any, d: string = undefined): string | undefined { return d; }\n' +
    '    async fetchRaw (): Promise<Dict> { return {}; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    async replies (response: any, name: string): Promise<Dict> {\n        let current = response;\n        for (let i = 0; i <= 3; i++) {\n            const first = this.safeDict (current, 0, {});\n            const orderId = this.safeString (first, \'id\');\n            if (orderId !== undefined) {\n                return first;\n            }\n            current = await this.fetchRaw ();\n        }\n        return {};\n    }\n' +
    '    async useReplies (): Promise<string> {\n        const r = await this.replies ([], \'x\');\n        return r[\'x\'];\n    }\n}\n';

describe ('rust borrowed map local returned from a Dict method', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h51r05-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
    const fn = (name: string, next: string): string => output.slice (output.indexOf ('fn ' + name + '('), next === '' ? undefined : output.indexOf ('fn ' + next + '('));

    test ('a map local returned in a loop is handed on, never re-boxed', () => {
        const f = fn ('replies', 'useReplies');
        expect (f).not.toMatch (/return Value::from\(&first\);/);
        if (/-> crate::value::Dict \{/.test (f)) expect (f).toMatch (/return first;/);
    });
});

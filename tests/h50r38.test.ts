import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue `Promise<Dict>` method returning an optional map local narrowed by a `!== undefined` guard returns `Dict`
const base = 'export interface Dict { [key: string]: any }\nexport type NullableDict = Dict | undefined;\n' +
    'export default class Exchange {\n    options: Dict = {};\n' +
    '    safeDict (o: any, k: any, d: Dict): Dict;\n    safeDict (o: any, k: any, d?: Dict): Dict | undefined;\n    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n' +
    '    async fetchRaw (): Promise<Dict> { return {}; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    async loadMeta (): Promise<Dict> {\n        const cached = this.safeDict (this.options, \'meta\');\n        if (cached !== undefined) {\n            return cached;\n        }\n        const response = await this.fetchRaw ();\n        const data = this.safeDict (response, \'data\', {});\n        this.options[\'meta\'] = data;\n        return data;\n    }\n' +
    '    async useMeta (): Promise<string> {\n        const meta = await this.loadMeta ();\n        return meta[\'x\'];\n    }\n' +
    '    async loadLoose (): Promise<Dict> {\n        const cached = this.safeDict (this.options, \'meta\');\n        return cached;\n    }\n' +
    '    async useLoose (): Promise<string> {\n        const meta = await this.loadLoose ();\n        return meta[\'x\'];\n    }\n}\n';

describe ('rust narrowed optional map return', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50r38-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
    const fn = (name: string, next: string): string => output.slice (output.indexOf ('fn ' + name + '('), next === '' ? undefined : output.indexOf ('fn ' + next + '('));

    test ('the guarded optional map returns the map it holds', () => {
        const f = fn ('loadMeta', 'useMeta');
        expect (f).toMatch (/-> crate::value::Dict \{/);
        expect (f).toMatch (/return cached\.unwrap_or_default\(\);/);
        expect (fn ('useMeta', 'loadLoose')).not.toMatch (/into_dict\(\)/);
    });
    test ('an unguarded optional map keeps the boxed return', () => {
        expect (fn ('loadLoose', 'useLoose')).toMatch (/-> Value \{/);
    });
});

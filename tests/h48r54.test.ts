import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue-private method declared `string[]` whose every return is a list it builds returns the native list
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }\n' +
    '    inArray (x: any, xs: any[]): boolean { return true; }\n    hold (x: any): any { return x; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchNames (): Promise<string[]> {\n        const result: string[] = [];\n        const rows = await this.hold ({});\n        for (let i = 0; i < 2; i++) {\n            const symbol = this.safeString (rows, i);\n            if (symbol !== undefined && !this.inArray (symbol, result)) {\n                result.push (symbol);\n            }\n        }\n        return result;\n    }\n" +
    "    readNames (o: Dict): string[] {\n        return this.safeList (o, 'names', [ 'x' ]);\n    }\n" +
    "    async fetchAll () {\n        const names: string[] = await this.fetchNames ();\n        const other: string[] = this.readNames ({});\n        return this.hold ([ names, other ]);\n    }\n" +
    '}\n';

describe ('rust venue string[] own-container return', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r54-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('a built string list return prints the native list and its caller takes it without into_list', () => {
        expect (output).toMatch (/fn fetchNames\([^)]*\) -> crate::value::List/);
        expect (output).not.toMatch (/fetchNames\(\)\.await\.into_list\(\)/);
    });

    test ('a boxed safeList read with a default keeps the Value return', () => {
        expect (output).toMatch (/fn readNames\([^)]*\) -> Value/);
    });
});

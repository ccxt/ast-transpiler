import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a ws error handler declared `boolean` prints `-> bool`; callers test the bool as is
const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    id: string = '';\n    safeString (o: any, k: any, d: any = undefined): string | undefined { return o[k]; }\n}\n";
const handler = (decl: string, ret: string) => "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\n"
    + "export default class venue extends Exchange {\n"
    + `    handleErrorMessage (client: any, message: Dict)${decl} {\n        const code = this.safeString (message, 'code');\n        if (code !== undefined) {\n            return true;\n        }\n        return ${ret};\n    }\n`
    + "    handleMessage (client: any, message: Dict) {\n        if (this.handleErrorMessage (client, message) === true) {\n            return;\n        }\n        if (this.handleErrorMessage (client, message) !== true) {\n            return;\n        }\n    }\n}\n";

function build (venue: string): string {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-h42r11-'));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.mkdirSync(path.join(root, 'ts/src/pro'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync(path.join(root, 'ts/src/pro/venue.ts'), venue);
    const t = new Transpiler({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath(path.join(root, 'ts/src/pro/venue.ts')).content; } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

describe('rust handleErrorMessage declared boolean prints -> bool', () => {
    test('the signature is bool and the callers read it without as_bool', () => {
        const out = build (handler(': boolean', 'false'));
        expect(out).toMatch(/fn handleErrorMessage\([^)]*\) -> bool \{/);
        expect(out).not.toContain('handleErrorMessage(&client, &message).as_bool()');
    });
    test('Bool alias prints bool too', () => {
        const out = build (handler(': Bool', 'false'));
        expect(out).toMatch(/fn handleErrorMessage\([^)]*\) -> bool \{/);
    });
    test('negative: no declaration keeps the Value return', () => {
        const out = build (handler('', 'false'));
        expect(out).not.toMatch(/fn handleErrorMessage\([^)]*\) -> bool/);
    });
    test('negative: declared any keeps the Value return', () => {
        const out = build (handler(': any', 'message'));
        expect(out).not.toMatch(/fn handleErrorMessage\([^)]*\) -> bool/);
    });
});

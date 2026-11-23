import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler, { rustDispatch } from '../src/transpiler';

const HE = 'handleErrors (code: int, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: NullableDict, requestBody: Str)';
const SLOTS = [ 'code', 'reason', 'url', 'method', 'headers', 'body', 'response', 'request_headers', 'request_body' ];

const mk = (tag: string, ret: string) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `astfx-heb-${tag}-`));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport type int = number;\nexport type Str = string | undefined;\nexport type Bool = boolean | undefined;\nexport type NullableDict = Dict | undefined;\nexport default class Exchange {\n    id: string = \'x\';\n    ' + HE + ': ' + ret + ' {\n        return undefined;\n    }\n}\n');
    fs.writeFileSync(path.join(root, 'ts/src/venue.ts'), 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict, int, Str, Bool, NullableDict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + HE + ': ' + ret + ' {\n        if (body.indexOf (\'LOT\') >= 0) {\n            throw new Error (this.id + \' \' + body);\n        }\n        if (response === undefined) {\n            return undefined;\n        }\n        return true;\n    }\n}\n');
    const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': { handle_errors: SLOTS }, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return { base: t.transpileRustByPath(path.join(root, 'ts/src/base/Exchange.ts')).content, venue: t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content };
};

describe('handleErrors declared Bool returns Option<bool> in the base, every override and the slot', () => {
    test('undefined prints None, true prints Some(true), the base probe tests is_some', () => {
        const { base, venue } = mk('ok', 'Bool');
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, [^\n]*\) -> Option<bool> \{/);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, [^\n]*\) -> Option<bool> \{/);
        expect(venue).toContain('return None;');
        expect(venue).toContain('return Some(true);');
        expect(venue).not.toContain('Value::Bool(true)');
        expect(base).toContain('return None;');
        expect(base).toContain('if __v.is_some() { return __v; }');
        expect(rustDispatch.result('f()', 'keptobool')).toBe('f().map_or(crate::Value::Null, crate::Value::Bool)');
        expect(rustDispatch.isKeptReturn('keptobool')).toBe(true);
    });
    test('negative: a declaration with another return type keeps -> Value', () => {
        const { base, venue } = mk('any', 'any');
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, [^\n]*\) -> Value \{/);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, [^\n]*\) -> Value \{/);
        expect(venue).not.toContain('Option<bool>');
    });
    test('negative: the declared nullable Bool never prints a plain bool', () => {
        const { venue } = mk('nb', 'Bool');
        expect(venue).not.toMatch(/-> bool \{/);
    });
});

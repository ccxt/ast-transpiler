import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler, { rustDispatch } from '../src/transpiler';

const HE = 'handleErrors (code: int, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: Dict, requestBody: string)';
const SLOTS = [ 'code', 'reason', 'url', 'method', 'headers', 'body', 'response', 'request_headers', 'request_body' ];

const mk = (tag: string, venueHead: string, baseHead: string = HE) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `astfx-he-${tag}-`));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport type int = number;\nexport type Str = string | undefined;\nexport type NullableDict = Dict | undefined;\nexport default class Exchange {\n    id: string = \'x\';\n    ' + baseHead + ' {\n        return undefined;\n    }\n}\n');
    fs.writeFileSync(path.join(root, 'ts/src/venue.ts'), 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict, int, Str, NullableDict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + ' {\n        if (body.indexOf (\'LOT\') >= 0) {\n            throw new Error (this.id + \' \' + body);\n        }\n        if (url.indexOf (\'order\') < 0) {\n            return undefined;\n        }\n        return undefined;\n    }\n}\n');
    const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': { handle_errors: SLOTS }, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return { base: t.transpileRustByPath(path.join(root, 'ts/src/base/Exchange.ts')).content, venue: t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content };
};

describe('the handleErrors override group types its string parameters together', () => {
    test('every declaration spells them string: base, override and the trait slot take &str', () => {
        const { base, venue } = mk('ok', HE);
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, reason: &str, url: &str, method: &str, (mut )?headers: Value, body: &str, /);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, reason: &str, url: &str, method: &str, (mut )?headers: Value, body: &str, /);
        expect(rustDispatch.slotParams(SLOTS)).toBe('code: i64, reason: &str, url: &str, method: &str, headers: crate::Value, body: &str, response: crate::Value, request_headers: crate::Value, request_body: Option<&str>');
        expect(rustDispatch.slotValue('body', 5)).toBe('crate::Value::from(body)');
        // a name at another index is not a string slot
        expect(rustDispatch.isSlotStr('body', 4)).toBe(false);
    });
    test('negative: one declaration spelling a parameter differently keeps that parameter Value', () => {
        const { venue } = mk('no', HE.replace('body: string', 'body: any'));
        expect(venue).toMatch(/reason: &str, url: &str, method: &str, (mut )?headers: Value, (mut )?body: Value, /);
    });
});

describe('the handleErrors code parameter (int in every declaration) is an i64 slot', () => {
    test('base, override and trait slot take i64; a literal compare is native', () => {
        const { base, venue } = mk('int', HE.replace('code: int', 'code: int').replace('url: string, method', 'url: string, method'));
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, reason: &str, /);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, reason: &str, /);
        expect(rustDispatch.slotParams(SLOTS).startsWith('code: i64, reason: &str')).toBe(true);
        expect(rustDispatch.slotValue('code', 0)).toBe('crate::Value::from(code)');
        expect(rustDispatch.isSlotInt('code', 1)).toBe(false);
    });
    test('negative: one declaration spelling code differently keeps it Value', () => {
        const { venue } = mk('intno', HE.replace('code: int', 'code: any'));
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, (mut )?code: Value, reason: &str, /);
    });
});

describe('the handleErrors requestBody parameter (Str in every declaration) is an Option<&str> slot', () => {
    const HS = HE.replace('requestHeaders: Dict, requestBody: string', 'requestHeaders: NullableDict, requestBody: Str');
    const mkS = (tag: string, head: string) => mk(tag, head, HS);
    test('base, override and trait slot take Option<&str>', () => {
        const { base, venue } = mkS('ostr', HS);
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, .*, (mut )?requestBody: Option<&str>\)/);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, .*, (mut )?requestBody: Option<&str>\)/);
        expect(rustDispatch.slotParams(SLOTS).endsWith('request_body: Option<&str>')).toBe(true);
        expect(rustDispatch.slotValue('request_body', 8)).toBe('crate::Value::from(request_body)');
        expect(rustDispatch.isSlotOptStr('request_body', 7)).toBe(false);
    });
    test('negative: one declaration spelling requestBody differently keeps it Value', () => {
        const { venue } = mkS('ostrno', HS.replace('requestBody: Str', 'requestBody: any'));
        expect(venue).toMatch(/(mut )?requestBody: Value\)/);
    });
});

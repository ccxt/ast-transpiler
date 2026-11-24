import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler, { rustDispatch } from '../src/transpiler';

const HE = 'handleErrors (code: int, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: Dict, requestBody: string)';
const SLOTS = [ 'code', 'reason', 'url', 'method', 'headers', 'body', 'response', 'request_headers', 'request_body' ];

const mk = (tag: string, venueHead: string, baseHead: string = HE, extra: string = '') => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `astfx-he-${tag}-`));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport type int = number;\nexport type Str = string | undefined;\nexport type NullableDict = Dict | undefined;\nexport default class Exchange {\n    id: string = \'x\';\n    ' + baseHead + ' {\n        return undefined;\n    }\n}\n');
    fs.writeFileSync(path.join(root, 'ts/src/venue.ts'), 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict, int, Str, NullableDict } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + ' {\n' + extra + '        if (body.indexOf (\'LOT\') >= 0) {\n            throw new Error (this.id + \' \' + body);\n        }\n        if (url.indexOf (\'order\') < 0) {\n            return undefined;\n        }\n        return undefined;\n    }\n}\n');
    const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': { handle_errors: SLOTS }, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return { base: t.transpileRustByPath(path.join(root, 'ts/src/base/Exchange.ts')).content, venue: t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content };
};

describe('the handleErrors override group types its string parameters together', () => {
    test('every declaration spells them string: base, override and the trait slot take &str', () => {
        const { base, venue } = mk('ok', HE);
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, reason: &str, url: &str, method: &str, headers: &indexmap::IndexMap<String, Value>, body: &str, /);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, code: i64, reason: &str, url: &str, method: &str, headers: &indexmap::IndexMap<String, Value>, body: &str, /);
        expect(rustDispatch.slotParams(SLOTS)).toBe('code: i64, reason: &str, url: &str, method: &str, headers: &indexmap::IndexMap<String, Value>, body: &str, response: crate::Value, request_headers: Option<&indexmap::IndexMap<String, Value>>, request_body: Option<&str>');
        expect(rustDispatch.slotValue('body', 5)).toBe('crate::Value::from(body)');
        // a name at another index is not a string slot
        expect(rustDispatch.isSlotStr('body', 4)).toBe(false);
    });
    test('negative: one declaration spelling a parameter differently keeps that parameter Value', () => {
        const { venue } = mk('no', HE.replace('body: string', 'body: any'));
        expect(venue).toMatch(/reason: &str, url: &str, method: &str, headers: &indexmap::IndexMap<String, Value>, (mut )?body: Value, /);
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

describe('the handleErrors headers (Dict) and requestHeaders (NullableDict) parameters are lent map slots', () => {
    const HM = HE.replace('requestHeaders: Dict, requestBody: string', 'requestHeaders: NullableDict, requestBody: Str');
    test('base, override and trait slot take a lent map and an optional lent map; a reader takes the map as is', () => {
        const { base, venue } = mk('map', HM.replace(') {', ') {'), HM);
        expect(venue).toMatch(/headers: &indexmap::IndexMap<String, Value>, body: &str, (mut )?response: Value, requestHeaders: Option<&indexmap::IndexMap<String, Value>>, requestBody: Option<&str>\)/);
        expect(base).toMatch(/headers: &indexmap::IndexMap<String, Value>, body: &str, (mut )?response: Value, requestHeaders: Option<&indexmap::IndexMap<String, Value>>, requestBody: Option<&str>\)/);
        expect(venue).not.toMatch(/let mut (headers|requestHeaders): Value/);
        expect(rustDispatch.slotParams(SLOTS)).toContain('request_headers: Option<&indexmap::IndexMap<String, Value>>');
        expect(rustDispatch.slotValue('headers', 4)).toBe('crate::Value::Map(headers.clone())');
        expect(rustDispatch.slotValue('request_headers', 7)).toBe('request_headers.map_or(crate::Value::Null, |m| crate::Value::Map(m.clone()))');
        // a missing / non-map argument of a by-name arm: an empty map for headers, None for requestHeaders
        expect(rustDispatch.arg('mapref', 4)).toBe('args.get(4).and_then(crate::Value::as_map).unwrap_or(&Default::default())');
        expect(rustDispatch.arg('optmapref', 7)).toBe('args.get(7).and_then(crate::Value::as_map)');
        expect(rustDispatch.isSlotMapRef('headers', 5)).toBe(false);
    });
    test('a safeString2 read of the lent headers map passes it as is, with no clone', () => {
        const read = '        const id = this.safeString2 (headers, \'X-Id\', \'x-id\');\n        if (id !== undefined) {\n            return undefined;\n        }\n';
        const { venue } = mk('mapread', HM, HM, read);
        expect(venue).toMatch(/safe_?[sS]tring2\w*\(headers, /);
        expect(venue).not.toMatch(/headers\.clone\(\)/);
    });
    test('negative: one declaration spelling headers differently keeps it Value', () => {
        const { venue } = mk('mapno', HM.replace('headers: Dict', 'headers: any'), HM);
        expect(venue).toMatch(/method: &str, (mut )?headers: Value, body: &str, /);
        expect(venue).toMatch(/requestHeaders: Option<&indexmap::IndexMap<String, Value>>/);
    });
    test('negative: requestHeaders spelled Dict in one declaration keeps it Value', () => {
        const { venue } = mk('mapno2', HM.replace('requestHeaders: NullableDict', 'requestHeaders: Dict'), HM);
        expect(venue).toMatch(/(mut )?requestHeaders: Value, requestBody: Option<&str>\)/);
    });
    test('a held dict local read with a default lends its map to the headers slot', () => {
        const caller = 'import Exchange from \'../base/Exchange.js\';\nimport type { Dict, int, Str, NullableDict } from \'../base/Exchange.js\';\nexport default class wsvenue extends Exchange {\n    handleOrder (message: any) {\n        const ws = this.safeDict (message, \'ws\', {});\n        const hdrs = this.safeDict (ws, \'headers\', {});\n        this.handleErrors (0, \'\', \'\', \'\', hdrs, \'\', message, {}, undefined);\n        return true;\n    }\n}\n';
        const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astfx-he-wscall-'));
        fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
        fs.mkdirSync(path.join(root, 'ts/src/pro'), { recursive: true });
        fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport type int = number;\nexport type Str = string | undefined;\nexport type NullableDict = Dict | undefined;\nexport default class Exchange {\n    id: string = \'x\';\n    safeDict (o: any, k: any, d: Dict = undefined): Dict { return o; }\n    ' + HM + ' {\n        return undefined;\n    }\n}\n');
        fs.writeFileSync(path.join(root, 'ts/src/pro/wsvenue.ts'), caller);
        const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': { handle_errors: SLOTS }, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        const out = t.transpileRustByPath(path.join(root, 'ts/src/pro/wsvenue.ts')).content;
        const call = out.split('\n').find((l) => /handle_?[eE]rrors\(/.test(l)) ?? '';
        expect(out).toMatch(/let mut hdrs: crate::value::Dict = /);
        expect(call).toMatch(/, &hdrs, /);
        expect(call).not.toMatch(/Value::Dict\(hdrs\)/);
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Transpiler, { rustDispatch } from '../src/transpiler';

const HE = 'handleErrors (code: int, reason: string, url: string, method: string, headers: Dict, body: string, response: any, requestHeaders: Dict, requestBody: string)';
const SLOTS = [ 'code', 'reason', 'url', 'method', 'headers', 'body', 'response', 'request_headers', 'request_body' ];

const mk = (tag: string, venueHead: string) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `astfx-he-${tag}-`));
    fs.mkdirSync(path.join(root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync(path.join(root, 'ts/src/base/Exchange.ts'), 'export interface Dict { [key: string]: any }\nexport type int = number;\nexport default class Exchange {\n    id: string = \'x\';\n    ' + HE + ' {\n        return undefined;\n    }\n}\n');
    fs.writeFileSync(path.join(root, 'ts/src/venue.ts'), 'import Exchange from \'./base/Exchange.js\';\nimport type { Dict, int } from \'./base/Exchange.js\';\nexport default class venue extends Exchange {\n    override ' + venueHead + ' {\n        if (body.indexOf (\'LOT\') >= 0) {\n            throw new Error (this.id + \' \' + body);\n        }\n        if (url.indexOf (\'order\') < 0) {\n            return undefined;\n        }\n        return undefined;\n    }\n}\n');
    const t = new Transpiler({ 'verbose': false, 'rust': { 'virtualDispatch': { handle_errors: SLOTS }, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    return { base: t.transpileRustByPath(path.join(root, 'ts/src/base/Exchange.ts')).content, venue: t.transpileRustByPath(path.join(root, 'ts/src/venue.ts')).content };
};

describe('the handleErrors override group types its string parameters together', () => {
    test('every declaration spells them string: base, override and the trait slot take &str', () => {
        const { base, venue } = mk('ok', HE);
        expect(venue).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, (mut )?code: Value, reason: &str, url: &str, method: &str, (mut )?headers: Value, body: &str, /);
        expect(base).toMatch(/fn handle_?[eE]rrors\(&(mut )?self, (mut )?code: Value, reason: &str, url: &str, method: &str, (mut )?headers: Value, body: &str, /);
        expect(rustDispatch.slotParams(SLOTS)).toBe('code: crate::Value, reason: &str, url: &str, method: &str, headers: crate::Value, body: &str, response: crate::Value, request_headers: crate::Value, request_body: crate::Value');
        expect(rustDispatch.slotValue('body', 5)).toBe('crate::Value::from(body)');
        // a name at another index is not a string slot
        expect(rustDispatch.isSlotStr('body', 4)).toBe(false);
    });
    test('negative: one declaration spelling a parameter differently keeps that parameter Value', () => {
        const { venue } = mk('no', HE.replace('body: string', 'body: any'));
        expect(venue).toMatch(/reason: &str, url: &str, method: &str, (mut )?headers: Value, (mut )?body: Value, /);
    });
});

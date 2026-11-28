import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    secret: string = '';\n    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n    safeBool (o: any, k: any, d: any = undefined): any { return o; }\n    encode (x: any): any { return x; }\n    hold (x: any): any { return x; }\n    parseToInt (x: any): any { return x; }\n}\n";
const venue = "import venueApi from './abstract/venue.js';\nimport type { Dict, Str } from './base/Exchange.js';\nfunction rsa (request: string, secret: string, hash: any): string { return request; }\nexport default class venue extends venueApi {\n" +
    "    convertSecretToPem (secret: any): string {\n        const n = this.parseToInt (secret.length / 64);\n        let pem = 'a';\n        pem = pem + 'b';\n        return pem;\n    }\n" +
    "    signIt (hash: string): Dict {\n        const cacheSecretAsPem = this.safeBool (this.options, 'cacheSecretAsPem', true);\n        let pem: Str = undefined;\n        if (cacheSecretAsPem) {\n            const cachedPem = this.safeString (this.options, 'pem');\n            if (cachedPem === undefined) {\n                pem = this.convertSecretToPem (this.encode (this.secret));\n                this.options['pem'] = pem;\n            } else {\n                pem = cachedPem;\n            }\n        } else {\n            pem = this.convertSecretToPem (this.encode (this.secret));\n        }\n        return { 'sig': rsa (hash, pem, 'x') };\n    }\n" +
    "    splitIt (row: Dict, spot: boolean): Dict {\n        let baseId = this.safeString (row, 'b', '');\n        let quoteId = this.safeString (row, 'q', '');\n        const underlying = this.safeString (row, 'uly');\n        if ((underlying !== undefined) && !spot) {\n            const parts = underlying.split ('-');\n            baseId = this.safeString (parts, 0, '');\n            quoteId = this.safeString (parts, 1, '');\n        }\n        if ((baseId === '') && spot) {\n            const instId = this.safeString (row, 'instId', '');\n            const parts = instId.split ('-');\n            baseId = this.safeString (parts, 0, '');\n        }\n        return { 'b': baseId, 'q': quoteId };\n    }\n" +
    "    other (row: Dict): Dict {\n        let rate = undefined;\n        rate = this.hold (row);\n        return { 'rate': rate };\n    }\n}\n";
const api = "import Exchange from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h51r44-'));
for (const [rel, text] of Object.entries ({ 'ts/src/base/Exchange.ts': base, 'ts/src/abstract/venue.ts': api, 'ts/src/venue.ts': venue })) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
    if (process.env.H51R44_DUMP) fs.writeFileSync (process.env.H51R44_DUMP, out);
});

describe ('rust split list locals with the same name in sibling blocks', () => {
    test ('both split locals are typed lists (fails on the base printer)', () => {
        const body = out.slice (out.indexOf ('fn splitIt'), out.indexOf ('fn other'));
        expect (body).toMatch (/let mut parts: crate::value::List = Value::Array\(if let Some\(__s\) = underlying/);
        expect (body).toMatch (/let mut parts: crate::value::List = Value::Array\(instId\.split/);
        expect (body).not.toContain ('let mut parts: Value');
    });
    test ('negative: a nil local written from an any-returning call keeps the Value', () => {
        expect (out).toMatch (/let mut rate: Value = Value::Null;/);
    });
    test ('negative: the nil pem local stored into options keeps the Value', () => {
        expect (out).toMatch (/let mut pem: Value = Value::Null;/);
    });
});

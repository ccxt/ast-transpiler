import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    safeString (o: any, k: any, d: any = undefined): Str { return o; }\n    hold (x: any): any { return x; }\n}\n";
const venue = "import venueApi from './abstract/venue.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends venueApi {\n" +
    "    buildIt (row: Dict, up: boolean, price: string): Dict {\n        const placeOrder: Dict = {};\n        if (up) {\n            const req: Dict = {};\n            req['above'] = price;\n            const trigger: Dict = {\n                'price_trigger': {\n                    'price_requirement': req,\n                },\n            };\n            placeOrder['trigger'] = trigger;\n        } else {\n            const req: Dict = {};\n            req['below'] = price;\n            const trigger: Dict = {\n                'price_trigger': {\n                    'price_requirement': req,\n                },\n            };\n            placeOrder['trigger'] = trigger;\n        }\n        return placeOrder;\n    }\n" +
    "    twice (up: boolean, price: string): Dict {\n        const placeOrder: Dict = {};\n        const other: Dict = {};\n        if (up) {\n            const trigger: Dict = { 'p': price };\n            placeOrder['trigger'] = trigger;\n            other['trigger'] = trigger;\n        } else {\n            const trigger: Dict = { 'p': price };\n            placeOrder['trigger'] = trigger;\n        }\n        return this.hold ([ placeOrder, other ]);\n    }\n" +
    "    single (up: boolean, price: string): Dict {\n        const placeOrder: Dict = {};\n        if (up) {\n            const trigger: Dict = { 'p': price };\n            placeOrder['trigger'] = trigger;\n        }\n        return placeOrder;\n    }\n}\n";
const api = "import Exchange from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h52r44-'));
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
    if (process.env.H52R44_DUMP) fs.writeFileSync (process.env.H52R44_DUMP, out);
});

describe ('rust literal dict locals with a same-named sibling, written once into a map', () => {
    test ('both sibling literals are typed maps, moved into the write (fails on the base printer)', () => {
        const body = out.slice (out.indexOf ('fn buildIt'), out.indexOf ('fn twice'));
        expect (body).not.toContain ('let trigger: Value');
        expect (body).not.toContain ('let mut trigger: Value');
        expect (body).not.toContain ('trigger.clone()');
    });
    test ('the sibling literal is moved whole into the write', () => {
        const body = out.slice (out.indexOf ('fn buildIt'), out.indexOf ('fn twice'));
        expect (body).toMatch (/let mut trigger: indexmap::IndexMap<String, Value> = /);
        expect (body).toContain ('placeOrder.insert("trigger".into(), Value::Map(trigger));');
    });
    test ('negative: a sibling literal written into two maps keeps the Value', () => {
        const body = out.slice (out.indexOf ('fn twice'), out.indexOf ('fn single'));
        expect (body).toMatch (/let mut trigger: Value = Value::Map/);
    });
});

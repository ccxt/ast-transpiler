import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a venue-private `amount: number` slot whose every caller passes its own typed `f64` parameter prints `f64`
const base = "export interface Dict { [key: string]: any }\nexport type Num = number | undefined;\nexport default class Exchange {\n    async addMargin (symbol: string, amount: number, params: Dict = {}): Promise<Dict> {\n        return {};\n    }\n    async reduceMargin (symbol: string, amount: number, params: Dict = {}): Promise<Dict> {\n        return {};\n    }\n}\n";
const venue = (helperArg: string, reduceArg: string) => "import Exchange, { Dict, Num } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async helper (symbol: string, amount: " + helperArg + ", type: string, params: Dict = {}): Promise<Dict> {\n        const request: Dict = {\n            'margin': amount,\n            'type': type,\n        };\n        return request;\n    }\n    override async addMargin (symbol: string, amount: number, params: Dict = {}): Promise<Dict> {\n        return await this.helper (symbol, amount, 'add', params);\n    }\n    override async reduceMargin (symbol: string, amount: number, params: Dict = {}): Promise<Dict> {\n        return await this.helper (symbol, " + reduceArg + ", 'reduce', params);\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-venuefloatarg-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (helperArg: string, reduceArg: string): string {
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), venue (helperArg, reduceArg));
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'addMargin', 'reduceMargin' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
}

describe ('venue-private number slot fed only by typed f64 parameters', () => {
    test ('number: the helper takes amount: f64 and callers pass it as is', () => {
        const v = run ('number', 'amount');
        expect (v).toMatch (/fn helper\(&(mut )?self, symbol: &str, amount: f64, /);
        expect (v).not.toMatch (/helper\([^\n]*Value::from\(amount\)/);
    });
    test ('Num: the helper takes amount: Option<f64>', () => {
        const v = run ('Num', 'amount');
        expect (v).toMatch (/fn helper\(&(mut )?self, symbol: &str, amount: Option<f64>, /);
    });
    test ('negative: a negated argument keeps the Value slot', () => {
        const v = run ('number', '-amount');
        expect (v).toMatch (/fn helper\(&(mut )?self, symbol: &str, (mut )?amount: Value, /);
    });
    test ('negative: an any declaration keeps the Value slot', () => {
        const v = run ('any', 'amount');
        expect (v).toMatch (/fn helper\(&(mut )?self, symbol: &str, (mut )?amount: Value, /);
    });
});

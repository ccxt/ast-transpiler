import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// a typed `enableDemoTrading (enable: boolean)` prints a `bool` parameter in the base and every override
const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    options: Dict = {};\n    urls: Dict = {};\n    enableDemoTrading (enable: boolean) {\n        if (enable) {\n            this.urls['api'] = this.urls['demo'];\n        }\n        this.options['enableDemoTrading'] = enable;\n    }\n    otherFlag (enable: boolean) {\n        this.options['other'] = enable;\n    }\n}\n";
const venue = "import Exchange from './base/Exchange.js';\nexport default class venue extends Exchange {\n    override enableDemoTrading (enabled: boolean) {\n        this.options['demo'] = enabled;\n    }\n    override otherFlag (enable: boolean) {\n        this.options['other'] = enable;\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-h47r24-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (file: string, typed: string[]): string {
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), venue);
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': typed, 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, file)).content;
}

describe ('typed enableDemoTrading: the enable flag is a bool', () => {
    test ('base and override print a bool parameter and rebind the Value body', () => {
        const b = run ('ts/src/base/Exchange.ts', [ 'enableDemoTrading' ]);
        expect (b).toContain ('pub fn enableDemoTrading(&self, enable: bool) -> crate::Result<()>');
        expect (b).toContain ('let __args: Vec<Value> = vec![Value::from(enable)];');
        const v = run ('ts/src/venue.ts', [ 'enableDemoTrading' ]);
        expect (v).toContain ('pub fn enableDemoTrading(&self, enabled: bool) -> crate::Result<()>');
    });
    test ('negative: a boolean method not in typedUnified keeps the Value parameter', () => {
        const v = run ('ts/src/venue.ts', [ 'enableDemoTrading' ]);
        expect (v).not.toContain ('pub fn otherFlag(&self, enable: bool)');
        expect (v).toContain ('pub fn otherFlag(&self, enable: Value)');
    });
    test ('negative: without the typedUnified entry the method keeps the Value parameter', () => {
        const v = run ('ts/src/venue.ts', []);
        expect (v).toContain ('pub fn enableDemoTrading(&self, enabled: Value)');
    });
});

import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// setPositionMode answers the endpoint's map: the typed signature returns `Option<crate::value::Dict>`, the `hedged` flag stays as printed
const base = "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport default class Exchange {\n    extend (a: any, b: any): any { return a; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async setPositionMode (hedged: boolean, symbol: Str = undefined, params: Dict = {}): Promise<{}> {\n        return {};\n    }\n}\n";
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    async privatePostMode (params: Dict = {}): Promise<Dict> {\n        return {};\n    }\n    async setPositionMode (hedged: boolean, symbol: Str = undefined, params: Dict = {}): Promise<Dict> {\n        const request: Dict = { 'hedged': hedged };\n        return await this.privatePostMode (this.extend (request, params));\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-x10-'));
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));
jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

function run (dir: string, typed: string[]): string {
    fs.mkdirSync (path.join (root, dir, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, dir, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, dir, 'ts/src/venue.ts'), venue);
    return new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': typed, 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, dir, 'ts/src/venue.ts')).content;
}

describe ('h49-X10: setPositionMode returns the endpoint map', () => {
    test ('positive: a typed setPositionMode returns Option<Dict>', () => {
        const out = run ('pos', [ 'setPositionMode' ]);
        expect (out).toMatch (/fn setPositionMode\([^)]*\) -> crate::Result<Option<crate::value::Dict>>/);
    });
    test ('negative: not in typedUnified keeps the Value signature', () => {
        const out = run ('neg', []);
        expect (out).not.toContain ('Option<crate::value::Dict>>');
    });
});

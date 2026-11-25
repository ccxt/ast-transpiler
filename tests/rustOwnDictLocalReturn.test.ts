import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const base = "export interface Dict { [key: string]: any }\nexport type List = any[];\nexport type Int = number | undefined;\nexport default class Exchange {\n    options: Dict = {};\n    omit (o: any, k: any): any { return o; }\n    extend (...a: any[]): any { return a; }\n    safeInteger (o: any, k: any, d: any = undefined): Int { return o; }\n    iso8601 (x: any): string { return x; }\n    hold (x: any): any { return x; }\n}\n";
const venue = "import venueApi from './abstract/venue.js';\nimport type { Dict, Int } from './base/Exchange.js';\nexport default class venue extends venueApi {\n    cleanParams (params: Dict): Dict {\n        const paramsOmitted: Dict = this.omit (params, [ 'type', 'settle' ]);\n        return paramsOmitted;\n    }\n    handleRange (since: Int = undefined, params: Dict = {}): Dict {\n        const timeParams: Dict = {};\n        timeParams['a'] = this.iso8601 (since);\n        const merged: Dict = this.extend (params, timeParams);\n        const paramsResult: Dict = (since === undefined) ? this.omit (merged, 'until') : merged;\n        return paramsResult;\n    }\n    mergedParams (params: Dict): Dict {\n        const timeParams: Dict = {};\n        const merged: Dict = this.extend (params, timeParams);\n        return merged;\n    }\n    builtParams (since: Int = undefined): Dict {\n        const timeParams: Dict = {};\n        timeParams['a'] = this.iso8601 (since);\n        return timeParams;\n    }\n    looseParams (params: Dict): Dict {\n        const loose = this.omit (params, [ 'type' ]);\n        return loose;\n    }\n    async fetchA (params: Dict = {}): Promise<Dict> {\n        const paramsValue: Dict = this.cleanParams (params);\n        const ranged: Dict = this.handleRange (undefined, paramsValue);\n        return await this.publicGetRows (ranged);\n    }\n}\n";
const api = "import Exchange from '../base/Exchange.js';\nimport type { Dict } from '../base/Exchange.js';\nexport default abstract class venueApi extends Exchange {\n    publicGetRows (params = {}): Promise<Dict> { return this.hold (params); }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-owndictlocal-'));
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
});

// a venue method declared `Dict` whose return is a local declared `Dict` returns the map: the caller's conversion moves into it
describe ('rust own Dict return through a Dict-annotated local', () => {
    test ('returns the map of the annotated local', () => {
        expect (out).toMatch (/fn cleanParams\([^\n]*\) -> crate::value::Dict \{/);
        expect (out).toMatch (/return paramsOmitted\.into_dict\(\);/);
        expect (out).toMatch (/fn handleRange\([^\n]*\) -> crate::value::Dict \{/);
    });
    test ('typed callers take the map without a conversion', () => {
        expect (out).toMatch (/let mut paramsValue: crate::value::Dict = self\.cleanParams\(params\);/);
        expect (out).not.toMatch (/self\.cleanParams\([^\n]*\)\.into_dict\(\)/);
    });
    test ('a local already printed as a map is handed on as is', () => {
        expect (out).not.toMatch (/return merged\.into_dict\(\)/);
    });
    test ('negative: an unannotated local keeps the Value return', () => {
        expect (out).toMatch (/fn looseParams\([^\n]*\) -> Value \{/);
    });
});

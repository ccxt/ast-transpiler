import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'own-record-parse-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), "export interface Dict { [key: string]: any }\nexport interface MarginModification { info: any; symbol: string; type?: string; amount?: number; }\nexport default class Exchange {\n    extend (...args: any[]): any { return Object.assign ({}, ...args); }\n    keep (p: any): any { return p; }\n    parseMarginModification (data: Dict, market: any = undefined): MarginModification { return { 'info': data, 'symbol': '' }; }\n}\n");
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, MarginModification } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

const PARSER = (ret: string) => "    parseMarginModification (data: Dict, market: any = undefined): " + ret + " {\n        return { 'info': data, 'symbol': '' };\n    }\n";
const HELPER = "    async modifyMarginHelper (symbol: string, amount: number, params: Dict = {}): Promise<MarginModification> {\n        const response = await this.keep (params);\n        return this.parseMarginModification (response, symbol);\n    }\n";

// a venue-private method declared `Promise<MarginModification>` returning its own record parser hands on that map
describe ('rust venue-private record return from its own record parser', () => {
    test ('a parser declared MarginModification: `-> crate::value::Dict`', () => {
        const out = run (HELPER + PARSER ('MarginModification'));
        expect (out).toMatch (/fn modifyMarginHelper\([^\n]*\) -> crate::value::Dict \{/);
        expect (out).toContain ('.into_dict();');
    });
    test ('negative: a parser declared Dict keeps Value', () => {
        const out = run (HELPER + PARSER ('Dict'));
        expect (out).toMatch (/fn modifyMarginHelper\([^\n]*\) -> Value \{/);
    });
    test ('negative: a nullable parser keeps Value', () => {
        const out = run (HELPER + PARSER ('MarginModification | undefined'));
        expect (out).toMatch (/fn modifyMarginHelper\([^\n]*\) -> Value \{/);
    });
});

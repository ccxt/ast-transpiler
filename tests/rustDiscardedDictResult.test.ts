import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

const base = "export interface Dict { [key: string]: any }\nexport default class Exchange {\n    options: Dict = {};\n    extend (...a: any[]): any { return a; }\n}\n";
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict } from './base/Exchange.js';\nexport default class venue extends Exchange {\n    pong (message: Dict): Dict {\n        const out: Dict = {};\n        out['m'] = message;\n        return out;\n    }\n    async loadCreds (params: Dict = {}): Promise<Dict> {\n        const creds: Dict = {};\n        creds['p'] = params;\n        return creds;\n    }\n    async dropBoth (message: Dict): Promise<Dict> {\n        this.pong (message);\n        await this.loadCreds ();\n        return {};\n    }\n    async keepBoth (message: Dict): Promise<any> {\n        const kept = this.pong (message);\n        const got = await this.loadCreds ();\n        return [ kept, got ];\n    }\n}\n";
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-discarded-'));
for (const [rel, text] of Object.entries ({ 'ts/src/base/Exchange.ts': base, 'ts/src/venue.ts': venue })) {
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

const body = (name: string): string => {
    const at = out.search (new RegExp (`fn ${name}\\(`));
    const next = out.indexOf ('\n    }\n', at);
    return out.slice (at, next);
};

// a Dict-returning call written as a statement throws its result away: it prints the bare call, not a box
describe ('rust discarded Dict result is not boxed', () => {
    test ('the methods return the map', () => {
        expect (out).toMatch (/fn pong\([^\n]*\) -> crate::value::Dict \{/);
    });
    test ('a sync call statement prints bare', () => {
        expect (body ('dropBoth')).toMatch (/^\s*self\.pong\([^\n]*\);$/m);
        expect (body ('dropBoth')).not.toContain ('Value::Dict(self.pong(');
    });
    test ('an awaited call statement prints bare', () => {
        expect (body ('dropBoth')).toMatch (/^\s*self\.loadCreds\([^\n]*\)\.await;$/m);
        expect (body ('dropBoth')).not.toContain ('Value::Dict(self.loadCreds(');
    });
    test ('negative: a used result keeps its form', () => {
        const kept = body ('keepBoth');
        expect (kept).toMatch (/self\.pong\(/);
        expect (kept).toMatch (/self\.loadCreds\(/);
        expect (kept).not.toMatch (/^\s*self\.pong\([^\n]*\);$/m);
        expect (kept).not.toMatch (/^\s*self\.loadCreds\([^\n]*\)\.await;$/m);
    });
});

import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

// an async venue method whose every declaration returns nothing and whose result no caller reads prints no `-> Value`
const files: Record<string, string> = {
    "ts/src/base/Exchange.ts": "export default class Exchange {\n    spawn (m: any, ...args: any): any { return undefined; }\n    async keepAlive (x: any) {\n        return;\n    }\n}\n",
    "ts/src/pro/alpha.ts": "import Exchange from '../base/Exchange.js';\nexport default class alpha extends Exchange {\n    async pong (client: any, message: any) {\n        await client.send ({ 'pong': 1 });\n    }\n    handlePing (client: any, message: any) {\n        this.spawn (this.pong, client, message);\n    }\n    async loadSnap (client: any, hash: string) {\n        await client.send (hash);\n    }\n    async readSnap (client: any) {\n        const r = await this.loadSnap (client, 'x');\n        return r;\n    }\n    async giveBack (client: any) {\n        await client.send (1);\n        return client;\n    }\n    async plain (client: any) {\n        await this.giveBack (client);\n    }\n}\n",
    "ts/src/pro/beta.ts": "import Exchange from '../base/Exchange.js';\nexport default class beta extends Exchange {\n    async pong (client: any, message: any) {\n        await client.send ({ 'op': 'pong' });\n    }\n    async keepAlive (x: any) {\n        await x.send (1);\n    }\n}\n",
};
const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-asyncnovalue-'));
for (const [rel, text] of Object.entries (files)) {
    fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
    fs.writeFileSync (path.join (root, rel), text);
}
afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

let out = '';
beforeAll (() => {
    const transpiler = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    out = transpiler.transpileRustByPath (path.join (root, 'ts/src/pro/alpha.ts')).content;
});

describe ('rust async methods that return no value', () => {
    test ('a spawned no-value method in every venue prints no return type', () => {
        expect (out).toMatch (/fn pong\([^)]*\) \{/);
        expect (out).not.toMatch (/fn pong\([^)]*\) -> Value/);
    });
    test ('negative: a method whose result a caller reads keeps -> Value', () => {
        expect (out).toMatch (/fn loadSnap\([^)]*\) -> Value/);
    });
    test ('negative: a method that returns a value keeps -> Value', () => {
        expect (out).toMatch (/fn giveBack\([^)]*\) -> Value/);
    });
    test ('negative: a method with a base-tier declaration keeps its signature', () => {
        const beta = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } }).transpileRustByPath (path.join (root, 'ts/src/pro/beta.ts')).content;
        expect (beta).toMatch (/fn keepAlive\([^)]*\) -> Value/);
        expect (beta).toMatch (/fn pong\([^)]*\) \{/);
    });
});

import { Transpiler } from '../src/transpiler';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

jest.mock ('module', () => ({ __esModule: true, default: jest.fn () }));

// a venue-private `transferOut (code, amount: number)` that hands `amount` to the typed unified `transfer`
const base = "export interface Dict { [key: string]: any }\nexport interface TransferEntry { info?: any; id?: string; amount?: number; }\nexport default class Exchange {\n    extend (...args: any[]): any { return Object.assign ({}, ...args); }\n    keep (p: any): any { return p; }\n    parseTransfer (transfer: Dict, currency: any = undefined): TransferEntry { return { 'info': transfer }; }\n    // METHODS BELOW THIS LINE ARE TRANSPILED FROM TYPESCRIPT\n    async transfer (code: string, amount: number, fromAccount: string, toAccount: string, params: Dict = {}): Promise<TransferEntry> {\n        return {};\n    }\n}\n";
const run = (body: string) => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r27-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, TransferEntry } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'transfer' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

const FORWARD = "    async transferOut (code: string, amount: number, params: Dict = {}): Promise<TransferEntry> {\n        return await this.transfer (code, amount, 'a', 'b', params);\n    }\n";
const HELPER = "    async futuresTransfer (code: string, amount: number, type: number, params: Dict = {}): Promise<TransferEntry> {\n        const response = await this.keep (this.extend ({ 'amount': amount, 'type': type }, params));\n        return this.parseTransfer (response);\n    }\n    async transferOut (code: string, amount: number, params: Dict = {}): Promise<TransferEntry> {\n        return await this.futuresTransfer (code, amount, 2, params);\n    }\n";

// a child venue forwarding to a helper declared in its parent venue file (binanceusdm -> binance futuresTransfer)
const runChild = () => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r27-'));
    fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, TransferEntry } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + HELPER.replace (/    async transferOut[\s\S]*$/, '') + "}\n");
    fs.writeFileSync (path.join (root, 'ts/src/child.ts'), "import venue from './venue.js';\nimport type { Dict, TransferEntry } from './base/Exchange.js';\nexport default class child extends venue {\n    async transferOut (code: string, amount: number, params: Dict = {}): Promise<TransferEntry> {\n        return await this.futuresTransfer (code, amount, 2, params);\n    }\n}\n");
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'transfer' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    try { return t.transpileRustByPath (path.join (root, 'ts/src/child.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
};

describe ('rust venue-private transferOut', () => {
    test ('amount handed to the typed transfer prints f64', () => {
        const out = run (FORWARD);
        expect (out).toMatch (/fn transferOut\(&(?:mut )?self, code: &str, amount: f64, [^\n]*\n(?![^\n]*let mut amount)/);
        expect (out).toContain ('self.transfer(code.as_str().unwrap_or_default(), amount, ');
    });
    test ('a helper that returns its record parser: transferOut returns the map', () => {
        const out = run (HELPER);
        expect (out).toMatch (/fn transferOut\([^\n]*\) -> crate::value::Dict \{/);
    });
    test ('negative: a forwarder to a parent venue file helper keeps Value', () => {
        const out = runChild ();
        expect (out).toMatch (/fn transferOut\([^\n]*\) -> Value \{/);
    });
    test ('negative: a helper a child venue file calls keeps Value in its own file', () => {
        const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h46r27-'));
        fs.mkdirSync (path.join (root, 'ts/src/base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts/src/base/Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts/src/venue.ts'), "import Exchange from './base/Exchange.js';\nimport type { Dict, TransferEntry } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + HELPER.replace (/    async transferOut[\s\S]*$/, '') + "}\n");
        fs.writeFileSync (path.join (root, 'ts/src/child.ts'), "import venue from './venue.js';\nimport type { Dict, TransferEntry } from './base/Exchange.js';\nexport default class child extends venue {\n    async transferOut (code: string, amount: number, params: Dict = {}): Promise<TransferEntry> {\n        return await this.futuresTransfer (code, amount, 2, params);\n    }\n}\n");
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': [ 'transfer' ], 'parser': { 'NUM_LINES_END_FILE': 0 } } });
        let out = '';
        try { out = t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content; } finally { fs.rmSync (root, { recursive: true, force: true }); }
        expect (out).toMatch (/fn futuresTransfer\([^\n]*\) -> Value \{/);
    });
    test ('negative: amount also written keeps Value', () => {
        const out = run (FORWARD.replace ('        return', '        amount = amount * 2;\n        return'));
        expect (out).not.toMatch (/fn transferOut\([^\n]*amount: f64/);
    });
});

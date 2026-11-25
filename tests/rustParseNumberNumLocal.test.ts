import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function run (body: string, typed: string[] = []): string {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'astfx-rs-pnnum-'));
    const files: Record<string, string> = {
        'ts/src/base/Exchange.ts': "export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type Num = number | undefined;\nexport type int = number;\nexport default class Exchange {\n    parseNumber (x: any, d: Num = undefined): Num { return x; }\n    parseToInt (x: any): number { return x; }\n    safeInteger (o: any, k: any, d: any = undefined): number { return o[k] ?? d; }\n    async privatePostX (p: any = {}): Promise<any> { return p; }\n}\n",
        'ts/src/venue.ts': "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, int } from './base/Exchange.js';\nexport default class venue extends Exchange {\n" + body + "}\n",
    };
    for (const [rel, text] of Object.entries (files)) {
        fs.mkdirSync (path.dirname (path.join (root, rel)), { recursive: true });
        fs.writeFileSync (path.join (root, rel), text);
    }
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'typedUnified': typed, 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    t.transpileRustByPath (path.join (root, 'ts/src/base/Exchange.ts'));
    return t.transpileRustByPath (path.join (root, 'ts/src/venue.ts')).content;
}

describe ('a number local seeded from parseNumber is an Option<f64>', () => {
    test ('compared against bounds (int parameter)', () => {
        const out = run ("    async setLeverage (leverage: int, symbol: Str = undefined, params: Dict = {}): Promise<Dict> {\n        const maxLeverage = this.safeInteger (params, 'max', 50);\n        const leverageNum: number = this.parseNumber (leverage);\n        if ((leverageNum < 1) || (leverageNum > maxLeverage)) {\n            throw new Error ('bad');\n        }\n        return await this.privatePostX ({ 'leverage': leverage });\n    }\n", [ 'setLeverage' ]);
        expect (out).toMatch (/let (mut )?leverageNum: Option<f64> = self\.parse_?[nN]umber\([^;]*\.as_f64\(\);/);
        expect (out).not.toMatch (/let (mut )?leverageNum: Value/);
        // the i64 bound reads the payload: None is false like the boxed NaN compare
        expect (out).toContain ('matches!(leverageNum, Some(__p) if __p > ');
    });
    test ('divisor of an any parameter', () => {
        const out = run ("    async modifyLeverage (leverage: int, params: Dict = {}): Promise<Dict> {\n        const leverageNum: number = this.parseNumber (leverage);\n        const request: Dict = { 'f': this.parseToInt (10000 / leverageNum) };\n        return await this.privatePostX (request);\n    }\n");
        expect (out).toMatch (/leverageNum: Option<f64> = /);
        // a zero divisor answers None (the helper's Null), never Infinity
        expect (out).toMatch (/if __y != 0\.0 \{ Some\(__x \/ __y\) \} else \{ None \}/);
        expect (out).not.toContain ('Value::Float(x / y)');
    });
    test ('negative: boxed into a literal keeps the Value (an Int stays Int)', () => {
        const out = run ("    async modifyLeverage (leverage: int, params: Dict = {}): Promise<Dict> {\n        const leverageNum: number = this.parseNumber (leverage);\n        if (leverageNum < 1) { throw new Error ('bad'); }\n        return await this.privatePostX ({ 'l': leverageNum });\n    }\n");
        expect (out).toMatch (/leverageNum: Value = /);
    });
    test ('negative: an unannotated parseNumber local of an any parameter keeps the Value', () => {
        const out = run ("    async modifyLeverage (leverage, params: Dict = {}): Promise<Dict> {\n        const leverageNum = this.parseNumber (leverage);\n        if (leverageNum < 1) { throw new Error ('bad'); }\n        return await this.privatePostX ({});\n    }\n");
        expect (out).not.toMatch (/leverageNum: Option<f64>/);
    });
});

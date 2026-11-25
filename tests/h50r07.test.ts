import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue parser's read-only `info: Dict` whose last use is the `'info'` entry takes the dict handle
const base = 'export interface Dict { [key: string]: any }\nexport type Str = string | undefined;\nexport type NullableDict = Dict | undefined;\n' +
    'export default class Exchange {\n    safeString (o: any, k: any, d: Str = undefined): Str { return o; }\n' +
    '    safeNumber (o: any, k: any, d: any = undefined): any { return o; }\n' +
    '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o; }\n    hold (x: any): any { return x; }\n}\n';
const venue = "import Exchange from './base/Exchange.js';\nimport type { Dict, Str, NullableDict } from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    "    async fetchLoan (code: string, params = {}) {\n        const response: Dict = await this.hold (params);\n        const data = this.safeDict (response, 'data', {});\n        return this.parseLoan (data, code);\n    }\n" +
    "    parseLoan (info: Dict, code: Str = undefined): Dict {\n        const id = this.safeString (info, 'id');\n        return {\n            'id': id,\n            'amount': this.safeNumber (info, 'amt'),\n            'info': info,\n        };\n    }\n" +
    "    async fetchLoan2 (code: string, params = {}) {\n        const response: Dict = await this.hold (params);\n        const data = this.safeDict (response, 'data', {});\n        return this.parseNullLoan (data, code);\n    }\n" +
    "    async fetchLoan4 (code: string, params = {}) {\n        const response: Dict = await this.hold (params);\n        const data = this.safeDict (response, 'data', {});\n        const transaction: Dict = this.parseBareLoan (data, code);\n        return transaction;\n    }\n" +
    "    parseBareLoan (info: Dict, code: Str = undefined): Dict {\n        return {\n            'id': undefined,\n            'info': info,\n        };\n    }\n" +
    "    parseNullLoan (info: NullableDict, code: Str = undefined): Dict {\n        return {\n            'id': this.safeString (info, 'id'),\n            'info': info,\n        };\n    }\n" +
    "    async fetchLoan3 (code: string, params = {}) {\n        const response: Dict = await this.hold (params);\n        const data = this.safeDict (response, 'data', {});\n        return this.parseHeldLoan (data, code);\n    }\n" +
    "    parseHeldLoan (info: Dict, code: Str = undefined): Dict {\n        this.hold (info);\n        return {\n            'id': this.safeString (info, 'id'),\n            'info': info,\n        };\n    }\n}\n";

describe ('rust venue parser info: Dict at its last-use info entry', () => {
    let output = '';
    let root = '';
    beforeAll (() => {
        root = fs.mkdtempSync (path.join (os.tmpdir (), 'h50r07-'));
        fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
        fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue);
        const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
        output = t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    });
    afterAll (() => fs.rmSync (root, { recursive: true, force: true }));

    test ('the slot is the dict handle and the info entry shares it', () => {
        const fn = output.slice (output.indexOf ('fn parseLoan('), output.indexOf ('fn fetchLoan2('));
        expect (fn).toMatch (/info: &crate::value::Dict[,)]/);
        expect (fn).not.toMatch (/info\.into\(\)/);
        expect (fn).toMatch (/"info"[^\n]*Value::from\(info\)\)/);
    });

    test ('an info entry that is the only use takes the dict handle too', () => {
        expect (output).toMatch (/fn parseBareLoan\(&self, info: &crate::value::Dict[,)]/);
        expect (output).toMatch (/self\.parseBareLoan\(&data/);
    });

    test ('negatives keep the Value slot', () => {
        // a nullable row and a row handed to a runtime method whole stay boxed
        expect (output).not.toMatch (/fn parseNullLoan\([^)]*info: &/);
        expect (output).not.toMatch (/fn parseHeldLoan\([^)]*info: &/);
    });
});

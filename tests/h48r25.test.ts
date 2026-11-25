import { Transpiler } from '../src/transpiler';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// a venue handleBuilderFeeApproval declared `Promise<boolean>` prints `-> bool`; its awaited callers read the bool as is
const base = 'export type Dict = { [key: string]: any };\n' +
    'export default class Exchange {\n    options: Dict = {};\n    hold (x: any): any { return x; }\n' +
    '    safeBool (o: any, k: string, d: boolean = undefined): boolean { return o[k] ?? d; }\n}\n';
const venue = (ret: string) => "import Exchange from './base/Exchange.js';\n" +
    'export default class venue extends Exchange {\n' +
    '    async approveIt (n: number): Promise<any> {\n        return this.hold (n);\n    }\n' +
    '    async handleBuilderFeeApproval (n: number): ' + ret + ' {\n' +
    "        const buildFee = this.safeBool (this.options, 'builderFee', true);\n" +
    '        if (!buildFee) {\n            return false;\n        }\n' +
    '        try {\n            await this.approveIt (n);\n        } catch (e) {\n            return false;\n        }\n' +
    '        return true;\n    }\n' +
    '    async initializeClient (): Promise<boolean> {\n' +
    '        const ok = await this.handleBuilderFeeApproval (1);\n' +
    '        await this.handleBuilderFeeApproval (2);\n' +
    '        const fee: boolean = await this.handleBuilderFeeApproval (3);\n' +
    '        if (!fee) {\n            return false;\n        }\n' +
    '        if (ok) {\n            return true;\n        }\n        return false;\n    }\n}\n';

const run = (ret: string): string => {
    const root = fs.mkdtempSync (path.join (os.tmpdir (), 'h48r25-'));
    fs.mkdirSync (path.join (root, 'ts', 'src', 'base'), { recursive: true });
    fs.writeFileSync (path.join (root, 'ts', 'src', 'base', 'Exchange.ts'), base);
    fs.writeFileSync (path.join (root, 'ts', 'src', 'venue.ts'), venue (ret));
    const t = new Transpiler ({ 'verbose': false, 'rust': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
    try {
        return t.transpileRustByPath (path.join (root, 'ts', 'src', 'venue.ts')).content;
    } finally {
        fs.rmSync (root, { recursive: true, force: true });
    }
};

describe ('rust venue handleBuilderFeeApproval prints -> bool', () => {
    test ('declared Promise<boolean>: native bool return, awaited callers read it with no decode', () => {
        const out = run ('Promise<boolean>');
        expect (out).toMatch (/pub (?:async )?fn handleBuilderFeeApproval\([^)]*\) -> bool \{/);
        expect (out).toContain ('return false;');
        expect (out).toContain ('return true;');
        expect (out).not.toMatch (/handleBuilderFeeApproval\([^)]*\)\.await\.as_bool\(\)/);
        expect (out).toContain ('let mut fee: bool = self.handleBuilderFeeApproval(Value::Int(3)).await;');
        expect (out).toContain ('let mut ok: bool = self.handleBuilderFeeApproval(Value::Int(1)).await;');
        expect (out).toMatch (/\n\s*self\.handleBuilderFeeApproval\(Value::Int\(2\)\)\.await;/);
    });
    test ('negative: declared Promise<any> stays a boxed Value return', () => {
        const out = run ('Promise<any>');
        expect (out).toMatch (/pub (?:async )?fn handleBuilderFeeApproval\([^)]*\) -> Value \{/);
        expect (out).not.toContain ('let mut ok: bool = self.handleBuilderFeeApproval(Value::Int(1)).await;');
    });
});

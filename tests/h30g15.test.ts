import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go nil test on a local read by the base safeDict / safeList before any write reaches it', () => {
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h30g15-'));
        try {
            const dir = path.join (tmp, 'ts', 'src', 'base');
            fs.mkdirSync (dir, { 'recursive': true });
            const file = path.join (dir, 'Exchange.ts');
            fs.writeFileSync (file, 'type Dict = { [key: string]: any };\nclass Exchange {\n'
                + '    safeDict (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    safeList (d: any, k: any, dv: any = undefined): any { return d; }\n'
                + '    parseFeeNumeric (f: any): any { return f; }\n'
                + '    run (container: any, q: any) {\n' + body + '\n    }\n}\n');
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { 'recursive': true, 'force': true });
        }
    };
    test('parsedFeeAndFees shape: tests before the rebinds compare natively (fails on the base printer)', () => {
        const out = print ('        let fee = this.safeDict (container, \'fee\');\n        let fees = this.safeList (container, \'fees\');\n'
            + '        const feeDefined = fee !== undefined;\n        const feesDefined = fees !== undefined;\n'
            + '        if (feeDefined) {\n            fee = this.parseFeeNumeric (fee);\n        }\n'
            + '        if (!feesDefined) {\n            fees = [ fee ];\n        }\n'
            + '        if (fee === undefined) {\n            fee = {};\n        }\n        return [ fee, fees ];');
        expect (out).toContain ('var feeDefined bool = (fee != nil)');
        expect (out).toContain ('var feesDefined bool = (fees != nil)');
        // after `fee = this.parseFeeNumeric (fee)` the box may hold anything: the helper stays
        expect (out).toContain ('IsEqual(fee, nil)');
    });
    test('a write before the test keeps the helper', () => {
        const out = print ('        let fee = this.safeDict (container, \'fee\');\n        if (q) {\n            fee = q;\n        }\n'
            + '        if (fee === undefined) {\n            return 1;\n        }\n        return fee;');
        expect (out).toContain ('IsEqual(fee, nil)');
    });
    test('a test inside a loop that also writes the local keeps the helper', () => {
        const out = print ('        let fee = this.safeDict (container, \'fee\');\n        for (let i = 0; i < 3; i++) {\n'
            + '            if (fee === undefined) {\n                return i;\n            }\n            fee = q;\n        }\n        return fee;');
        expect (out).toContain ('IsEqual(fee, nil)');
    });
    test('a non-literal default (may be a typed nil pointer) keeps the helper', () => {
        const out = print ('        const fee = this.safeDict (container, \'fee\', q);\n        if (fee === undefined) {\n            return 1;\n        }\n        return fee;');
        expect (out).toContain ('IsEqual(fee, nil)');
    });
});

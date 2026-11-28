import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go safeDict local filled under its own nil guard', () => {
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k] ?? d; }\n'
        + '    safeString (o: any, k: any): string | undefined { return o[k]; }\n'
        + '    parseTradingFee (fee: Dict, market: Dict = undefined): Dict { return fee; }\n'
        + '    keep (x: any): any { return x; }\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h16g14-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n    f (response: any, market: Dict) {\n' + body + '    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const fill = (value: string, use: string) => '        let fee = this.safeDict (response, market[\'id\']);\n'
        + '        if (fee === undefined) {\n            fee = ' + value + ';\n        }\n' + use;

    test ('a `{}` fill types the local as a map', () => {
        const out = print (fill ('{}', '        return this.parseTradingFee (fee, market);\n'));
        expect (out).toContain ('var fee map[string]any = this.SafeDictMap(response, GetValue(market, "id"))');
        expect (out).toContain ('fee = map[string]any{}');
        expect (out).not.toContain ('var fee any');
    });

    test ('a never-nil safeDict fill types the local as a map', () => {
        const out = print (fill ('this.safeDict (response, \'order\', {})', '        return this.parseTradingFee (fee, market);\n'));
        expect (out).toContain ('var fee map[string]any = this.SafeDictMap(');
        expect (out).toContain ('fee = this.SafeDictMap(response, "order", map[string]any{})');
    });

    test ('negatives keep the box', () => {
        // a fill that is not a map
        expect (print (fill ('[]', '        return this.keep (fee);\n'))).toContain ('var fee any');
        // a fill that may itself be nil, and the value escapes into an `any` slot
        expect (print (fill ('this.safeDict (response, \'order\')', '        return this.keep (fee);\n'))).toContain ('var fee any');
        // the escape happens before the guard: the nil map would reach `keep`
        expect (print ('        let fee = this.safeDict (response, \'x\');\n        this.keep (fee);\n'
            + '        if (fee === undefined) {\n            fee = {};\n        }\n        return this.keep (fee);\n')).toContain ('var fee any');
    });
});

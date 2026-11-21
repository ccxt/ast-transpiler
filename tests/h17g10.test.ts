import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('go nil-tested safeDict locals on markets and client.subscriptions', () => {
    const HEAD = 'type Dict = { [key: string]: any };\n'
        + 'class Exchange {\n'
        + '    safeDict (o: any, k: any, d: Dict = undefined): Dict | undefined { return o[k] ?? d; }\n'
        + '    safeString (o: any, k: any): string | undefined { return o[k]; }\n'
        + '    parseTradingFee (fee: Dict, market: Dict = undefined): Dict { return fee; }\n'
        + '    keep (x: any): any { return x; }\n'
        + '    markets: Dict = {};\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h17g10-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD + '}\nexport default Exchange;\n');
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n    f (client: any, symbol: string, response: any, market: Dict) {\n' + body + '    }\n}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            return new Transpiler (config).transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };

    test ('an exit guard on an options read types the local as a map', () => {
        const out = print ('        const m = this.safeDict (this.options, symbol);\n'
            + '        if ((m === undefined) || (this.safeString (m, \'id\') === undefined)) {\n            throw new Error (symbol);\n        }\n'
            + '        return this.keep (m);\n');
        expect (out).toContain ('var m map[string]any = this.SafeDictMap(this.Options, symbol)');
        expect (out).not.toContain ('var m any');
    });

    test ('a returning nil guard on client.subscriptions types the local as a map', () => {
        const out = print ('        const s = this.safeDict (client.subscriptions, symbol);\n'
            + '        if (s === undefined) {\n            return;\n        }\n        this.keep (s);\n');
        expect (out).toContain ('var s map[string]any = this.SafeDictMap(');
        expect (out).not.toContain ('var s any');
    });

    test ('negatives keep the box', () => {
        // the guard does not leave the block: the nil map would reach keep
        expect (print ('        const m = this.safeDict (this.options, symbol);\n'
            + '        if (m === undefined) {\n            this.keep (1);\n        }\n        return this.keep (m);\n')).toContain ('var m any');
        // the escape comes before the guard
        expect (print ('        const s = this.safeDict (client.subscriptions, symbol);\n        this.keep (s);\n'
            + '        if (s === undefined) {\n            return;\n        }\n')).toContain ('var s any');
        // a guard with an else branch does not prove the later statement
        expect (print ('        const m = this.safeDict (this.options, symbol);\n'
            + '        if (m === undefined) {\n            return 1;\n        } else {\n            this.keep (2);\n        }\n        return this.keep (m);\n')).toContain ('var m any');
    });
});

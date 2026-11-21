import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// a nil / bool comparison of the base handleOption result prints the native interface comparison
describe ('h27g17: handleOption result compared with nil or a bool', () => {
    const HEAD = 'class BaseExchange {\n'
        + '    handleOption (methodName: string, optionName: string, defaultValue: any = undefined) { return defaultValue; }\n'
        + '    safeValue (o: any, k: string): any { return o; }\n}\nclass Exchange extends BaseExchange {}\nexport default Exchange;\n';
    const print = (body: string): string => {
        const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h27g17-'));
        try {
            fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
            const file = path.join (dir, 'ts', 'src', 'x.ts');
            fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), HEAD);
            fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\nclass x extends Exchange {\n' + body + '}\n');
            const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
            const t: any = new Transpiler (config);
            installCcxtGoLocalTypes (t.goTranspiler);
            return t.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (dir, { 'recursive': true, 'force': true });
        }
    };
    const method = (b: string) => '    sign (method: string): any { ' + b + ' }\n';
    test ('!== undefined prints != nil', () => {
        const out = print (method ("if (this.handleOption ('sign', 'apiKey') !== undefined) { return 1; } return 2;"));
        expect (out).toContain ('if this.HandleOption("sign", "apiKey") != nil {');
        expect (out).not.toContain ('IsEqual(this.HandleOption');
    });
    test ('=== true with a default prints == true', () => {
        const out = print (method ("if (this.handleOption ('watchTrades', 'ignoreDuplicates', true) === true) { return 1; } return 2;"));
        expect (out).toContain ('if this.HandleOption("watchTrades", "ignoreDuplicates", true) == true {');
    });
    test ('a compare with a non-constant keeps IsEqual', () => {
        const out = print (method ("if (this.handleOption ('sign', 'apiKey') === method) { return 1; } return 2;"));
        expect (out).toContain ('IsEqual(this.HandleOption("sign", "apiKey"), method)');
    });
    test ('a venue override of handleOption keeps IsEqual', () => {
        const out = print ('    handleOption (methodName: string, optionName: string, defaultValue: any = undefined) { return undefined; }\n'
            + method ("if (this.handleOption ('sign', 'apiKey') !== undefined) { return 1; } return 2;"));
        expect (out).toContain ('IsEqual(this.HandleOption("sign", "apiKey"), nil)');
    });
    test ('a venue method compared with nil keeps IsEqual', () => {
        const out = print ('    other (a: string): any { return undefined; }\n' + method ("if (this.other ('x') !== undefined) { return 1; } return 2;"));
        expect (out).toContain ('IsEqual(this.Other("x"), nil)');
    });
});

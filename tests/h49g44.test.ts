import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a required `int` slot of an async venue method whose callers pass a nil-guarded *int64 takes int64
describe ('h49g44: async int slot fed nil-proven integer locals', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Int = number | undefined;\nexport type int = number;\nexport class Exchange {\n'
        + '    safeInteger (a: any, k: any, d: any = undefined): Int { return a; }\n'
        + '    safeDict (a: any, k: any, d: any = undefined): Dict { return a; }\n'
        + '    safeList (a: any, k: any, d: any = undefined): any[] { return a; }\n'
        + '    safeString (a: any, k: any, d: any = undefined): string { return a; }\n'
        + '    safeCurrencyCode (a: any): string { return a; }\n'
        + '    account (): Dict { return {}; }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h49g44-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const file = path.join (src, 'ex.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Int, int } from \'./base/Exchange\';\nexport default class ex extends Exchange {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const callee = '    async load (marketId: int): Promise<string> {\n        const idStr = marketId.toString ();\n        return idStr;\n    }\n';
    const caller = (guard: string) => '    async run (row: Dict) {\n        const marketId = this.safeInteger (row, \'marketId\');\n'
        + '        ' + guard + '\n            const s = await this.load (marketId);\n            return s;\n        }\n        return \'\';\n    }\n';
    test ('positive: guarded *int64 argument derefs and the slot is int64', () => {
        const out = run (caller ('if (marketId !== undefined) {') + callee);
        expect (out).toMatch (/marketId int64\)/);
        expect (out).toContain ('(*marketId)');
        expect (out).not.toContain ('ToString(marketId)');
        expect (out).toContain ('strconv.FormatInt(marketId, 10)');
    });
    test ('negative: an unguarded *int64 argument keeps the box', () => {
        const out = run (caller ('{') + callee);
        expect (out).not.toMatch (/marketId int64\)/);
        expect (out).toContain ('ToString(marketId)');
    });
    test ('negative: an Int slot keeps the box', () => {
        const out = run (caller ('if (marketId !== undefined) {') + callee.replace ('marketId: int', 'marketId: Int'));
        expect (out).not.toMatch (/marketId int64\)/);
    });
    const zaif = '    parseBalance (response: Dict): Dict {\n        const deposit = this.safeDict (response, \'deposit\');\n        const result: Dict = {};\n'
        + '        const funds = this.safeDict (response, \'funds\', {});\n        const currencyIds = Object.keys (funds);\n'
        + '        for (let i = 0; i < currencyIds.length; i++) {\n            const currencyId = currencyIds[i];\n'
        + '            const code = this.safeCurrencyCode (currencyId);\n            const balance = this.safeString (funds, currencyId);\n'
        + '            const account = this.account ();\n            account[\'free\'] = balance;\n'
        + '            if (deposit !== undefined) {\n                if (currencyId in deposit) {\n                    account[\'total\'] = this.safeString (deposit, currencyId);\n                }\n            }\n'
        + '            if (code !== undefined) {\n                result[code] = account;\n            }\n        }\n        return result;\n    }\n';
    const apex = '    async transfer (fromAccount: string, spotConfig: Dict, contractConfig: Dict) {\n'
        + '        const isContract = fromAccount.toLowerCase () === \'contract\';\n'
        + '        let assets: Dict[] = this.safeList (spotConfig, \'assets\', []);\n        if (isContract) {\n            assets = this.safeList (contractConfig, \'assets\', []);\n        }\n'
        + '        const numAssets = assets.length;\n        return numAssets;\n    }\n';
    test ('negative: a string key from a string list is not dereferenced or nil-tested', () => {
        const out = run (caller ('if (marketId !== undefined) {') + callee + zaif);
        expect (out).not.toContain ('*currencyId');
        expect (out).not.toContain ('currencyId != nil');
    });
    test ('negative: a typed list local reassigned from safeList keeps a typed read', () => {
        const out = run (caller ('if (marketId !== undefined) {') + callee + apex);
        expect (out).not.toMatch (/assets = this\.SafeList\(/);
    });
});

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Transpiler } from '../src/transpiler.js';
import { installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installNumParams, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 } from '../src/goTranspiler.js';

// the install order of the ccxt Go worker
const installs = [ installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoGb11HandleErrorsCode, installCcxtGoSignTyping, installNumParams, installRfGo5OwnedTables, installFmGo5G01, installFmGo5G04, installCcxtGoTupleSlotReads, installCcxtGoFeeTierLiterals, installFmGo5GP08, installFmGo5OG02 ];

const go = (body: string) => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installs.forEach ((f: any) => f (x.goTranspiler));
    const ts = [
        'type Dict = { [key: string]: any };',
        'class Base {',
        '    safeDict (a: any, b: any, c: any = undefined) { return undefined; }',
        '    safeString (a: any, b: any, c: any = undefined) { return undefined; }',
        '    currency (code: string): Dict { return {}; }',
        '    options: Dict = {};',
        '}',
        'class ex extends Base {',
        body,
        '}',
        '',
    ].join ('\n');
    const full = path.join (fs.mkdtempSync (path.join (os.tmpdir (), 'h39g23-')), 'ts/src/ex.ts');
    fs.mkdirSync (path.dirname (full), { recursive: true });
    fs.writeFileSync (full, ts);
    return x.transpileGoByPath (full).content as string;
};

// these shapes pin the comma-ok form; the sites the new rule adds in the venue tree are proven by the farm regen
describe ('H39-G23 dict value read off a typed map', () => {
    test ('a literal key on a currency row the printer declares map[string]any prints the comma-ok read', () => {
        const out = go ('    f (code: string) {\n        const currency = this.currency (code);\n        const networks = this.safeDict (currency, \'networks\', {});\n        return this.safeString (networks, \'s\');\n    }');
        expect (out).toContain ('var networks, _ = currency["networks"].(map[string]any)');
        expect (out).not.toContain ('SafeMapTyped(currency');
    });
    test ('a literal key on a {}-defaulted options dict prints the comma-ok read', () => {
        const out = go ('    f (code: string) {\n        const withdrawOptions = this.safeDict (this.options, \'withdraw\', {});\n        const methods = this.safeDict (withdrawOptions, \'methods\', {});\n        return this.safeString (methods, code);\n    }');
        expect (out).toContain ('var methods, _ = withdrawOptions["methods"].(map[string]any)');
    });
    test ('a literal key on a map[string]any local that is also written into prints the comma-ok read', () => {
        const out = go ('    f (code: string) {\n        const row: Dict = {};\n        row[\'a\'] = code;\n        const data = this.safeDict (row, \'data\');\n        return this.safeString (data, \'s\');\n    }');
        expect (out).toContain ('var data, _ = row["data"].(map[string]any)');
    });
    test ('a literal key on a map[string]any local prints the comma-ok read', () => {
        const out = go ('    f (x) {\n        const row: Dict = {};\n        const data = this.safeDict (row, \'data\');\n        return this.safeString (data, \'s\');\n    }');
        expect (out).toContain ('var data, _ = row["data"].(map[string]any)');
        expect (out).not.toMatch (/SafeMapTyped\(row|SafeDictMap\(row/);
    });
    test ('a string-typed key on a map[string]any local prints the comma-ok read', () => {
        const out = go ('    f (x) {\n        const row: Dict = {};\n        const k: string = \'a\';\n        const data = this.safeDict (row, k);\n        return this.safeString (data, \'s\');\n    }');
        expect (out).toContain ('var data, _ = row[k].(map[string]any)');
    });
    test ('negative: an any receiver keeps the reader', () => {
        const out = go ('    f (row) {\n        const data = this.safeDict (row, \'data\');\n        return this.safeString (data, \'s\');\n    }');
        expect (out).not.toContain ('row["data"].(map[string]any)');
    });
    test ('negative: an untyped key keeps the reader', () => {
        const out = go ('    f (k) {\n        const row: Dict = {};\n        const data = this.safeDict (row, k);\n        return this.safeString (data, \'s\');\n    }');
        expect (out).not.toContain ('row[k].(map[string]any)');
    });
    test ('a {} default the printer drops (SafeMapTyped) prints the comma-ok read', () => {
        const out = go ('    f (x) {\n        const row: Dict = {};\n        const data = this.safeDict (row, \'data\', {});\n        return this.safeString (data, \'s\');\n    }');
        expect (out).toContain ('var data, _ = row["data"].(map[string]any)');
    });
    test ('negative: a {} default the printer keeps (data handed out) is not a bare comma-ok read', () => {
        const out = go ('    f (x) {\n        const row: Dict = {};\n        const data = this.safeDict (row, \'data\', {});\n        return data;\n    }');
        expect (out).not.toMatch (/var data, _ = row\["data"\]\.\(map\[string\]any\)\n/);
    });
    test ('negative: a non-empty default keeps the reader', () => {
        const out = go ('    f (x) {\n        const row: Dict = {};\n        const data = this.safeDict (row, \'data\', { \'a\': 1 });\n        return this.safeString (data, \'s\');\n    }');
        expect (out).not.toContain ('row["data"].(map[string]any)');
    });
});

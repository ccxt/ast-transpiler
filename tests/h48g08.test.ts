import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

// a `const data = this.safeDict (m, k, {})` local the printer declares map[string]any proves a Dict handler slot
describe ('h48g08: a same-file caller unboxed safeDict local types a Dict handler slot', () => {
    const BASE = 'export type Dict = { [key: string]: any };\nexport type Str = string | undefined;\nexport class Exchange {\n'
        + '    safeDict (a: any, k: any, d: any = undefined): any { return a; }\n'
        + '    safeList (a: any, k: any, d: any = undefined): any[] { return a; }\n'
        + '    omitZero (a: any): any { return a; }\n'
        + '    safeValue (a: any, k: any, d: any = undefined): any { return a; }\n'
        + '    safeString (a: any, k: any, d: any = undefined): Str { return a; }\n'
        + '    resolveIt (m: any, h: string) { return m; }\n}\n';
    const run = (members: string): string => {
        const tmp = fs.mkdtempSync (path.join (os.tmpdir (), 'h48g08-'));
        try {
            const src = path.join (tmp, 'ts', 'src');
            fs.mkdirSync (path.join (src, 'base'), { recursive: true });
            fs.mkdirSync (path.join (src, 'pro'), { recursive: true });
            fs.writeFileSync (path.join (src, 'base', 'Exchange.ts'), BASE);
            const file = path.join (src, 'pro', 'ex.ts');
            fs.writeFileSync (file, 'import { Exchange, Dict, Str } from \'../base/Exchange\';\nexport default class ex extends Exchange {\n' + members + '}\n');
            const inst: any = new Transpiler ({ verbose: false, go: { parser: { NUM_LINES_END_FILE: 0 } } });
            installCcxtGoHooks (inst.goTranspiler);
            return inst.transpileGoByPath (file).content;
        } finally {
            fs.rmSync (tmp, { recursive: true, force: true });
        }
    };
    const handler = (init: string, extra = '') => ''
        + '    handleOrderUpdate (client: any, message: Dict) {\n'
        + '        const topic: string = this.safeString (message, \'topic\', \'\');\n'
        + '        const dataList = this.safeList (message, \'data\');\n'
        + '        if (dataList !== undefined) {\n'
        + '            for (let i = 0; i < dataList.length; i++) {\n'
        + '                const tradeId = this.omitZero (this.safeString (dataList, \'tradeId\'));\n'
        + '                if (tradeId !== undefined) {\n'
        + '                    this.handleMyTrade (client, this.safeDict (dataList, i, {}));\n'
        + '                }\n'
        + '                this.handleOrder (client, this.safeDict (dataList, i, {}), topic);\n'
        + '            }\n'
        + '        } else {\n'
        + '            const data = ' + init + ';\n'
        + '            const tradeId = this.omitZero (this.safeString (data, \'tradeId\'));\n'
        + '            if (tradeId !== undefined) {\n'
        + '                this.handleMyTrade (client, data);\n'
        + '            }\n'
        + '            this.handleOrder (client, data, topic);\n'
        + '        }\n'
        + '    }\n'
        + '    handleOrder (client: any, message: Dict, topic: string) {\n'
        + '        const id = this.safeString (message, \'id\');\n'
        + '        this.resolveIt (message, topic);\n'
        + '        return id;\n'
        + '    }\n'
        + extra
        + '    handleMyTrade (client: any, message: Dict) {\n'
        + '        this.resolveIt (message, \'myTrades\');\n'
        + '    }\n'
;
    test ('positive: a {}-defaulted safeDict local types the slot', () => {
        const out = run (handler ('this.safeDict (message, \'data\', {})'));
        expect (out).toMatch (/var data map\[string\]any/);
        expect (out).toMatch (/HandleOrder\(client \w+, message map\[string\]any, topic string\)/);
    });
    test ('negative: a safeValue local keeps the slot boxed', () => {
        const out = run (handler ('this.safeValue (message, \'data\')'));
        expect (out).toMatch (/HandleOrder\(client \w+, message any, topic string\)/);
    });
    test ('negative: a rebound local keeps the slot boxed', () => {
        const out = run (handler ('this.safeDict (message, \'data\', {})').replace ('const data', 'let data').replace ('            this.handleOrder (client, data', '        data = this.safeValue (message, \'x\');\n        this.handleOrder (client, data'));
        expect (out).toMatch (/HandleOrder\(client \w+, message any, topic string\)/);
    });
    test ('negative: a second caller with a boxed value keeps the slot boxed', () => {
        const out = run (handler ('this.safeDict (message, \'data\', {})', '    other (client: any, x: any) {\n        this.handleOrder (client, x, \'t\');\n    }\n'));
        expect (out).toMatch (/HandleOrder\(client \w+, message any, topic string\)/);
    });
});

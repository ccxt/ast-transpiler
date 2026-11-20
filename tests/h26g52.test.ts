import fs from 'fs';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

describe ('go Object.keys on a declared map local', () => {
    const root = path.join (__dirname, 'files', 'tmp-h26g52', 'ts', 'src');
    const print = (body: string): string => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'),
            'type Dict = { [key: string]: any };\n' +
            'export class Exchange {\n' +
            '    safeDict (d: any, k: any, def: Dict): Dict;\n' +
            '    safeDict (d: any, k: any, def?: Dict): Dict | undefined;\n' +
            '    safeDict (d: any, k: any, def: Dict = undefined): Dict | undefined { return def; }\n' +
            '    omit<T extends Dict> (x: T, ...args: any): T;\n' +
            '    omit (x: any, ...args: any): any;\n' +
            '    omit (x: any, ...args: any): any { return x; }\n' +
            '    safeInteger (d: any, k: any): any { return d; }\n' +
            '    take (d: any): any { return d; }\n' +
            '    async run (message: any, data: any) {\n        const responses = await this.take (data);\n' + body + '    }\n' +
            '}\n');
        const t = new Transpiler ({ verbose: false, go: {} });
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (path.join (root, 'base', 'Exchange.ts')).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h26g52'), { recursive: true, force: true }));

    test ('a map local is ranged although a sibling block rebinds another local of the same name', () => {
        const out = print ("        const result = {};\n        if (message) {\n            let tickers = [];\n            tickers = data;\n            this.take (tickers);\n        } else {\n            const d = this.safeDict (message, 'data', {});\n            const ts = this.safeInteger (d, 'date');\n            const tickers = this.omit (d, 'date');\n            const ids = Object.keys (tickers);\n            for (let i = 0; i < ids.length; i++) {\n                const t = d[ids[i]];\n                t['date'] = ts;\n                result[ids[i]] = t;\n            }\n        }\n        return result;\n");
        expect (out).toContain ('for objectKey := range tickers {');
        expect (out).not.toContain ('ObjectKeys(tickers)');
    });

    test ('negatives keep the helper', () => {
        // the receiver's own symbol is rebound with a value of another type
        const rebound = print ("        const result = {};\n        if (message) {\n            let tickers = [];\n            tickers = data;\n            this.take (tickers);\n        } else {\n            const d = this.safeDict (message, 'data', {});\n            const ts = this.safeInteger (d, 'date');\n            let tickers: any = this.omit (d, 'date');\n            if (ts) {\n                tickers = message;\n            }\n            const ids = Object.keys (tickers);\n            for (let i = 0; i < ids.length; i++) {\n                const t = d[ids[i]];\n                t['date'] = ts;\n                result[ids[i]] = t;\n            }\n        }\n        return result;\n");
        expect (rebound).toContain ('ObjectKeys(tickers)');
        // an any receiver (the user value may be nil or a non-map) keeps the helper
        const boxed = print ("        const result = {};\n        if (message) {\n            let tickers = [];\n            tickers = data;\n            this.take (tickers);\n        } else {\n            const d = this.safeDict (message, 'data', {});\n            const ts = this.safeInteger (d, 'date');\n            const tickers = this.take (d);\n            const ids = Object.keys (tickers);\n            for (let i = 0; i < ids.length; i++) {\n                const t = d[ids[i]];\n                t['date'] = ts;\n                result[ids[i]] = t;\n            }\n        }\n        return result;\n");
        expect (boxed).toContain ('ObjectKeys(tickers)');
        expect (boxed).not.toContain ('range tickers');
    });
});

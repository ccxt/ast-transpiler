import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';

describe ('rust prediction fetchOutcomes string-list group slot is a lent slice', () => {
    const root = path.join (__dirname, 'files', 'tmp-h47r23', 'ts', 'src');
    const exchange = 'export default class Exchange {\n    safeString (d: any, k: any, def: any = undefined): any { return undefined; }\n}\n';
    const write = (base: string, venue: string) => {
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        fs.mkdirSync (path.join (root, 'prediction'), { recursive: true });
        fs.writeFileSync (path.join (root, 'base', 'Exchange.ts'), exchange);
        fs.writeFileSync (path.join (root, 'base', 'PredictionExchange.ts'), "import Exchange from './Exchange.js';\nexport default class PredictionExchange extends Exchange {\n" + base + '}\n');
        fs.writeFileSync (path.join (root, 'prediction', 'venue.ts'), "import PredictionExchange from '../base/PredictionExchange.js';\nexport default class venue extends PredictionExchange {\n" + venue + '}\n');
    };
    const print = (file: string): string => {
        const t = new Transpiler ({ verbose: false, rust: {} });
        return t.transpileRustByPath (path.join (root, file)).content;
    };
    afterAll (() => fs.rmSync (path.join (__dirname, 'files', 'tmp-h47r23'), { recursive: true, force: true }));

    const base = '    async fetchOutcome (s: string): Promise<any> {\n        return s;\n    }\n'
        + '    async fetchOutcomes (outcomeSymbols: string[]): Promise<any> {\n        for (let i = 0; i < outcomeSymbols.length; i++) {\n'
        + '            await this.fetchOutcome (outcomeSymbols[i]);\n        }\n        return undefined;\n    }\n';
    const venue = '    override async fetchOutcomes (outcomeSymbols: string[]): Promise<any> {\n        const n = outcomeSymbols.length;\n'
        + '        for (let i = 0; i < n; i++) {\n            const s: string = this.safeString (outcomeSymbols, i, \'\');\n            await this.fetchOutcome (s);\n        }\n        return undefined;\n    }\n';

    test ('base and override print a lent slice', () => {
        write (base, venue);
        const b = print ('base/PredictionExchange.ts');
        expect (b).toContain ('outcomeSymbols: &[crate::Value]');
        expect (b).not.toContain ('__outcomeSymbols_empty');
        const v = print ('prediction/venue.ts');
        expect (v).toContain ('outcomeSymbols: &[crate::Value]');
        expect (v).not.toContain ('mut outcomeSymbols: Value');
    });

    test ('negatives keep the box', () => {
        // one declaration spelled otherwise keeps the whole group boxed
        write (base, venue.replace ('outcomeSymbols: string[]', 'outcomeSymbols: any'));
        expect (print ('base/PredictionExchange.ts')).not.toContain ('outcomeSymbols: &[crate::Value]');
        // a use outside the list reads (handed whole to an `any` slot) keeps the box
        write (base.replace ('return undefined;', 'return this.keep (outcomeSymbols);') + '    keep (x: any): any {\n        return x;\n    }\n', venue);
        expect (print ('base/PredictionExchange.ts')).not.toContain ('outcomeSymbols: &[crate::Value]');
        // an unlisted method of the same shape keeps the box
        write (base.split ('fetchOutcomes').join ('fetchOthers'), venue.split ('fetchOutcomes').join ('fetchOthers'));
        expect (print ('base/PredictionExchange.ts')).not.toContain ('outcomeSymbols: &[crate::Value]');
    });
});

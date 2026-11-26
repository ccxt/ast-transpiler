import fs from 'fs';
import path from 'path';
import {
    Transpiler,
    installCcxtGoHooks,
    installCcxtGoLocalTypes,
    installCcxtGoIndexableTypes,
    installCcxtGoParamTypes,
    installCcxtGoDictParams,
} from '../src/transpiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5: least-used helper elimination (Go Mod/IsLessThanOrEqual, C# mod/isLessThanOrEqual)', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: float64 % 1 emits math.Mod, []int64 + int64 findNearestCeiling emits native loop + <=, and callers widen/deref', () => {
        const root = path.join (tmp, 'go', 'ts', 'src');
        fs.mkdirSync (root, { recursive: true });
        const file = path.join (root, 'demo.ts');
        fs.writeFileSync (file, `
type Int = number | undefined;
export class Demo {
    parseToNumeric (v: any): any { return v; }
    safeInteger (o: any, k: string): number | undefined { return undefined; }
    isRoundNumber (value: number): boolean {
        const res = this.parseToNumeric (value % 1);
        return res === 0;
    }
    findNearestCeiling (arr: number[], providedValue: number): number {
        const length = arr.length;
        for (let i = 0; i < length; i++) {
            const current = arr[i];
            if (providedValue <= current) {
                return current;
            }
        }
        return arr[length - 1];
    }
    run (o: any, leverage: number, raw: any) {
        const lev = this.safeInteger (o, 'lev');
        const lim = this.safeInteger (o, 'lim');
        let ok = false;
        if (lev !== undefined) {
            ok = this.isRoundNumber (1000 % lev);
        }
        let okInt64 = false;
        if (leverage > 0) {
            okInt64 = this.isRoundNumber (leverage % 2);
        }
        const okRaw = this.isRoundNumber (raw);
        let picked: any = 0;
        if (lim !== undefined) {
            picked = this.findNearestCeiling ([ 5, 10, 50 ], lim);
        }
        return [ ok, okInt64, okRaw, picked ];
    }
    earlyExitLimit (limit: Int = undefined) {
        if (limit === undefined) {
            return 100;
        }
        if (limit > 500) {
            return this.findNearestCeiling ([ 5, 10, 50 ], limit);
        }
        return limit;
    }
}
`);
        const t = new Transpiler ({
            verbose: false,
            go: {
                parser: { NUM_LINES_END_FILE: 0 },
                unifiedSliceParams: { findNearestCeiling: { 0: '[]int64' } },
            },
        });
        installCcxtGoLocalTypes (t.goTranspiler, { findNearestCeiling: [ 1 ], run: [ 1 ] }, { isRoundNumber: [ 0 ] });
        installCcxtGoHooks (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        const go = t.transpileGoByPath (file).content;
        expect (go).toContain ('IsRoundNumber(value float64)');
        expect (go).toContain ('math.Mod(value, 1)');
        expect (go).not.toMatch (/(?<![A-Za-z_.])Mod\(/);
        expect (go).toContain ('this.IsRoundNumber(float64(1000 % *lev))');
        expect (go).toContain ('this.IsRoundNumber(float64(leverage % 2))');
        expect (go).toContain ('this.IsRoundNumber(Float64Arg(raw))');
        expect (go).toContain ('FindNearestCeiling(arr []int64, providedValue int64)');
        expect (go).toContain ('var current int64 = arr[i]');
        expect (go).toContain ('if providedValue <= current');
        expect (go).not.toContain ('IsLessThanOrEqual');
        expect (go).toContain ('this.FindNearestCeiling([]int64{5, 10, 50}, *lim)');
        expect (go).toContain ('var limit *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
        expect (go).toContain ('return this.FindNearestCeiling([]int64{5, 10, 50}, *limit)');
        expect (go).toContain ('return *limit');
    });

    test ('C#: double? % 1 emits native %, IList<Int64> + Int64 findNearestCeiling emits native <=, and uncalled sync venue method types number params', () => {
        const root = path.join (tmp, 'cs', 'ts', 'src');
        fs.mkdirSync (path.join (root, 'base'), { recursive: true });
        const baseFile = path.join (root, 'base', 'Exchange.ts');
        fs.writeFileSync (baseFile, `
export class Exchange {
    parseToNumeric (v: any): any { return v; }
    isRoundNumber (value: number): boolean {
        const res = this.parseToNumeric (value % 1);
        return res === 0;
    }
    findNearestCeiling (arr: number[], providedValue: number): number {
        const length = arr.length;
        for (let i = 0; i < length; i++) {
            const current = arr[i];
            if (providedValue <= current) {
                return current;
            }
        }
        return arr[length - 1];
    }
    use (limit: number | undefined, lev: number, step: number) {
        let ok = false;
        if (lev > 0) {
            ok = this.isRoundNumber (1000 % lev);
        }
        const ok2 = this.isRoundNumber (step % 2);
        let picked: any = 0;
        if (limit !== undefined) {
            picked = this.findNearestCeiling ([ 5, 10, 50 ], limit);
        }
        return [ ok, ok2, picked ];
    }
    earlyExit (limit: number | undefined = undefined) {
        if (limit === undefined) {
            return 100;
        }
        return this.findNearestCeiling ([ 5, 10, 50 ], limit);
    }
}
export default Exchange;
`);
        const venueFile = path.join (root, 'venue.ts');
        fs.writeFileSync (venueFile, `
import Exchange from './base/Exchange.js';
export default class venue extends Exchange {
    calculatePricePrecision (midPx: number, szDecimals: number): number {
        if (midPx <= 0) {
            return 0;
        }
        return szDecimals;
    }
}
`);
        const csConfig = {
            coreArgTypes: {
                isRoundNumber: { 0: 'double?' },
                findNearestCeiling: { 0: 'IList<Int64>', 1: 'Int64' },
                use: { 0: 'Int64?', 1: 'Int64', 2: 'double?' },
                earlyExit: { 0: 'Int64?' },
            },
            callSiteArgTypes: {
                isRoundNumber: { 0: 'double?' },
                findNearestCeiling: { 0: 'IList<Int64>', 1: 'Int64' },
            },
        };
        const t = new Transpiler ({ verbose: false, csharp: csConfig });
        t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => ((node?.text === 'lev') ? 'Int64' : undefined);
        const baseCs = t.transpileCSharpByPath (baseFile).content;
        expect (baseCs).toContain ('isRoundNumber(double? value)');
        expect (baseCs).toContain ('(value % 1)');
        expect (baseCs).not.toContain ('mod(value');
        expect (baseCs).toContain ('this.isRoundNumber((1000 % lev))');
        expect (baseCs).toContain ('this.isRoundNumber((step % 2))');
        expect (baseCs).not.toContain ('ToDoubleArg');
        expect (baseCs).toContain ('findNearestCeiling(IList<Int64> arr, Int64 providedValue)');
        expect (baseCs).toContain ('Int64 current = arr[i]');
        expect (baseCs).toContain ('providedValue <= current');
        expect (baseCs).not.toContain ('isLessThanOrEqual');
        expect (baseCs).toContain ('this.findNearestCeiling(new List<Int64>() {5, 10, 50}, limit.Value)');
        expect (baseCs).toContain ('return this.findNearestCeiling(new List<Int64>() {5, 10, 50}, limit.Value);');

        const venueCs = t.transpileCSharpByPath (venueFile).content;
        expect (venueCs).toContain ('calculatePricePrecision(double midPx, double szDecimals)');
    });
});

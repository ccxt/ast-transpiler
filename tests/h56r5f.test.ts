import fs from 'fs';
import path from 'path';
import { Transpiler } from '../src/transpiler';
import { installCcxtGoLocalTypes } from '../src/goTranspiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5f-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5f: Go JSON.parse map + FetchPaginatedCallCursor since *int64, Java null-safe Object.values, C# Math.floor product & double? Math.max', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: const x = JSON.parse(s) used only by Object.values(x) unboxes as map[string]any and eliminates ObjectValues', () => {
        const srcDir = path.join (tmp, 'go-json', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type Dict = { [key: string]: any };
export class Demo {
    safeString (d: any, k: string): string | undefined { return undefined; }
    parseFee (feeDetail: any): any {
        const parsedFeeDetail = JSON.parse (feeDetail);
        const feeValues = Object.values (parsedFeeDetail);
        for (let i = 0; i < feeValues.length; i++) {
            const feeValue = feeValues[i];
            const code = this.safeString (feeValue, 'feeCoinCode');
            if (code !== undefined) {
                return feeValue;
            }
        }
        return undefined;
    }
}
`);
        const t = new Transpiler ({ go: { useTypeScriptChecker: true } });
        installCcxtGoLocalTypes (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('var parsedFeeDetail, _ = JsonParse(feeDetail).(map[string]any)');
        expect (out).not.toContain ('ObjectValues(');
        expect (out).toContain ('for _, objectValue := range parsedFeeDetail');
    });

    test ('Go: optional since: Int = undefined used in this[method](..., since) and lastTimestamp < since emits GetArgInt64Ptr and *lastTimestamp < *since', () => {
        const srcDir = path.join (tmp, 'go-cursor', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type Int = number | undefined;
type Dict = { [key: string]: any };
export class Demo {
    safeInteger (d: any, k: string): Int { return undefined; }
    async fetchCursor (method: string, since: Int = undefined, params: Dict = {}): Promise<any[]> {
        try {
            const response = await this[method] (since, params);
            const lastTimestamp = this.safeInteger (response, 'timestamp');
            if (since === undefined) {
                throw new Error ('requires since');
            }
            if (lastTimestamp !== undefined && lastTimestamp < since) {
                return [];
            }
        } catch (e) {
            throw e;
        }
        return [];
    }
}
`);
        const t = new Transpiler ({ go: { useTypeScriptChecker: true } });
        installCcxtGoLocalTypes (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('var since *int64 = GetArgInt64Ptr(optionalArgs, 0, nil)');
        expect (out).not.toContain ('IsLessThan(');
        expect (out).toContain ('*lastTimestamp < *since');
    });

    test ('Java: Object.values on declared JSON.parse Map local emits null-guarded ArrayList(x.values())', () => {
        const srcDir = path.join (tmp, 'java-ov', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type Dict = { [key: string]: any };
export class Demo {
    parseFee (feeDetail: any): any[] {
        const parsedFeeDetail = JSON.parse (feeDetail);
        const feeValues = Object.values (parsedFeeDetail);
        return feeValues;
    }
}
`);
        const t = new Transpiler ({ java: { useTypeScriptChecker: true } });
        t.javaTranspiler.javaDeclaredLocalTypeResolver = (decl: any) => (decl?.name?.text === 'parsedFeeDetail' ? 'java.util.Map<String, Object>' : undefined);
        const out = t.transpileJavaByPath (file).content;
        expect (out).not.toContain ('Helpers.objectValues(');
        expect (out).toContain ('parsedFeeDetail == null ? new java.util.ArrayList<Object>() : new java.util.ArrayList<Object>(parsedFeeDetail.values())');
    });

    test ('C#: Math.floor(ts / ms) * ms and guarded double? Math.max/Math.min emit native C#', () => {
        const srcDir = path.join (tmp, 'cs-ohlcv', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type Int = number | undefined;
type Num = number | undefined;
export class Demo {
    safeInteger (d: any, k: any): Int { return undefined; }
    safeNumber (d: any, k: any): Num { return undefined; }
    parseTimeframe (tf: string): number { return 60; }
    build (trade: any, prevCandle: any, since: Int = undefined): any {
        const ms = 60000;
        const ts = this.safeInteger (trade, 'timestamp');
        const price = this.safeNumber (trade, 'price');
        if (ts === undefined) {
            throw new Error ('missing ts');
        }
        const openingTime = Math.floor (ts / ms) * ms;
        if (openingTime < since) {
            return undefined;
        }
        if (price === undefined) {
            throw new Error ('missing price');
        }
        const prevHigh = this.safeNumber (prevCandle, 2);
        const prevLow = this.safeNumber (prevCandle, 3);
        const h = Math.max ((prevHigh === undefined) ? price : prevHigh, price);
        const l = Math.min ((prevLow === undefined) ? price : prevLow, price);
        const neg = -since;
        return [ openingTime, h, l, neg ];
    }
}
`);
        const t = new Transpiler ({ csharp: { useTypeScriptChecker: true } });
        const localTypes: Record<string, string> = { ms: 'Int64', ts: 'Int64?', price: 'double?', openingTime: 'Int64', prevHigh: 'double?', prevLow: 'double?' };
        t.csharpTranspiler.csharpDeclaredLocalTypeResolver = (decl: any) => localTypes[decl?.name?.text];
        t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => localTypes[node?.text];
        t.csharpTranspiler.csharpParamTypes = new Map ();
        const origParamType = t.csharpTranspiler.csharpPrintedParamType.bind (t.csharpTranspiler);
        t.csharpTranspiler.csharpPrintedParamType = (n: any) => ((n?.text === 'since') ? 'Int64?' : origParamType (n));
        const out = t.transpileCSharpByPath (file).content;
        expect (out).toContain ('((Int64)Math.Floor(((double)ts.Value / ms)) * ms)');
        expect (out).not.toContain ('multiply(');
        expect (out).not.toContain ('isLessThan(');
        expect (out).toContain ('openingTime < since');
        expect (out).not.toContain ('mathMax(');
        expect (out).not.toContain ('mathMin(');
        expect (out).toContain ('Math.Max(((prevHigh == null) ? price.Value : prevHigh.Value), price.Value)');
        expect (out).toContain ('Math.Min(((prevLow == null) ? price.Value : prevLow.Value), price.Value)');
        expect (out).not.toContain ('prefixUnaryNeg(');
        expect (out).toContain ('(-since)');
    });
});

import fs from 'fs';
import path from 'path';
import { SyntaxKind } from 'typescript/ast';
import { Transpiler } from '../src/transpiler';
import { installCcxtGoLocalTypes } from '../src/goTranspiler';

const tmp = path.join (__dirname, 'files', 'tmp-h56r5h-' + (process.env.JEST_WORKER_ID || '0'));

describe ('h56r5h: Go currentSince int64 + sum-in-arith/compare + venue int param; C# Int64? assign Math.Max', () => {
    afterAll (() => fs.rmSync (tmp, { recursive: true, force: true }));

    test ('Go: currentSince int64 local with 64-bit Math.max and this.sum(x, step) - 1 emits 0 Subtract/IsGreaterThanOrEqual', () => {
        const srcDir = path.join (tmp, 'go-base', 'ts', 'src', 'base');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'Exchange.ts');
        fs.writeFileSync (file, `
type Int = number | undefined;
export class BaseExchange {
    milliseconds (): number { return 0; }
    sum (...args: any[]): any { return 0; }
    safeInteger (o: any, k: any): Int { return undefined; }
    fetchPaginated (since: Int = undefined, until: Int = undefined, step: number = 1000) {
        const current = this.milliseconds ();
        const stepVal = this.milliseconds ();
        const sinceVal = this.safeInteger ({}, 'since');
        let currentSince: Int = current - (10 * stepVal) - 1;
        if (sinceVal !== undefined) {
            if (until !== undefined) {
                currentSince = sinceVal;
            } else {
                currentSince = Math.max (currentSince, sinceVal);
            }
        } else {
            currentSince = Math.max (currentSince, 1241440531000);
        }
        for (let i = 0; i < 10; i++) {
            if ((until !== undefined) && (currentSince >= until)) {
                break;
            }
            if (currentSince >= current) {
                break;
            }
            currentSince = this.sum (currentSince, stepVal) - 1;
        }
        return currentSince;
    }
    buildCandle (row: any, openingTime: number, ms: number) {
        const candleTimestamp = this.safeInteger (row, 0);
        if (candleTimestamp === undefined) {
            throw new Error ('missing');
        }
        const openVal = this.milliseconds ();
        const msVal = this.milliseconds ();
        return openVal >= this.sum (candleTimestamp, msVal);
    }
}
`);
        const t = new Transpiler ({ go: { useTypeScriptChecker: true } });
        installCcxtGoLocalTypes (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('var currentSince int64 =');
        expect (out).toContain ('currentSince = max(currentSince, *sinceVal)');
        expect (out).toContain ('currentSince = max(currentSince, 1241440531000)');
        expect (out).toContain ('currentSince = (currentSince + stepVal) - 1');
        expect (out).toContain ('currentSince >= *until');
        expect (out).toContain ('currentSince >= current');
        expect (out).toContain ('openVal >= (*candleTimestamp + msVal)');
        expect (out).not.toContain ('Subtract(');
        expect (out).not.toContain ('IsGreaterThanOrEqual(');
        expect (out).not.toContain ('mathMax(');
    });

    test ('Go: venue-local required int param called with int prints int and native >=', () => {
        const srcDir = path.join (tmp, 'go-int', 'ts', 'src');
        fs.mkdirSync (srcDir, { recursive: true });
        const file = path.join (srcDir, 'demo.ts');
        fs.writeFileSync (file, `
type int = number;
class Exchange {}
export class Demo extends Exchange {
    unsubscribeFrom (channels: string[], start: int): int {
        let refused = 0;
        for (let i = 0; i < channels.length; i++) {
            if (i >= start) {
                refused = refused + 1;
            }
        }
        return refused;
    }
    run () {
        const channels: string[] = [ 'a', 'b' ];
        for (let i = 0; i < channels.length; i++) {
            this.unsubscribeFrom (channels, i + 1);
        }
    }
    keepAny (channels: string[], start: int, x: any): int {
        return (channels.length >= start) ? 1 : 0;
    }
    callKeepAny (channels: string[], x: any) {
        return this.keepAny (channels, x, x);
    }
    keepIndex (channels: string[], idx: int): any {
        return channels[idx];
    }
    callKeepIndex () {
        const channels: string[] = [ 'a', 'b' ];
        for (let i = 0; i < channels.length; i++) {
            this.keepIndex (channels, i);
        }
    }
}
`);
        const t = new Transpiler ({ go: { useTypeScriptChecker: true } });
        installCcxtGoLocalTypes (t.goTranspiler);
        const out = t.transpileGoByPath (file).content;
        expect (out).toContain ('UnsubscribeFrom(channels []string, start int)');
        expect (out).toContain ('if i >= start');
        expect (out).not.toContain ('IsGreaterThanOrEqual(i, start)');
        expect (out).toContain ('KeepAny(channels []string, start any, x any)');
        expect (out).toContain ('KeepIndex(channels []string, idx any)');
    });

    test ('C#: assignment of Math.max to Int64? local with one unguarded Int64? operand emits null-guarded Math.Max', () => {
        const src = `
class Exchange {
    f (since: number | undefined, currentSince: number | undefined) {
        if (since !== undefined) {
            currentSince = Math.max (currentSince, since);
        } else {
            currentSince = Math.max (currentSince, 1241440531000);
        }
        const untouched = Math.min (currentSince, 100);
        return untouched;
    }
}
`;
        const t: any = new Transpiler ({ csharp: { useTypeScriptChecker: true } });
        t.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => {
            if ((node?.kind === SyntaxKind.Identifier) && ((node.text === 'currentSince') || (node.text === 'since'))) { return 'Int64?'; }
            return undefined;
        };
        const out = t.transpileCSharp (src).content;
        expect (out).toContain ('((currentSince != null) ? (Int64?)Math.Max(currentSince.Value, since.Value) : null)');
        expect (out).toContain ('((currentSince != null) ? (Int64?)Math.Max(currentSince.Value, 1241440531000) : null)');
        expect (out).not.toContain ('mathMax(');
        expect (out).toContain ('mathMin(currentSince, 100)');
    });
});

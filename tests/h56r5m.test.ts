import { Transpiler } from '../src/transpiler';

test('h56r5m: C# rewritten Int64? local guarded non-null emits Math.Min', () => {
    const ts = `
class Exchange {
    safeInteger (a: any, b: any): number | undefined { return undefined; }
    testGuarded (a: any, b: any) {
        let x = this.safeInteger (a, 'x');
        if (b !== undefined) {
            x = this.safeInteger (b, 'x');
        }
        const cap = this.safeInteger (a, 'cap');
        if ((x !== undefined) && (cap !== undefined)) {
            x = Math.min (x, cap);
        }
        return x;
    }
    testUnguarded (a: any, b: any) {
        let x = this.safeInteger (a, 'x');
        if (b !== undefined) {
            x = this.safeInteger (b, 'x');
        }
        const cap = this.safeInteger (a, 'cap');
        if (cap !== undefined) {
            x = Math.min (x, cap);
        }
        return x;
    }
}
`;
    const transpiler = new Transpiler({
        csharp: {
            csharpExpressionTypeResolver: (node: any) => {
                if (node?.expression?.name?.text === 'safeInteger') return 'Int64?';
                return undefined;
            },
        },
    } as any);
    const out = transpiler.transpileCSharp(ts).content;
    const guardedPart = out.slice(out.indexOf('testGuarded'), out.indexOf('testUnguarded'));
    expect(guardedPart).toContain('Math.Min(x.Value, cap.Value)');
    expect(guardedPart).not.toContain('mathMin(');
    const unguardedPart = out.slice(out.indexOf('testUnguarded'));
    expect(unguardedPart).toContain('mathMin(x, cap)');
});

test('h56r5m: Rust in_op eliminated for Dict/NullableDict param, !Array.isArray guard, early-exit Array.isArray, and nested plain-dict local', () => {
    const ts = `
type Dict = Record<string, any>;
type NullableDict = Dict | undefined;
class Exchange {
    testDictParam (fee: NullableDict) {
        if ('chains' in fee) {
            return true;
        }
        return false;
    }
    testEarlyExitArray (response: any) {
        if ((response === undefined) || Array.isArray (response)) {
            return false;
        }
        if (!('data' in response)) {
            return false;
        }
        return true;
    }
    testInlineNotArray (row: any) {
        if (!Array.isArray (row) && ('data' in row) && ('is_valid' in row)) {
            return true;
        }
        return false;
    }
    testNestedDict (k: string, sub: string) {
        const reduced: Dict = {};
        if (!(k in reduced)) {
            reduced[k] = {};
        }
        if (sub in reduced[k]) {
            return true;
        }
        return false;
    }
    testUnguardedAny (x: any) {
        if ('data' in x) {
            return true;
        }
        return false;
    }
}
`;
    const transpiler = new Transpiler({ verbose: false });
    const out = transpiler.transpileRust(ts).content;
    const beforeUnguarded = out.slice(0, out.indexOf('testUnguardedAny'));
    expect(beforeUnguarded).not.toContain('in_op(');
    expect(beforeUnguarded).toContain('contains_key("chains")');
    expect(beforeUnguarded).toContain('contains_key("data")');
    expect(beforeUnguarded).toContain('contains_key("is_valid")');
    const unguarded = out.slice(out.indexOf('testUnguardedAny'));
    expect(unguarded).toContain('in_op(');
});

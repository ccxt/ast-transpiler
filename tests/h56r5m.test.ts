import { Transpiler } from '../src/transpiler';

test('h56r5m: C# guarded, handleOption, sum, parseToInt-div, and nullable Int64? Math.Min emit native Math.Min', () => {
    const ts = `
class Base {
    safeInteger (a: any, b: any): number | undefined { return undefined; }
    parseToInt (a: any): number | undefined { return undefined; }
    handleOption (m: string, o: string, d: any): any { return d; }
    sum (a: any, b: any): any { return a + b; }
}
class Exchange extends Base {
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
    testHandleOptionAndSum (a: any, spot: boolean) {
        const limit = this.safeInteger (a, 'limit');
        const since = this.safeInteger (a, 'since');
        const until = this.safeInteger (a, 'until');
        const maxSpotLimit = this.parseToInt (this.handleOption ('fetchOrderBook', 'maxSpotLimit', 1000));
        const maxLimit = spot ? maxSpotLimit : 300;
        const limitResolved = (limit === undefined) ? 200 : this.parseToInt (limit);
        if (limit !== undefined) {
            const capped = Math.min (limit, maxLimit);
            if ((since !== undefined) && (until !== undefined)) {
                const endByLimit = this.parseToInt (this.sum (since, limitResolved * 1000));
                return Math.min (endByLimit, until + 1);
            }
            return capped;
        }
        return undefined;
    }
    testDivAndNullableAssign (a: any) {
        const total = this.safeInteger (a, 't');
        const months = this.parseToInt (total / 2592000);
        if (months <= 12) {
            return 1;
        }
        const years = Math.min (this.parseToInt ((months + 11) / 12), 15);
        let p = this.parseToInt (0);
        const dec = this.safeInteger (a, 'd');
        p = Math.min (dec, p);
        return this.parseToInt (Math.min (dec, p));
    }
}
`;
    const int64Names = new Set(['maxSpotLimit', 'maxLimit', 'limitResolved', 'capped', 'endByLimit', 'months', 'p']);
    const transpiler = new Transpiler({ verbose: false });
    transpiler.csharpTranspiler.csharpExpressionTypeResolver = (node: any) => {
        if (node?.expression?.name?.text === 'safeInteger') return 'Int64?';
        if (node?.expression?.name?.text === 'parseToInt') return 'Int64?';
        if (int64Names.has(node?.text)) return 'Int64?';
        return undefined;
    };
    transpiler.csharpTranspiler.csharpDeclaredLocalTypeResolver = (decl: any) => (int64Names.has(decl?.name?.text) ? 'Int64?' : undefined);
    const out = transpiler.transpileCSharp(ts).content;
    expect(out).not.toContain('mathMin(');
    expect(out).toContain('Math.Min(x.Value, cap.Value)');
    expect(out).toContain('Math.Min(limit.Value, maxLimit.GetValueOrDefault())');
    expect(out).toContain('Math.Min(endByLimit.GetValueOrDefault(), (until.Value + 1))');
    expect(out).toContain('Math.Min(this.parseToInt(');
    expect(out).toContain('(((dec != null) && (p != null)) ? (Int64?)Math.Min(dec.Value, p.Value) : null)');
});

test('h56r5m: Rust in_op eliminated for non-numeric literal keys on non-array Values and nested plain-dict locals, kept for numeric/array keys', () => {
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
    testNonNumericAny (row: any) {
        if (('data' in row) && ('is_valid' in row)) {
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
    testArrayKept (arr: any[]) {
        if ('data' in arr) {
            return true;
        }
        return false;
    }
}
`;
    const transpiler = new Transpiler({ verbose: false });
    const defaultOut = transpiler.transpileRust(ts).content;
    const defaultParamPart = defaultOut.slice(0, defaultOut.indexOf('testNonNumericAny'));
    expect(defaultParamPart).not.toContain('in_op(');
    expect(defaultParamPart).toContain('contains_key("chains")');
    const defaultAnyPart = defaultOut.slice(defaultOut.indexOf('testNonNumericAny'), defaultOut.indexOf('testNestedDict'));
    expect(defaultAnyPart).toContain('in_op(');
    (transpiler.rustTranspiler as any).rustNonNumericInIsDict = true;
    const out = transpiler.transpileRust(ts).content;
    const beforeArr = out.slice(0, out.indexOf('testArrayKept'));
    expect(beforeArr).not.toContain('in_op(');
    expect(beforeArr).toContain('contains_key("chains")');
    expect(beforeArr).toContain('contains_key("data")');
    expect(beforeArr).toContain('contains_key("is_valid")');
    const arrPart = out.slice(out.indexOf('testArrayKept'));
    expect(arrPart).toContain('in_op(');
});

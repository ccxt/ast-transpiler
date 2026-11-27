import { Transpiler } from '../src/transpiler';

test('h56r5l: C# const string[] accumulator in Promise<string[]> method prints List<string>', () => {
    const ts = `
class Exchange {
    safeDict (a: any, b: any, c: any = undefined): any { return undefined; }
    safeString (a: any, b: any, c: any = undefined): string | undefined { return undefined; }
    async fetchOptionUnderlyings (response: any[]): Promise<string[]> {
        const underlyings: string[] = [];
        for (let i = 0; i < response.length; i++) {
            const underlying = this.safeDict (response, i, {});
            const name = this.safeString (underlying, 'name');
            if (name !== undefined) {
                underlyings.push (name);
            }
        }
        return underlyings;
    }
    async nonStringPush (response: any[]): Promise<string[]> {
        const underlyings: string[] = [];
        for (let i = 0; i < response.length; i++) {
            underlyings.push (response[i]);
        }
        return underlyings;
    }
    async nonStringReturn (response: any[]): Promise<any[]> {
        const underlyings: string[] = [];
        underlyings.push ('BTC');
        return underlyings;
    }
    async indexedLocal (response: any[]): Promise<string[]> {
        const underlyings: string[] = [];
        underlyings.push ('BTC');
        const first = underlyings[0];
        if (first !== undefined) {
            underlyings.push (first);
        }
        return underlyings;
    }
}
`;
    const transpiler = new Transpiler({
        csharp: {
            csharpExpressionTypeResolver: (node: any) => {
                if (node?.expression?.name?.text === 'safeString') return 'string?';
                return undefined;
            },
        },
    } as any);
    const out = transpiler.transpileCSharp(ts).content;
    expect(out).toContain('List<string> underlyings = new List<string>() {};');
    expect(out).toContain('underlyings.Add(name);');
    // negative cases stay List<object> / object
    const nonStrPush = out.slice(out.indexOf('nonStringPush'), out.indexOf('nonStringReturn'));
    expect(nonStrPush).not.toContain('List<string>');
    const nonStrRet = out.slice(out.indexOf('nonStringReturn'), out.indexOf('indexedLocal'));
    expect(nonStrRet).not.toContain('List<string>');
    const indexed = out.slice(out.indexOf('indexedLocal'));
    expect(indexed).not.toContain('List<string>');
});

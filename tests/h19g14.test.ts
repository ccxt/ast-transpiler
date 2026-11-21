import { Transpiler } from '../src/transpiler';

describe ('bodyless overload signatures are skipped (no crash, nothing printed)', () => {
    const SRC = 'class Base {\n'
        + '    pick (k: string, d: string): string;\n'
        + '    pick (k: string, d?: string): string | undefined;\n'
        + '    pick (k: string, d: string = undefined): string | undefined { return d; }\n'
        + '}\n'
        + 'class Venue extends Base {\n'
        + '    override pick (k: string, d: string): string;\n'
        + '    override pick (k: string, d?: string): string | undefined;\n'
        + '    override pick (k: string, d: string = undefined): string | undefined { return k; }\n'
        + '    other (a: string) { return a; }\n'
        + '}\n';
    const t = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } } as any);
    test ('go prints each implementation once', () => {
        const out = t.transpileGo (SRC).content;
        expect ((out.match (/\) Pick\(/g) ?? []).length).toBe (2);
        expect (out).toContain ('Other(');
    });
    test ('java prints each implementation once', () => {
        const out = t.transpileJava (SRC).content;
        expect ((out.match (/ pick\(/g) ?? []).length).toBe (2);
    });
    test ('csharp prints each implementation once', () => {
        const out = t.transpileCSharp (SRC).content;
        expect ((out.match (/ pick\(/g) ?? []).length).toBe (2);
    });
    test ('a method with a body is still printed (negative)', () => {
        const out = t.transpileGo ('class A {\n    f (a: string) { return a; }\n}\n').content;
        expect (out).toContain ('F(');
    });
});

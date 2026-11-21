import { Transpiler } from '../src/transpiler';

// a required boolean parameter of an async method prints `bool` when every call site passes a const
// local initialised from a comparison; a reassigned/annotated local or a maybe-nil value keeps `any`.
describe ('go async boolean parameter from a const comparison local', () => {
    let transpiler: Transpiler;
    beforeAll (() => {
        transpiler = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    });
    const go = (ts: string): string => transpiler.transpileGo (ts).content;
    const signature = (out: string, name: string): string => out.split ('\nfunc ').find ((f) => f.startsWith ('(this *Test) ' + name + '(')) ?? '';
    const body = (main: string, use = 'if (flag) { return 1; } return 2;') => 'class Base {}\nclass Test extends Base {\n'
        + '    async load (flag: boolean): Promise<any> { ' + use + ' }\n'
        + '    async main (type: string): Promise<any> { ' + main + ' }\n}\n';
    test ('const comparison local: bool parameter, native truthiness', () => {
        const out = go (body ("const isContract = (type !== 'spot'); return await this.load (isContract);"));
        expect (signature (out, 'Load')).toContain ('(flag bool)');
        expect (out).not.toContain ('EvalTruthy(flag)');
    });
    test ('&& / ! of comparisons is still a bool', () => {
        const out = go (body ("const a = !(type === 'x') && (type !== 'y'); return await this.load (a);"));
        expect (signature (out, 'Load')).toContain ('(flag bool)');
    });
    test ('a let local (reassignable) keeps any', () => {
        const out = go (body ("let isContract: any = (type !== 'spot'); isContract = undefined; return await this.load (isContract);"));
        expect (signature (out, 'Load')).not.toContain ('flag bool');
    });
    test ('a const local from a non-comparison (maybe nil) keeps any', () => {
        const out = go (body ('const x = this.load; const v = type || undefined; return await this.load (v as any);'));
        expect (signature (out, 'Load')).not.toContain ('flag bool');
    });
    test ('a body that nil-tests the parameter keeps any', () => {
        const out = go (body ("const c = (type !== 'spot'); return await this.load (c);", 'if (flag === undefined) { return 1; } return 2;'));
        expect (signature (out, 'Load')).not.toContain ('flag bool');
    });
});

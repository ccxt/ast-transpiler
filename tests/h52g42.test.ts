import { Transpiler, installCcxtGoHooks } from '../src/transpiler';

describe('go optional Str parameter read by startsWith / slice / toLowerCase', () => {
    const HEAD = 'type Dict = { [key: string]: any };\ntype Str = string | undefined;\nclass Exchange {\n'
        + '    handleOptionStringAndParams (params: Dict, m: string, k: string, d: Str = undefined): [Str, Dict] { return [ d, params ]; }\n';
    const print = (body: string): string => {
        const t: any = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 }, 'asyncMethodSuffix': 'Async' } });
        installCcxtGoHooks (t.goTranspiler);
        return t.transpileGo (HEAD + '    caller (params: Dict) {\n        const o = this.handleOptionStringAndParams (params, \'x\', \'v\')[0];\n        const v = this.fmt (o);\n        return v;\n    }\n'
            + '    fmt (address: Str = undefined): Str {\n' + body + '\n    }\n}\n').content;
    };
    test('a nil-guarded Str parameter read by startsWith, slice and toLowerCase binds *string and prints native (fails on the base printer)', () => {
        const out = print ("if (address === undefined) {\n return undefined;\n }\n if (address.startsWith ('0x') || address.startsWith ('0X')) {\n return address.slice (2).toLowerCase ();\n }\n return address.toLowerCase ();");
        expect (out).toContain ('var address *string = GetArgStringPtr(optionalArgs, 0, nil)');
        expect (out).toContain ('strings.HasPrefix(*address, "0x")');
        expect (out).toContain ('strings.ToLower(*address)');
        expect (out).not.toContain ('StartsWith(');
        expect (out).not.toContain ('Slice(address');
    });
    test('an unguarded slice keeps the box and the helper', () => {
        const out = print ("return address.slice (2);");
        expect (out).toContain ('address := GetArg(optionalArgs, 0, nil)');
        expect (out).toContain ('Slice(address, 2, nil)');
    });
    test('a slice after a nil test that does not exit keeps the box', () => {
        const out = print ("if (address === undefined) {\n address = '';\n }\n return address.slice (2);");
        expect (out).not.toContain ('(*address)[');
    });
});

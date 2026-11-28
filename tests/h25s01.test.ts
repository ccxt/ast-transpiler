import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const print = (body: string): string => {
    const inst = new Transpiler ({ 'verbose': false });
    installCcxtGoLocalTypes ((inst as any).goTranspiler);
    const input = 'type Dict = { [key: string]: any };\n'
        + 'class T {\n'
        + '    omit (x: any, k: any): any { return x; }\n'
        + '    extend (...args: any[]): any { return args; }\n'
        + '    safeString (a, b) { return a; }\n'
        + '    async publicGetX (params: any = {}): Promise<any> { return params; }\n'
        + '    handleOptionIntegerAndParams (params: Dict, m: string, o: string, d: number = undefined): [number, Dict] { return [ d, params ]; }\n'
        + '    async f (params: Dict = {}) {\n'
        + '        const [ flag, paramsFlag ] = this.handleOptionIntegerAndParams (params, \'f\', \'flag\', 2);\n'
        + body
        + '    }\n'
        + '}\n';
    return inst.transpileGo (input).content;
};

describe ('h25s01 omit result of a proven map handed on only as a call argument', () => {
    test ('the local is a map', () => {
        const out = print ('        const query = this.omit (paramsFlag, \'x\');\n'
            + '        return await this.publicGetX (this.extend ({ \'a\': flag }, query));\n');
        expect (out).toContain ('var query map[string]any = ');
    });
    test ('an omit of a value that is not a proven map keeps the box', () => {
        const out = print ('        const raw: any = this.safeString (params, \'r\');\n'
            + '        const query = this.omit (raw, \'x\');\n'
            + '        return await this.publicGetX (this.extend ({ \'a\': flag }, query));\n');
        expect (out).not.toContain ('var query map[string]any');
    });
    test ('a use that is not a call argument keeps the box', () => {
        const out = print ('        const query = this.omit (paramsFlag, \'x\');\n'
            + '        const rows = [ query ];\n'
            + '        return await this.publicGetX (this.extend ({ \'a\': flag }, rows));\n');
        expect (out).not.toContain ('var query map[string]any');
    });
    test ('a local rebound with a non-map value keeps the box', () => {
        const out = print ('        let query = this.omit (paramsFlag, \'x\');\n'
            + '        query = this.safeString (params, \'y\');\n'
            + '        return await this.publicGetX (this.extend ({ \'a\': flag }, query));\n');
        expect (out).not.toContain ('var query map[string]any');
    });
    test ('a local read through `in` keeps the box', () => {
        const out = print ('        const query = this.omit (paramsFlag, \'x\');\n'
            + '        if (\'k\' in query) { return undefined; }\n'
            + '        return await this.publicGetX (this.extend ({ \'a\': flag }, query));\n');
        expect (out).not.toContain ('var query map[string]any');
    });
});

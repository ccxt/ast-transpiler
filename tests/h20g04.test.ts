import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

const HEAD = 'class Exchange {\n'
    + '    omit (x: any, k: any): any { return x; }\n'
    + '    safeString (x: any, k: any): any { return x; }\n'
    + '    extend (...args: any[]): any { return args; }\n'
    + '    handlePostOnly (isMarketOrder: boolean, exchangeSpecificPostOnlyOption: boolean, params: Dict = {}): [boolean, Dict] { return [ false, params ]; }\n'
    + '}\nexport default Exchange;\n';
const TYPES = 'type Str = string | undefined;\ntype Dict = { [key: string]: any };\ntype NullableDict = Dict | undefined;\n';
export const print = (body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h20g04-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        const file = path.join (dir, 'ts', 'src', 'x.ts');
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + HEAD);
        fs.writeFileSync (file, 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t = new Transpiler (config);
        installCcxtGoLocalTypes (t.goTranspiler);
        return t.transpileGoByPath (file).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};

const BYBIT = '    sign (path: string, apiName = \'public\', method = \'GET\', params = {}, headers: any = undefined, body: any = undefined) {\n'
    + '        let requestHeaders: NullableDict = undefined;\n'
    + '        if (apiName === \'private\') {\n'
    + '            requestHeaders = {\n'
    + '                \'k\': path,\n'
    + '            };\n'
    + '            requestHeaders[\'s\'] = method;\n'
    + '        }\n'
    + '        if (method === \'POST\') {\n'
    + '            const brokerId = this.safeString (params, \'brokerId\');\n'
    + '            const headersBase = requestHeaders;\n'
    + '            requestHeaders = (headersBase === undefined) ? {} : headersBase;\n'
    + '            requestHeaders[\'Referer\'] = brokerId;\n'
    + '        }\n'
    + '        const headersResolved = requestHeaders;\n'
    + '        return { \'url\': path, \'method\': method, \'body\': body, \'headers\': headersResolved };\n'
    + '    }';

const TUPLE = '    editOrder (id: string, type: string, params = {}) {\n'
    + '        const clientOrderId = this.safeString (params, \'clientOrderId\');\n'
    + '        let paramsOmitted: Dict = (clientOrderId !== undefined) ? this.omit (params, [ \'clientOrderId\' ]) : params;\n'
    + '        let postOnly = undefined;\n'
    + '        [ postOnly, paramsOmitted ] = this.handlePostOnly (type === \'market\', false, paramsOmitted);\n'
    + '        const request: Dict = { \'id\': id };\n'
    + '        if (postOnly) {\n'
    + '            request[\'post_only\'] = \'true\';\n'
    + '        }\n'
    + '        return this.safeString (paramsOmitted, \'x\');\n'
    + '    }';

describe ('h20g04 empty-default rebind of a nil-join map local', () => {
    test ('bybit shape types the local, its copy, and prints the rebind and store natively', () => {
        const out = print (BYBIT);
        expect (out).toContain ('var requestHeaders map[string]any = nil\n');
        expect (out).toContain ('var headersBase map[string]any = requestHeaders\n');
        expect (out).toContain ('if headersBase == nil {\n\t\t\trequestHeaders = map[string]any{}\n\t\t} else {\n\t\t\trequestHeaders = headersBase\n\t\t}\n');
        expect (out).not.toContain ('func() any');
    });
    test ('a string value store after the rebind is native', () => {
        const out = print (BYBIT.replace ('requestHeaders[\'Referer\'] = brokerId;', 'requestHeaders[\'Referer\'] = \'ccxt\';'));
        expect (out).toContain ('\t\t}\n\t\trequestHeaders["Referer"] = "ccxt"\n');
    });
    test ('a copy read elsewhere keeps the box', () => {
        const out = print (BYBIT.replace ('requestHeaders[\'Referer\'] = brokerId;', 'requestHeaders[\'Referer\'] = brokerId;\n            this.safeString (headersBase, \'x\');'));
        expect (out).toContain ('var headersBase any = requestHeaders');
        expect (out).toContain ('func() any');
    });
    test ('a non-empty default literal keeps the box', () => {
        const out = print (BYBIT.replace ('? {} :', '? { \'a\': 1 } :'));
        expect (out).toContain ('func() any');
    });
    test ('a rebind of another local keeps the box', () => {
        const out = print (BYBIT.replace ('requestHeaders = (headersBase', 'let other: any = undefined;\n            other = (headersBase'));
        expect (out).not.toContain ('if headersBase == nil {');
    });
    test ('a non-map write of the local keeps the box', () => {
        const out = print (BYBIT.replace ('requestHeaders[\'s\'] = method;', 'requestHeaders[\'s\'] = method;\n            requestHeaders = this.safeString (params, \'h\');'));
        expect (out).not.toContain ('var requestHeaders map[string]any');
        expect (out).not.toContain ('if headersBase == nil {');
    });
});

const KRAKEN = (extra = '', init = '(clientOrderId !== undefined) ? this.omit (params, [ \'clientOrderId\' ]) : params', ann = ': Dict') => '    editOrder (id: string, type: string, params = {}) {\n'
    + '        const clientOrderId = this.safeString (params, \'clientOrderId\');\n'
    + '        let paramsOmitted' + ann + ' = ' + init + ';\n'
    + '        let postOnly: boolean = undefined;\n'
    + '        [ postOnly, paramsOmitted ] = this.handlePostOnly (type === \'market\', false, paramsOmitted);\n'
    + '        const offset = this.safeString (paramsOmitted, \'offset\');\n'
    + '        if (offset !== undefined) {\n'
    + '            paramsOmitted = this.omit (paramsOmitted, [ \'offset\' ]);\n'
    + '        }\n' + extra
    + '        return this.extend ({}, paramsOmitted);\n'
    + '    }';

describe ('h20g04 Dict local rebound by a Dict tuple slot', () => {
    test ('kraken shape: the local is a map, the slot read and the self-omit are native', () => {
        const out = print (KRAKEN ());
        expect (out).toContain ('var paramsOmitted map[string]any\n');
        expect (out).toContain ('paramsOmitted = MapTyped(GetValue(postOnlyparamsOmittedVariable, 1))\n');
        expect (out).toContain ('paramsOmitted = MapTyped(this.Omit(paramsOmitted, []any{"offset"}))\n');
        expect (out).not.toContain ('func() any');
    });
    test ('an unannotated local keeps the box', () => {
        const out = print (KRAKEN ('', 'params', ''));
        expect (out).not.toContain ('var paramsOmitted map[string]any');
    });
    test ('a non-map write keeps the box', () => {
        const out = print (KRAKEN ('        paramsOmitted = this.safeString (params, \'x\');\n'));
        expect (out).not.toContain ('var paramsOmitted map[string]any');
        expect (out).not.toContain ('MapTyped(GetValue(postOnlyparamsOmittedVariable');
    });
});

describe ('h20g04 element-written tuple rebind', () => {
    test ('a Dict local with element writes keeps its helper store', () => {
        const out = print ('    f (symbol: Str, params = {}) {\n'
            + '        let request: Dict = {};\n'
            + '        if (symbol !== undefined) {\n'
            + '            request[\'symbol\'] = this.safeString (params, symbol);\n'
            + '        }\n'
            + '        let postOnly: boolean = undefined;\n'
            + '        [ postOnly, request ] = this.handlePostOnly (false, false, request);\n'
            + '        return request;\n'
            + '    }');
        expect (out).not.toContain ('MapTyped(GetValue(postOnlyrequestVariable, 1))');
    });
});

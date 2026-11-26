import fs from 'fs';
import os from 'os';
import path from 'path';
import { Transpiler, installCcxtGoLocalTypes, installCcxtGoIndexableTypes, installCcxtGoParamTypes, installCcxtGoDictParams, installCcxtGoGb05ParamTypes, installCcxtGoSignTyping, installCcxtGoTupleSlotReads } from '../src/transpiler';

// handlePostOnly is a Go (bool, map[string]any) pair: the base returns two values and every caller binds them
const TYPES = 'type Str = string | undefined;\ntype Bool = boolean | undefined;\ntype Dict = { [key: string]: any };\n';
const BASE = 'class Exchange {\n'
    + '    id: string;\n'
    + '    omit (x: any, k: any): any { return x; }\n'
    + '    safeString (x: any, k: any, d: any = undefined): Str { return x; }\n'
    + '    safeStringUpper (x: any, k: any, d: any = undefined): Str { return x; }\n'
    + '    safeBool (x: any, k: any, d: any = undefined): Bool { return x; }\n'
    + '    safeDict (x: any, k: any, d: any = undefined): Dict { return x; }\n'
    + '    extend (...args: any[]): any { return args; }\n'
    + '    handleMarketTypeAndParams (m: string, market: any = undefined, params = {}): [string, Dict] { return [ m, params ]; }\n'
    + '    handlePostOnly (isMarketOrder: boolean, exchangeSpecificPostOnlyOption: boolean, params: Dict = {}): [boolean, Dict] {\n'
    + '        const timeInForce = this.safeStringUpper (params, \'timeInForce\');\n'
    + '        const po = timeInForce === \'PO\';\n'
    + '        const postOnly = this.safeBool (params, \'postOnly\', false) || po || exchangeSpecificPostOnlyOption;\n'
    + '        if (postOnly) {\n'
    + '            if (isMarketOrder) {\n'
    + '                throw new Error (this.id + \' market orders cannot be postOnly\');\n'
    + '            } else {\n'
    + '                let keysToOmit: string[] = [];\n'
    + '                if (po) {\n'
    + '                    keysToOmit = [ \'timeInForce\', \'postOnly\' ];\n'
    + '                } else {\n'
    + '                    keysToOmit = [ \'postOnly\' ];\n'
    + '                }\n'
    + '                const paramsOmitted = this.omit (params, keysToOmit);\n'
    + '                return [ true, paramsOmitted ];\n'
    + '            }\n'
    + '        }\n'
    + '        return [ false, params ];\n'
    + '    }\n'
    + '}\nexport default Exchange;\n';

const transpile = (file: string, base: string, body: string): string => {
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h53g02-'));
    try {
        fs.mkdirSync (path.join (dir, 'ts', 'src', 'base'), { 'recursive': true });
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'base', 'Exchange.ts'), TYPES + base);
        fs.writeFileSync (path.join (dir, 'ts', 'src', 'x.ts'), 'import Exchange from \'./base/Exchange.js\';\n' + TYPES + 'export default class X extends Exchange {\n' + body + '\n}\n');
        const config: any = { 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } };
        const t = new Transpiler (config);
        installCcxtGoLocalTypes (t.goTranspiler);
        installCcxtGoIndexableTypes (t.goTranspiler);
        installCcxtGoParamTypes (t.goTranspiler);
        installCcxtGoDictParams (t.goTranspiler);
        installCcxtGoGb05ParamTypes (t.goTranspiler);
        installCcxtGoSignTyping (t.goTranspiler);
        installCcxtGoTupleSlotReads (t.goTranspiler);
        return t.transpileGoByPath (path.join (dir, 'ts', 'src', file)).content;
    } finally {
        fs.rmSync (dir, { 'recursive': true, 'force': true });
    }
};
const venue = (body: string) => transpile ('x.ts', BASE, body);
const base = () => transpile ('base/Exchange.ts', BASE, '');

const A = '    a (type: string, params = {}) {\n'
    + '        const [ postOnly, paramsPostOnly ] = this.handlePostOnly (type === \'market\', false, params);\n'
    + '        if (postOnly) { return this.safeString (paramsPostOnly, \'x\'); }\n'
    + '        return undefined;\n'
    + '    }';
const B = (decl: string, after = '') => '    b (type: string, params = {}) {\n'
    + '        ' + decl + '\n'
    + '        let query = undefined;\n'
    + '        [ postOnly, query ] = this.handlePostOnly (type === \'market\', false, params);\n'
    + after
    + '        if (postOnly) { return this.safeString (query, \'x\'); }\n'
    + '        return undefined;\n'
    + '    }';

describe ('h53g02 handlePostOnly (bool, map[string]any)', () => {
    test ('the base prints the pair on every return path', () => {
        const out = base ();
        expect (out).toContain (') (bool, map[string]any) {');
        expect (out).toContain ('return true, MapTyped(paramsOmitted)');
        expect (out).toContain ('return false, MapTyped(params)');
        expect (out).not.toContain ('[]any{true');
    });
    test ('a const destructure binds both slots', () => {
        const out = venue (A);
        expect (out).toContain ('postOnly, paramsPostOnly := this.HandlePostOnly((typeVar == "market"), false, params)');
        expect (out).not.toContain ('Variable');
    });
    test ('a copy of the joined params local that is re-omitted stays a map', () => {
        const out = venue ('    a (type: string, params = {}) {\n'
            + '        const [ postOnly, paramsPostOnly ] = this.handlePostOnly (type === \'market\', false, params);\n'
            + '        let paramsCreate = paramsPostOnly;\n'
            + '        if (postOnly) {\n'
            + '            paramsCreate = this.omit (paramsPostOnly, [ \'reduceOnly\' ]);\n'
            + '        }\n'
            + '        const paramsOmitted = this.omit (paramsCreate, [ \'cost\' ]);\n'
            + '        return [ postOnly, paramsOmitted ];\n'
            + '    }');
        fs.writeFileSync ('/root/workspace/campaigns/hx12/work/h53/tmp-H53-G02/probe3.go', out);
        expect (out).toContain ('var paramsCreate map[string]any = paramsPostOnly');
    });
    test ('a rebind of declared locals assigns both slots', () => {
        const out = venue (B ('let postOnly: Bool = undefined;'));
        expect (out).toContain ('postOnly, query = this.HandlePostOnly((typeVar == "market"), false, params)');
        expect (out).not.toContain ('.(bool)');
        expect (out).not.toContain ('TupleSlice');
    });
    test ('a nil-tested slot 0 stays boxed and still takes the pair', () => {
        const out = venue (B ('let postOnly: Bool = undefined;', '        if (postOnly === undefined) { return \'n\'; }\n'));
        expect (out).toContain ('var postOnly any = nil');
        expect (out).not.toContain ('.(bool)');
    });
});

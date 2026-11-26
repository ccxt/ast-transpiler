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
    + '    safeOutcome (x: Str, m: any = undefined): Dict { return {}; }\n'
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
    const dir = fs.mkdtempSync (path.join (os.tmpdir (), 'h54g67-'));
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


const V1 = '    parseX (order: Dict) {\n'
    + '        const marketHash = this.safeString (order, \'marketHash\', \'\');\n'
    + '        const one = this.safeBool (order, \'one\', true);\n'
    + '        let outcomeId: Str = undefined;\n'
    + '        if (one) {\n'
    + '            outcomeId = marketHash;\n'
    + '        } else {\n'
    + '            outcomeId = (marketHash + \'-2\');\n'
    + '        }\n'
    + '        const o = this.safeOutcome (outcomeId, order);\n'
    + '        return o;\n'
    + '    }\n';

describe ('h54g67: a nil-declared Str local handed to the outcome handle slot', () => {
    test ('the handle slot of safeOutcome keeps the *string type', () => {
        const out = venue (V1);
        expect (out).toContain ('var outcomeId *string = nil');
        expect (out).toContain ('this.SafeOutcome(outcomeId, order)');
        expect (out).not.toContain ('var outcomeId any');
    });
    test ('negative: another callee still boxes the local', () => {
        const out = venue (V1.replace ('this.safeOutcome (outcomeId, order)', 'this.omit (order, outcomeId)'));
        expect (out).toContain ('var outcomeId any = nil');
    });
    test ('negative: a nil write and a non-string write still box the local', () => {
        const out = venue (V1.replace ("(marketHash + '-2')", 'order'));
        expect (out).toContain ('var outcomeId any = nil');
    });
});

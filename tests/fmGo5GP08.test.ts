import { Transpiler, installFmGo5GP08, installCcxtGoLocalTypes } from '../src/transpiler';

// FM-GO5 GP08: a first-result read of the base-class `(T, map[string]any)` tuple helpers binds natively; keyed on the
// checker-resolved declaring class (an override keeps the boxed read), no per-exchange name list in ccxt.
const BASE = [
    'type Dict = { [key: string]: any };',
    'type Str = string | undefined;',
    'type Bool = boolean | undefined;',
    'class BaseExchange {',
    '    options: Dict = {};',
    '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ undefined, params ]; }',
    '    handleOptionBoolAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Bool = undefined): [Bool, Dict] { return [ true, params ]; }',
    '    handleUntilOption (key: string, request: Dict, params: Dict, multiplier: number = 1): [Dict, Dict] { return [ request, params ]; }',
    '}',
].join ('\n');
const SRC = BASE + '\n' + [
    'class Ex extends BaseExchange {',
    '    f (params: Dict, market: any) {',
    '        const typeVar = this.handleMarketTypeAndParams ("fetchX", market, params)[0];',
    '        const filterClosed = this.handleOptionBoolAndParams (params, "fetchX", "filterClosed", false)[0];',
    '        const values = this.handleOptionBoolAndParams (params, "watchX", "uta", false);',
    '        const uta: Bool = values[0];',
    '        const requestUntil = this.handleUntilOption ("end", {}, params)[0];',
    '        return [ typeVar, filterClosed, uta, requestUntil ];',
    '    }',
    '}',
    '',
].join ('\n');
const OVERRIDE = BASE + '\n' + [
    'class Ex extends BaseExchange {',
    '    handleMarketTypeAndParams (methodName: string, market: any = undefined, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ "x", params ]; }',
    '    f (params: Dict, market: any) {',
    '        const typeVar = this.handleMarketTypeAndParams ("fetchX", market, params)[0];',
    '        return typeVar;',
    '    }',
    '}',
    '',
].join ('\n');
const STP = BASE + '\n' + [
    'class Ex extends BaseExchange {',
    '    handleOptionStringAndParams (params: Dict, methodName: Str, optionName: string, defaultValue: Str = undefined): [Str, Dict] { return [ undefined, params ]; }',
    '    f (params: Dict) {',
    '        let stp: Str = undefined;',
    '        [ stp, params ] = this.handleOptionStringAndParams (params, "createOrder", "stp");',
    '        if (stp !== undefined) {',
    '            this.options["k"] = stp.toUpperCase () + stp.toLowerCase ();',
    '        }',
    '        return params;',
    '    }',
    '}',
    '',
].join ('\n');
const print = (src: string, install = true): string => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    installCcxtGoLocalTypes (x.goTranspiler);
    if (install) { installFmGo5GP08 (x.goTranspiler); }
    const out = x.transpileGo (src).content;
    return out.slice (out.indexOf ('func (this *Ex)'));
};

describe ('FM-GO5 GP08 tuple first-result binds', () => {
    test('direct and held first-result reads bind natively', () => {
        const out = print (SRC);
        expect (out).toContain ('typeVar, _ := this.HandleMarketTypeAndParams("fetchX", market, params)');
        expect (out).toContain ('filterClosedValue, _ := this.HandleOptionBoolAndParams(params, "fetchX", "filterClosed", false)');
        expect (out).toContain ('filterClosed := &filterClosedValue');
        expect (out).toContain ('utaValue, _ := this.HandleOptionBoolAndParams(params, "watchX", "uta", false)');
        expect (out).toContain ('requestUntil, _ := this.HandleUntilOption("end", map[string]any{}, params)');
        expect (out).not.toContain ('TupleSlice');
        expect (out).not.toContain ('values');
    });
    test('fails without the hook (base printer keeps TupleSlice)', () => {
        expect (print (SRC, false)).toContain ('TupleSlice(this.HandleMarketTypeAndParams(');
    });
    test('an override of the helper keeps the boxed read', () => {
        const out = print (OVERRIDE);
        expect (out).toContain ('TupleSlice(this.HandleMarketTypeAndParams(');
        expect (out).not.toContain ('typeVar, _ :=');
    });
    test('a nil-declared local read through toUpperCase/toLowerCase is the pair\'s *string', () => {
        const out = print (STP);
        expect (out).toContain ('var stp *string = nil');
        expect (out).toContain ('stp, params = this.HandleOptionStringAndParams(params, "createOrder", "stp")');
        expect (out).not.toContain ('TupleSlice');
    });
});

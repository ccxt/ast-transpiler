import { Transpiler, installCcxtGoLocalTypes } from '../src/transpiler';

// RD-GO-3: a MapTyped wrap around an operand that is already map[string]any by declaration is the identity,
// so the printer does not emit it (was the ccxt build passes hx10w6-G11 / hx10w7-G14).
const BASE = [
    'type Dict = { [key: string]: any };',
    'type Str = string | undefined;',
    'class BaseExchange {',
    '    parsePosition (position: Dict, market: any = undefined): Dict { return position; }',
    '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined): [Str, Dict] { return [ defaultValue, params ]; }',
    '}',
].join ('\n');
const print = (body: string, install = true): string => {
    const x = new Transpiler ({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 } } });
    if (install) { installCcxtGoLocalTypes (x.goTranspiler); }
    const out = x.transpileGo (BASE + '\n' + body).content;
    return out.slice (out.indexOf ('func (this *Ex)'));
};

describe ('RD-GO-3 MapTyped identity wraps are not printed', () => {
    test('a local from a callee that prints map[string]any is declared without the wrap', () => {
        const out = print ([
            'class Ex extends BaseExchange {',
            '    f (first: Dict, market: any) {',
            '        const position = this.parsePosition (first, market);',
            '        position[\'timestamp\'] = 1;',
            '        return position;',
            '    }',
            '}',
        ].join ('\n'));
        expect (out).toContain ('var position map[string]any = this.ParsePosition(first, market)');
        expect (out).not.toContain ('MapTyped(');
    });
    test('the params element of a joined pair returns as the map it is', () => {
        const out = print ([
            'class Ex extends BaseExchange {',
            '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined) {',
            '        const [ marginMode, paramsMarginMode ] = super.handleMarginModeAndParams (methodName, params, defaultValue);',
            '        if (marginMode === undefined) {',
            '            return [ \'cross\', paramsMarginMode ];',
            '        }',
            '        return [ marginMode, paramsMarginMode ];',
            '    }',
            '}',
        ].join ('\n'));
        expect (out).toContain ('return SafeStringPtr(marginMode), paramsMarginMode');
        expect (out).not.toContain ('MapTyped(');
    });
    test('a params element that is rebound keeps the wrap', () => {
        const out = print ([
            'class Ex extends BaseExchange {',
            '    handleMarginModeAndParams (methodName: string, params: Dict = {}, defaultValue: Str = undefined) {',
            '        let [ marginMode, paramsMarginMode ] = super.handleMarginModeAndParams (methodName, params, defaultValue);',
            '        paramsMarginMode = params;',
            '        return [ marginMode, paramsMarginMode ];',
            '    }',
            '}',
        ].join ('\n'));
        expect (out).not.toContain ('return SafeStringPtr(marginMode), paramsMarginMode');
    });
});

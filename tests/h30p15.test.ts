import { Transpiler } from '../src/transpiler';
import { h30p15ParamHasFamilyType } from '../src/goTranspiler';

describe('h30-P15: proven map family returning its own typed map parameter', () => {
    test('a parameter already declared map[string]any and never re-bound is accepted', () => {
        expect (h30p15ParamHasFamilyType ('liquidation map[string]any, optionalArgs ...any', 'liquidation', 'map[string]any', '{\n\tliquidation["a"] = 1\n\treturn liquidation\n}')).toBe (true);
    });
    test('an any parameter is not accepted', () => {
        expect (h30p15ParamHasFamilyType ('liquidation any, optionalArgs ...any', 'liquidation', 'map[string]any', '{\n\treturn liquidation\n}')).toBe (false);
    });
    test('a re-declared parameter is not accepted', () => {
        expect (h30p15ParamHasFamilyType ('liquidation map[string]any', 'liquidation', 'map[string]any', '{\n\tvar liquidation any = nil\n\treturn liquidation\n}')).toBe (false);
        expect (h30p15ParamHasFamilyType ('liquidation map[string]any', 'liquidation', 'map[string]any', '{\n\tliquidation := 1\n\treturn liquidation\n}')).toBe (false);
    });
    test('an untyped returned parameter of a family method keeps the MapTyped wrap', () => {
        const fam = new Transpiler({ 'verbose': false, 'go': { 'parser': { 'NUM_LINES_END_FILE': 0 },
            'provenReturnFamilies': [ { 'names': [ 'ParseLiquidation' ], 'type': 'map[string]any', 'paramWrap': 'MapTyped', 'calls': [] } ] } });
        const out = fam.transpileGo('class X {\n    parseLiquidation (liquidation, market = undefined) {\n        return liquidation;\n    }\n}\n').content;
        expect (out).toContain ('return MapTyped(liquidation)');
    });
});

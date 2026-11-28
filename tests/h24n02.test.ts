import { print } from './h20g04.test';

const PARSE = (decl: string, writes: string, use = '            t = this.safeStringLower (leg, \'type\');\n') => '    parseOrder (order: Dict, market: Market = undefined) {\n'
    + '        const takeProfit = this.safeDict (order, \'take_profit\');\n'
    + '        const stopLoss = this.safeDict (order, \'stop_loss\');\n'
    + '        ' + decl + '\n'
    + writes
    + '        let t = undefined;\n'
    + '        if (leg !== undefined) {\n'
    + use
    + '        }\n'
    + '        return t;\n'
    + '    }';
const ALIASES = '        if ((takeProfit !== undefined) && (stopLoss === undefined)) {\n'
    + '            leg = takeProfit;\n'
    + '        } else if (stopLoss !== undefined) {\n'
    + '            leg = stopLoss;\n'
    + '        }\n';

describe ('h24n02 nil-declared Dict local written only from map locals', () => {
    test ('a NullableDict local aliasing two map locals is a map', () => {
        const out = print (PARSE ('let leg: NullableDict = undefined;', ALIASES));
        expect (out).toContain ('var leg map[string]any = nil\n');
        expect (out).toContain ('leg = takeProfit\n');
    });
    test ('an alias of a boxed local keeps the box', () => {
        const out = print (PARSE ('let leg: NullableDict = undefined;', '        const other = this.safeValue (order, \'x\');\n        leg = other;\n'));
        expect (out).toContain ('var leg any = nil\n');
    });
    test ('a non-map write next to a map alias keeps the box', () => {
        const out = print (PARSE ('let leg: any = undefined;', ALIASES + '        leg = \'x\';\n'));
        expect (out).toContain ('var leg any = nil\n');
    });
    test ('a read before any write that escapes into any keeps the box', () => {
        const out = print ('    parseOrder (order: Dict, market: Market = undefined) {\n'
            + '        const takeProfit = this.safeDict (order, \'take_profit\');\n'
            + '        let leg: NullableDict = undefined;\n'
            + '        if (market === undefined) {\n'
            + '            return leg;\n'
            + '        }\n'
            + '        leg = takeProfit;\n'
            + '        return leg;\n'
            + '    }');
        expect (out).toContain ('var leg any = nil\n');
    });
    test ('an element-written alias keeps the box', () => {
        const out = print (PARSE ('let leg: NullableDict = undefined;', ALIASES + '        leg[\'k\'] = this.safeString (order, \'k\');\n'));
        expect (out).toContain ('var leg any = nil\n');
    });
});

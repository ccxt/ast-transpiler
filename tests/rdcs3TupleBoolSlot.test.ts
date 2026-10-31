import { Transpiler } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

const config: any = { 'verbose': false, 'csharp': { 'parser': { 'NUM_LINES_END_FILE': 0, 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } };

const source =
    "class Exchange {\n" +
    "    handleOptionAndParams (params: any, methodName: string, optionName: string, defaultValue: any = undefined): any[] { return [ params, params ]; }\n" +
    "    handleOptionAndParams2 (params: any, methodName: string, optionName1: string, optionName2: string, defaultValue: any = undefined): any[] { return [ params, params ]; }\n" +
    "    use (x: any) { return x; }\n" +
    "    write (params: any) {\n" +
    "        let warn = true;\n" +
    "        let paramsValue = params;\n" +
    "        [ warn, paramsValue ] = this.handleOptionAndParams (paramsValue, 'cancelAllOrders', 'warnOnCancelAllOrdersWithOutcome', warn);\n" +
    "        if (warn) {\n" +
    "            throw new Error ('x');\n" +
    "        }\n" +
    "    }\n" +
    "    writeUsed (params: any) {\n" +
    "        let paginate = false;\n" +
    "        let paramsValue = params;\n" +
    "        [ paginate, paramsValue ] = this.handleOptionAndParams (paramsValue, 'fetchMyTrades', 'paginate', paginate);\n" +
    "        this.use (paginate);\n" +
    "        paginate = !paginate;\n" +
    "    }\n" +
    "    writeOtherKey (params: any) {\n" +
    "        let flag = true;\n" +
    "        let paramsValue = params;\n" +
    "        [ flag, paramsValue ] = this.handleOptionAndParams (paramsValue, 'm', 'someOption', flag);\n" +
    "        if (flag) {\n" +
    "            return 1;\n" +
    "        }\n" +
    "    }\n" +
    "    writeNoDefault (params: any) {\n" +
    "        let paginate = false;\n" +
    "        let paramsValue = params;\n" +
    "        [ paginate, paramsValue ] = this.handleOptionAndParams (paramsValue, 'm', 'paginate');\n" +
    "        if (paginate) {\n" +
    "            return 1;\n" +
    "        }\n" +
    "    }\n" +
    "    writeOtherWrite (params: any, other: any) {\n" +
    "        let paginate = false;\n" +
    "        let paramsValue = params;\n" +
    "        [ paginate, paramsValue ] = this.handleOptionAndParams (paramsValue, 'm', 'paginate', paginate);\n" +
    "        paginate = other;\n" +
    "        if (paginate) {\n" +
    "            return 1;\n" +
    "        }\n" +
    "    }\n" +
    "    declLiteral (params: any) {\n" +
    "        const [ useDepthEndpoint, rest ] = this.handleOptionAndParams (params, 'm', 'useDepthEndpoint', false);\n" +
    "        if (useDepthEndpoint) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declLiteral2 (params: any) {\n" +
    "        const [ paginate, rest ] = this.handleOptionAndParams2 (params, 'm', 'paginate', 'removeRepeated', true);\n" +
    "        const [ paginateOther, rest2 ] = this.handleOptionAndParams2 (params, 'm', 'paginate', 'other', true);\n" +
    "        if (paginate) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declParameter (params: any, removeRepeated = true) {\n" +
    "        const [ removeRepeatedOption, rest ] = this.handleOptionAndParams (params, 'm', 'removeRepeated', removeRepeated);\n" +
    "        if (removeRepeatedOption) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declParameterWritten (params: any, removeRepeated = true) {\n" +
    "        removeRepeated = this.use (removeRepeated);\n" +
    "        const [ removeRepeatedOption, rest ] = this.handleOptionAndParams (params, 'm', 'removeRepeated', removeRepeated);\n" +
    "        if (removeRepeatedOption) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declParameterNoDefault (params: any, removeRepeated: any) {\n" +
    "        const [ removeRepeatedOption, rest ] = this.handleOptionAndParams (params, 'm', 'removeRepeated', removeRepeated);\n" +
    "        if (removeRepeatedOption) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declOtherKey (params: any) {\n" +
    "        const [ interval, rest ] = this.handleOptionAndParams (params, 'm', 'interval', false);\n" +
    "        if (interval) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declNoDefault (params: any) {\n" +
    "        const [ paginate, rest ] = this.handleOptionAndParams (params, 'm', 'paginate');\n" +
    "        if (paginate) {\n" +
    "            return rest;\n" +
    "        }\n" +
    "    }\n" +
    "    declIncremented (params: any) {\n" +
    "        const [ paginate, rest ] = this.handleOptionAndParams (params, 'm', 'paginate', false);\n" +
    "        paginate++;\n" +
    "        return rest;\n" +
    "    }\n" +
    "    declOtherCallee (params: any) {\n" +
    "        const [ paginate, rest ] = this.unresolved.handleOptionAndParams (params, 'm', 'paginate', false);\n" +
    "        return rest;\n" +
    "    }\n" +
    "}";

const printer = (typedHolder: boolean): string => {
    const transpiler: any = new Transpiler(config);
    if (typedHolder) {
        transpiler.csharpTranspiler.csharpDestructuringTempType = () => 'IList<object>';
    }
    return transpiler.transpileCSharp(source).content;
};

const method = (out: string, name: string): string => {
    const start = out.indexOf(' ' + name + '(');
    expect(start).toBeGreaterThan(-1);
    const end = out.indexOf('\n    }\n', start);
    return out.slice(start, end);
};

describe('RD-CS-3: bool slot of a destructured handleOptionAndParams', () => {
    test('an assignment destructuring types the bool local and casts the slot', () => {
        const body = method(printer(true), 'write');
        expect(body).toContain('bool warn = true;');
        expect(body).toContain('warn = (bool)warnparamsValueVariable[0];');
        expect(body).toContain('if (warn)');
        const untypedHolder = method(printer(false), 'write');
        expect(untypedHolder).toContain('bool warn = true;');
        expect(untypedHolder).toContain('warn = (bool)((IList<object>)warnparamsValueVariable)[0];');
    });

    test('a local read outside a condition is still typed bool', () => {
        const body = method(printer(true), 'writeUsed');
        expect(body).toContain('bool paginate = false;');
        expect(body).toContain('paginate = (bool)paginateparamsValueVariable[0];');
    });

    test('a variable destructuring on a bool literal default declares a bool', () => {
        const out = printer(true);
        expect(method(out, 'declLiteral')).toContain('bool useDepthEndpoint = (bool)useDepthEndpointrestVariable[0];');
        expect(method(out, 'declLiteral')).toContain('if (useDepthEndpoint)');
        expect(method(out, 'declLiteral2')).toContain('bool paginate = (bool)paginaterestVariable[0];');
        expect(method(out, 'declLiteral2')).toContain('var paginateOther = paginateOtherrest2Variable[0];');
    });

    test('a bool parameter default proven by its ??= prologue declares a bool', () => {
        const body = method(printer(true), 'declParameter');
        expect(body).toContain('removeRepeated ??= true;');
        expect(body).toContain('bool removeRepeatedOption = (bool)removeRepeatedOptionrestVariable[0];');
        expect(body).toContain('if (removeRepeatedOption)');
    });

    test('anything the proof does not cover keeps the object emission', () => {
        const out = printer(true);
        expect(method(out, 'writeOtherKey')).toContain('object flag = true;');
        expect(method(out, 'writeOtherKey')).toContain('flag = flagparamsValueVariable[0];');
        expect(method(out, 'writeNoDefault')).toContain('object paginate = false;');
        expect(method(out, 'writeOtherWrite')).toContain('object paginate = false;');
        expect(method(out, 'declParameterWritten')).toContain('var removeRepeatedOption = ');
        expect(method(out, 'declParameterNoDefault')).toContain('var removeRepeatedOption = ');
        expect(method(out, 'declOtherKey')).toContain('var interval = ');
        expect(method(out, 'declNoDefault')).toContain('var paginate = ');
        expect(method(out, 'declIncremented')).toContain('var paginate = ');
        expect(method(out, 'declOtherCallee')).toContain('var paginate = ');
        expect(out).not.toContain('(bool)paginateOther');
        expect(out).not.toContain('(bool)interval');
    });
});

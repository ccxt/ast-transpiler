import { Transpiler } from '../src/transpiler';

describe ('csharp handleOrderBookSubscription subscription parameter', () => {
    const transpiler = new Transpiler({ 'verbose': false, 'csharp': { 'parser': { 'ELEMENT_ACCESS_WRAPPER_OPEN': 'getValue(', 'ELEMENT_ACCESS_WRAPPER_CLOSE': ')' } } });
    const source = (signature: string, body: string = '', extra: string = '') =>
        'type Dict = { [key: string]: any };\n' +
        'interface Client { id: string; }\n' +
        'class Exchange {\n' +
        '    safeString (o: any, k: any): any { return o; }\n' +
        '    ' + signature + ' {\n' +
        '        ' + body + '\n' +
        '        const symbol = this.safeString (subscription, \'symbol\');\n' +
        '    }\n' +
        '}\n' + extra;

    test('a declared Dict subscription prints the dictionary', () => {
        const output = transpiler.transpileCSharp(source('handleOrderBookSubscription (client: Client, message: Dict, subscription: Dict)')).content;
        expect(output).toContain('handleOrderBookSubscription(object client, Dictionary<string, object> message, IDictionary<string, object> subscription)');
    });

    test('a nullable defaulted subscription (gate) keeps object', () => {
        const output = transpiler.transpileCSharp(source('handleOrderBookSubscription (client: Client, message: Dict, subscription: Dict | undefined = undefined)')).content;
        expect(output).toContain('object subscription = null)');
        expect(output).not.toContain('IDictionary<string, object> subscription');
    });

    test('an untyped subscription keeps object', () => {
        const output = transpiler.transpileCSharp(source('handleOrderBookSubscription (client: Client, message: Dict, subscription: any)')).content;
        expect(output).toContain('object subscription)');
    });

    test('a rebound subscription keeps object', () => {
        const output = transpiler.transpileCSharp(source('handleOrderBookSubscription (client: Client, message: Dict, subscription: Dict)', 'subscription = undefined;')).content;
        expect(output).toContain('object subscription)');
    });

    test('another handler name with the same shape keeps object', () => {
        const output = transpiler.transpileCSharp(source('handleOrderBookSnapshot (client: Client, message: Dict, subscription: Dict)')).content;
        expect(output).toContain('handleOrderBookSnapshot(object client');
        expect(output).toContain('object subscription)');
    });
});

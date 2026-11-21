import { Transpiler, installCcxtGoHooks, installCcxtGoLocalTypes } from '../src/transpiler';

jest.mock('module', () => ({
    __esModule: true,
    default: jest.fn()
}));

// PredictionExchange.filterEventsBy* return the Go `[]any` events list (CCXT_GO_HELPER_RETURN_TYPES rows)
describe('FilterEventsBy* return a Go []any', () => {
    const run = (body: string) => {
        const t = new Transpiler({ verbose: false, go: {} } as any);
        installCcxtGoHooks((t as any).goTranspiler);
        installCcxtGoLocalTypes((t as any).goTranspiler);
        const head = "class PredictionExchange {\n    filterEventsByStatus (events: any[], status: Str = undefined): any[] { return events; }\n"
            + "    filterEventsByTags (events: any[], tags: Strings = undefined): any[] { return events; }\n"
            + "    filterEventsOther (events: any[]): any[] { return events; }\n";
        return t.transpileGo(head + body + "}\n").content;
    };
    test('the filtered list is a []any local with a native length', () => {
        const out = run("    m (xs: any[], s: Str) {\n        const r = this.filterEventsByStatus (xs, s);\n        const t = this.filterEventsByTags (r);\n        return r.length + t.length;\n    }\n");
        expect(out).toContain('var r []any = this.FilterEventsByStatus(');
        expect(out).toContain('var t []any = this.FilterEventsByTags(');
        expect(out).toContain('len(r)');
        expect(out).not.toContain('GetArrayLength(r)');
    });
    test('negative: another method of the same shape stays any', () => {
        const out = run("    m (xs: any[]) {\n        const r = this.filterEventsOther (xs);\n        return r.length;\n    }\n");
        expect(out).not.toContain('var r []any = this.FilterEventsOther(');
        expect(out).toContain('GetArrayLength(r)');
    });
    test('negative: a local later set to nil and tested against nil keeps the box', () => {
        const out = run("    m (xs: any[]) {\n        let r = this.filterEventsByStatus (xs);\n        if (xs.length === 0) { r = undefined; }\n        if (r === undefined) { return 0; }\n        return r;\n    }\n");
        expect(out).not.toContain('var r []any = this.FilterEventsByStatus(');
        expect(out).toContain('r = nil');
    });
});

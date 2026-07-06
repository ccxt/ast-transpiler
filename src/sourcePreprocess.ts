// Optional source-level preprocessing applied before the TypeScript AST is built.
//
// These transforms exist because some perfectly valid TypeScript constructs cannot be
// represented by the AST transpilers, and callers (e.g. ccxt) currently have to write
// temporary "fixed up" copies of their sources before invoking the transpiler.
// Doing the same transforms here, on the in-memory source text, removes the need for
// those temp files.
//
// Both transforms are pure content -> content functions and are disabled by default.

// -------------------------------------------------------------------------------------
// 1) stripOverloadSignatures
//
// TypeScript method overload signatures (body-less declarations ending with ';') are
// used to give precise return types, e.g.:
//
//     safeDict (dictionary: any, key: string, defaultValue: Dict): Dict;
//     safeDict (dictionary: any, key: string): Dict | undefined;
//     safeDict (dictionary: any, key: string, defaultValue: Dict = undefined) { ... }
//
// The AST transpilers cannot parse the body-less declarations. They carry no runtime
// code - the implementation signature below them handles every case - so they can be
// removed without changing the transpiled output.
const overloadLineRegex = /^\s*(?:async\s+)?[a-zA-Z0-9_$]+\s*\([^{]*\)\s*:\s*[^{};]+;\s*$/;

function stripOverloadSignatures (content: string): string {
    const filtered = content.split('\n').filter((line) => !overloadLineRegex.test(line)).join('\n');
    return filtered;
}

// -------------------------------------------------------------------------------------
// 2) reAsyncPromiseDelegators
//
// A pure delegator method may be declared WITHOUT `async` (returning the inner Promise
// directly) to avoid the cost of an extra async wrapper + await hop per call in
// JS/Python(async)/PHP(async):
//
//     watchTicker (symbol: string, params = {}): Promise<Ticker> {
//         return this.watchTickers([ symbol ], params);
//     }
//
// The AST transpilers for the static languages (C#/Java/Go) cannot represent a
// non-async method that returns a Promise: C# emits Task-typed methods without
// async/await (CS0029/CS4032/CS1061), Java/Go break override/interface signatures
// entirely. This transform restores the `async`/`return await` form so the generated
// static-language output is byte-identical to the classic async form.
//
// Matches a single-line method signature like:
//     watchTicker (symbol: string, params = {}): Promise<Ticker> {
// (an `async` method cannot match: `async` would be captured as the method name and the
// next character would be a space, not an opening parenthesis)
const nonAsyncPromiseMethodRegex = /^(\s+)([a-zA-Z_$][\w$]*)(\s*\([^)]*\)\s*):\s*(Promise<[^;{]*>)\s*\{\s*$/;

function reAsyncPromiseDelegators (content: string): string {
    const lines = content.split('\n');
    let changed = false;
    let methodIndent: string | undefined = undefined; // inside a re-asynced method when set
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (methodIndent === undefined) {
            const match = line.match(nonAsyncPromiseMethodRegex);
            if (match) {
                const [ , indent, name, args ] = match;
                lines[i] = line.replace(indent + name + args, indent + 'async ' + name + args);
                methodIndent = indent;
                changed = true;
            }
        } else {
            if (line === methodIndent + '}') {
                methodIndent = undefined; // method body ended
            } else {
                // all `return this.x (...)` statements inside such methods return Promises
                // (otherwise the method could not have been declared non-async), so
                // restoring `await` is always type-correct for the static languages
                lines[i] = line.replace(/^(\s*)return this\./, '$1return await this.');
            }
        }
    }
    return changed ? lines.join('\n') : content;
}

// -------------------------------------------------------------------------------------

interface ISourcePreprocessingConfig {
    stripOverloadSignatures?: boolean;
    reAsyncPromiseDelegators?: boolean;
}

function preprocessSource (content: string, config: ISourcePreprocessingConfig | undefined): string {
    if (!config) {
        return content;
    }
    let result = content;
    if (config.stripOverloadSignatures) {
        result = stripOverloadSignatures(result);
    }
    if (config.reAsyncPromiseDelegators) {
        result = reAsyncPromiseDelegators(result);
    }
    return result;
}

export {
    ISourcePreprocessingConfig,
    stripOverloadSignatures,
    reAsyncPromiseDelegators,
    preprocessSource,
};

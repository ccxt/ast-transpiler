// @ts-nocheck
// FM-GO5 GP08 (was ccxt build/hx10w8-GP08.ts). A first result read of a `(T, map[string]any)` Go twin of the
// base-class tuple helpers (handleMarketTypeAndParams, handleOptionStringAndParams, handleOptionBoolAndParams, ...;
// go/v4/exchange_market_type.go) binds natively instead of going through TupleSlice + GetValue:
//   const x = this.handleXAndParams (..)[0]           -> `x, _ := call`
//   const h = this.handleXAndParams (..); const x = h[0]  (h read nowhere else) -> the same binding
// The rule is keyed on the checker: the call must resolve to the BaseExchange declaration (an override, which may
// return something else, keeps the boxed read), and the local's own Go type decides the shape (the result's type, or
// the pointer twin of a bool/int64 result, whose value is bound once and its address taken).
import { ts } from './tsApi.js';
import { ccxtGoTupleResultCall, ccxtGoTupleResultFirst, ccxtGoTupleResultUnwrap } from './go-local-types.js';

// Go type of result 0, per element-0 unwrap of the tuple-result family
const SLOT_TYPE = { 'SafeStringPtr': '*string', 'MapTyped': 'map[string]any', 'GetValueBool': 'bool', 'Int64Value': 'int64' };
// the local type that is the address of that same value
const POINTER_TWIN = { 'bool': '*bool', 'int64': '*int64' };
const OWNER_CLASS = 'BaseExchange';

function baseTupleCall (go: any, node: any) {
    if (!ccxtGoTupleResultCall (node)) { return undefined; }
    try {
        const declaration = go.checkerOrUndefined ()?.getResolvedSignature (node)?.declaration?.resolve ();
        return (declaration?.parent?.name?.text === OWNER_CLASS) ? node : undefined;
    } catch (e) {
        return undefined;
    }
}

function isFirstElement (node: any) {
    return (node?.kind === ts.SyntaxKind.ElementAccessExpression) && (node.argumentExpression?.kind === ts.SyntaxKind.NumericLiteral)
        && (node.argumentExpression.text === '0');
}

// the call whose first result `declaration` reads: directly, or through a const holder read nowhere else
function firstResultSource (go: any, declaration: any) {
    if ((declaration?.kind !== ts.SyntaxKind.VariableDeclaration) || (declaration.name?.kind !== ts.SyntaxKind.Identifier)
        || !isFirstElement (declaration.initializer)) {
        return undefined;
    }
    const base = declaration.initializer.expression;
    const direct = baseTupleCall (go, base);
    if (direct !== undefined) {
        return { 'call': direct, 'held': false };
    }
    const holder = heldHolder (go, base);
    return (holder === undefined) ? undefined : { 'call': baseTupleCall (go, holder.initializer), 'held': true, 'holder': holder };
}

// `base` names a const holder `const h = <base tuple call>` whose only reader is the next statement `x = h[0]`
function heldHolder (go: any, identifier: any) {
    if (identifier?.kind !== ts.SyntaxKind.Identifier) { return undefined; }
    let holder;
    try {
        holder = go.checkerOrUndefined ()?.getSymbolAtLocation (identifier)?.valueDeclaration?.resolve ();
    } catch (e) {
        return undefined;
    }
    const list = holder?.parent;
    const statement = list?.parent;
    if ((holder?.kind !== ts.SyntaxKind.VariableDeclaration) || (holder.name?.kind !== ts.SyntaxKind.Identifier)
        || ((list.flags & ts.NodeFlags.Const) === 0) || (list.declarations.length !== 1)
        || (statement?.kind !== ts.SyntaxKind.FirstStatement) || (baseTupleCall (go, holder.initializer) === undefined)) {
        return undefined;
    }
    const siblings = statement.parent?.statements;
    const reader = siblings?.[siblings.indexOf (statement) + 1];
    if ((siblings === undefined) || (reader?.kind !== ts.SyntaxKind.FirstStatement) || (reader.declarationList.declarations.length !== 1)
        || (reader.declarationList.declarations[0].initializer?.expression?.text !== holder.name.text)) {
        return undefined;
    }
    const scope = go.goEnclosingFunction (holder);
    let reads = 0;
    go.hasNodeWhere (scope, (n: any) => {
        if ((n.kind === ts.SyntaxKind.Identifier) && (n.text === holder.name.text) && (n !== holder.name)) { reads++; }
        return false;
    });
    return (reads === 1) ? holder : undefined;
}

// printed in place of the reader statement a folded holder absorbed; the file print drops its whole line
const ABSORBED = '\u0001FMGO5GP08';

// the statement after a held-pair holder: `const x = h[0]` whose source is that holder
function readerOf (go: any, holderDeclaration: any) {
    const siblings = holderDeclaration.parent?.parent?.parent?.statements;
    return siblings?.[siblings.indexOf (holderDeclaration.parent.parent) + 1]?.declarationList?.declarations?.[0];
}

export function installFmGo5GP08 (goTranspiler: any) {
    const flag = 'fmGo5GP08Installed';
    if ((goTranspiler[flag] === true) || (typeof goTranspiler.printVariableDeclarationList !== 'function')) { return; }
    goTranspiler[flag] = true;
    const upstream = goTranspiler.printVariableDeclarationList;
    goTranspiler.printVariableDeclarationList = function (this: any, node: any, identation: number) {
        const printed = upstream.call (this, node, identation);
        const declaration = node?.declarations?.[0];
        if ((typeof printed !== 'string') || (node.declarations.length !== 1) || (node.parent?.kind !== ts.SyntaxKind.FirstStatement)) {
            return printed;
        }
        // the holder of a pair read once by the statement after it: the reader's binding takes its place
        if ((declaration.name?.kind === ts.SyntaxKind.Identifier) && (baseTupleCall (this, declaration.initializer) !== undefined)) {
            const reader = readerOf (this, declaration);
            const source = (reader === undefined) ? undefined : firstResultSource (this, reader);
            const folded = ((source === undefined) || (source.holder !== declaration)) ? undefined : this.fmGo5GP08Shape (reader, source, identation);
            return (folded === undefined) ? printed : folded;
        }
        const source = firstResultSource (this, declaration);
        if (source === undefined) { return printed; }
        const folded = this.fmGo5GP08Shape (declaration, source, identation);
        if (folded === undefined) { return printed; }
        return source.held ? ABSORBED : folded;
    };
    const printFile = goTranspiler.printSourceFileStatements;
    goTranspiler.printSourceFileStatements = function (this: any, node: any, identation: number) {
        const out = printFile.call (this, node, identation);
        return (typeof out === 'string' && out.includes (ABSORBED)) ? out.split (ABSORBED + '\n').join ('').split (ABSORBED).join ('') : out;
    };
    // the folded statement of `declaration`, or undefined when its Go type is not one the result binds as
    goTranspiler.fmGo5GP08Shape = function (this: any, declaration: any, source: any, identation: number) {
        const slot = SLOT_TYPE[ccxtGoTupleResultFirst (source.call)];
        const bound = ccxtGoTupleResultUnwrap (this.printNode (source.call, 0));
        if ((slot === undefined) || (bound === undefined) || bound.includes ('\n')) { return undefined; }
        const type = this.getGoLocalType (declaration, this.printNode (declaration.initializer, 0));
        const name = this.printNode (declaration.name, 0);
        const iden = this.getIden (identation);
        if ((type === slot) || ((slot === 'map[string]any') && (type === 'any') && !source.held)) {
            // the held form keeps the pointer local's own annotation: later reads are typed from it
            return (source.held && (type.charAt (0) === '*'))
                ? iden + 'var ' + name + ' ' + type + ' = nil\n' + iden + name + ', _ = ' + bound
                : iden + name + ', _ := ' + bound;
        }
        if (POINTER_TWIN[slot] === type) {
            const temporary = name + 'Value';
            let clashes = false;
            this.hasNodeWhere (this.goEnclosingFunction (declaration), (n: any) => {
                clashes = clashes || ((n.kind === ts.SyntaxKind.Identifier) && (n.text === temporary));
                return false;
            });
            return clashes ? undefined : iden + temporary + ', _ := ' + bound + '\n' + iden + name + ' := &' + temporary;
        }
        return undefined;
    };
}

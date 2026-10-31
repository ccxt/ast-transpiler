// @ts-nocheck
// FM-GO5 G01: type-keyed rules folded in from ccxt build/hx10w3-G01.ts (was a post-print text pass).
import { ts } from './tsApi.js';
import { TypeFlags } from 'typescript/unstable/sync';

// ---- ws client subscriptions table (was build/hx10w3-G01.ts) ---------------------------------
// Rule: `Client.subscriptions` (ts/src/base/ws/Client.ts) is a plain map owned by one goroutine
// (go/v4/exchange_client.go), so a generated access hands the operation to the owner. The receiver is
// any expression the checker resolves to that property; the shape of its parent node picks the call:
//   `k in R.subscriptions`            -> R.SubscriptionHas(k)       `delete R.subscriptions[k]` -> R.SubscriptionDel(k)
//   `R.subscriptions[k] = v`          -> R.SubscriptionSet(k, v)    `R.subscriptions[k]`        -> R.SubscriptionGet(k)
//   `Object.keys / values (R.subscriptions)` -> R.SubscriptionKeys() / R.SubscriptionValues()
//   `local = this.safeDict (R.subscriptions, k)` typed dict local -> R.SubscriptionDict(k)
//   any other read of the table       -> R.SubscriptionsSnapshot() (a copy taken on the owner)
// R prints `R.(ClientInterface)` in the ws and prediction trees (the handler frame holds `client any`
// there) and plain `R` in the base class (`client *Client`).
const SUBSCRIPTIONS_CLASS = 'Client';

function clientSubscriptions (go: any, node: any) {
    const SK = ts.SyntaxKind;
    if ((node?.kind !== SK.PropertyAccessExpression) || (node.name?.text !== 'subscriptions')) {
        return undefined;
    }
    const checker = go.checkerOrUndefined ();
    const symbol = checker?.getSymbolAtLocation (node.name);
    if (symbol === undefined) {
        // an `any`-typed receiver (base-class methods take `client: any`) names no declaration: the table of the ws client
        const flags = checker?.getTypeAtLocation (node.expression)?.flags ?? 0;
        return ((flags & TypeFlags.Any) !== 0) ? node : undefined;
    }
    const decl = symbol.valueDeclaration?.resolve ();
    if ((decl?.kind !== SK.PropertyDeclaration) && (decl?.kind !== SK.PropertySignature)) {
        return undefined;
    }
    return (decl.parent?.name?.text === SUBSCRIPTIONS_CLASS) ? node : undefined;
}

// the pro and prediction trees are printed with the ws regexes: the client frame is `any` there
function clientIsInterfaceFrame (node: any) {
    let current = node;
    while (current !== undefined && current.parent !== undefined) {
        current = current.parent;
    }
    const fileName = (current !== undefined && current.fileName !== undefined) ? String (current.fileName) : '';
    return /(^|[\\/])ts[\\/]src[\\/](pro|prediction)[\\/]/.test (fileName);
}

export function installFmGo5G01 (goTranspiler: any) {
    const flag = 'fmGo5G01Installed';
    if (goTranspiler[flag] === true) { return; }
    goTranspiler[flag] = true;
    const SK = ts.SyntaxKind;
    const owner = (go: any, access: any) => {
        const printed = go.printNode (access.expression, 0);
        return clientIsInterfaceFrame (access) ? printed + '.(ClientInterface)' : printed;
    };
    const printAccess = goTranspiler.printPropertyAccessExpression;
    goTranspiler.printPropertyAccessExpression = function (this: any, node: any, identation: number) {
        if (clientSubscriptions (this, node) !== undefined) {
            return owner (this, node) + '.SubscriptionsSnapshot()';
        }
        return printAccess.call (this, node, identation);
    };
    const printElement = goTranspiler.printElementAccessExpression;
    goTranspiler.printElementAccessExpression = function (this: any, node: any, ...rest: any[]) {
        if (this.isGoElementAccessAssignmentTarget (node)) {
            return printElement.call (this, node, ...rest);
        }
        const keys: any[] = [];
        let root = node;
        while (root?.kind === SK.ElementAccessExpression) {
            keys.unshift (root.argumentExpression);
            root = root.expression;
        }
        const table = clientSubscriptions (this, root);
        if (table === undefined) {
            return printElement.call (this, node, ...rest);
        }
        if (keys.length === 1) {
            // a read that initialises an `any` local keeps the base call: the nil-compare pass proves that
            // local pointer-free from the helper name, and a method call there would lose the native compare
            const declaration = node.parent;
            if ((declaration?.kind === SK.VariableDeclaration) && (declaration.initializer === node)
                && (declaration.parent?.parent?.kind === SK.FirstStatement)) {
                const base = printElement.call (this, node, ...rest);
                if (this.getGoLocalType (declaration, base) === 'any') {
                    return base;
                }
            }
        }
        let acc = owner (this, table) + '.SubscriptionGet(' + this.printNode (keys[0], 0) + ')';
        for (let i = 1; i < keys.length; i++) {
            acc = this.ELEMENT_ACCESS_WRAPPER_OPEN + acc + ', ' + this.printNode (keys[i], 0) + this.ELEMENT_ACCESS_WRAPPER_CLOSE;
        }
        return acc;
    };
    const printDelete = goTranspiler.printDeleteExpression;
    goTranspiler.printDeleteExpression = function (this: any, node: any, identation: number) {
        const target = node.expression;
        const table = (target?.kind === SK.ElementAccessExpression) ? clientSubscriptions (this, target.expression) : undefined;
        if (table !== undefined) {
            return owner (this, table) + '.SubscriptionDel(' + this.printNode (target.argumentExpression, 0) + ')';
        }
        return printDelete.call (this, node, identation);
    };
    const printBinary = goTranspiler.printBinaryExpression;
    goTranspiler.printBinaryExpression = function (this: any, node: any, identation: number) {
        const op = node.operatorToken?.kind;
        if (op === SK.InKeyword) {
            const table = clientSubscriptions (this, node.right);
            if (table !== undefined) {
                return owner (this, table) + '.SubscriptionHas(' + this.printNode (node.left, 0) + ')';
            }
        } else if ((op === SK.EqualsToken) && (node.left?.kind === SK.ElementAccessExpression)) {
            const keys: any[] = [];
            let root = node.left;
            while (root?.kind === SK.ElementAccessExpression) {
                keys.unshift (root.argumentExpression);
                root = root.expression;
            }
            const table = clientSubscriptions (this, root);
            if (table !== undefined) {
                const value = this.goWithExprDepth (this.goExprDepth + 1, () => this.printNode (node.right, identation)).trimStart ();
                if (keys.length === 1) {
                    return owner (this, table) + '.SubscriptionSet(' + this.printNode (keys[0], 0) + ', ' + value + ')';
                }
                // a nested write `R.subscriptions[a][b] = v` mutates the entry the owner holds: the entry is read through the owner
                let acc = owner (this, table) + '.SubscriptionGet(' + this.printNode (keys[0], 0) + ')';
                for (let i = 1; i < keys.length - 1; i++) {
                    acc = this.ELEMENT_ACCESS_WRAPPER_OPEN + acc + ', ' + this.printNode (keys[i], 0) + this.ELEMENT_ACCESS_WRAPPER_CLOSE;
                }
                return 'AddElementToObject(' + acc + ', ' + this.printNode (keys[keys.length - 1], 0) + ', ' + value + ')';
            }
        }
        return printBinary.call (this, node, identation);
    };
    const tableCall = (original: any, suffix: string) => function (this: any, node: any, identation: number, parsedArg: any = undefined) {
        const table = clientSubscriptions (this, node.arguments?.[0]);
        if (table !== undefined) {
            return owner (this, table) + '.' + suffix + '()';
        }
        return original.call (this, node, identation, parsedArg);
    };
    goTranspiler.printObjectKeysCall = tableCall (goTranspiler.printObjectKeysCall, 'SubscriptionKeys');
    goTranspiler.printObjectValuesCall = tableCall (goTranspiler.printObjectValuesCall, 'SubscriptionValues');
    // the owner calls are typed: `k in R.subscriptions` is a Go bool, `Object.keys (R.subscriptions)` a []string,
    // `Object.values (R.subscriptions)` a []any
    const initType = goTranspiler.goTypeOfInitializer;
    goTranspiler.goTypeOfInitializer = function (this: any, node: any, printed: string) {
        if ((node?.kind === SK.BinaryExpression) && (node.operatorToken?.kind === SK.InKeyword) && (clientSubscriptions (this, node.right) !== undefined)) {
            return 'bool';
        }
        if ((node?.kind === SK.CallExpression) && (node.arguments?.length === 1) && (clientSubscriptions (this, node.arguments[0]) !== undefined)) {
            const callee = node.expression?.getText?.();
            if (callee === 'Object.keys') { return '[]string'; }
            if (callee === 'Object.values') { return '[]any'; }
        }
        return initType.call (this, node, printed);
    };
    const dictValue = goTranspiler.goSafeDictUnboxValue;
    goTranspiler.goSafeDictUnboxValue = function (this: any, declaration: any, identation: number) {
        const known = dictValue.call (this, declaration, identation);
        // the initializer may carry a type assertion (`this.safeDict (R.subscriptions, k, {}) as Dict`)
        let initializer = declaration.initializer;
        while ((initializer?.kind === SK.AsExpression) || (initializer?.kind === SK.ParenthesizedExpression) || (initializer?.kind === SK.NonNullExpression)) {
            initializer = initializer.expression;
        }
        const args = (known !== undefined) ? this.goSafeDictLocalArgs (initializer) : undefined;
        const table = (args !== undefined) ? clientSubscriptions (this, args.container) : undefined;
        if ((table !== undefined) && known.startsWith ('SafeMapTyped(')) {
            return owner (this, table) + '.SubscriptionDict(' + this.printNode (args.key, 0) + ')';
        }
        return known;
    };
}

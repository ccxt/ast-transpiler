import { Transpiler } from '../src/transpiler';
const t = new Transpiler({ verbose: false });
const src = `class A {
    safeList (o: any, k: any, d: any[] = undefined): any[] | undefined { return o; }
    safeDict (o: any, k: any, d: any = undefined): any { return o; }
    hold (x: any): any { return x; }
    run (events: any[]) {
        for (let i = 0; i < events.length; i++) {
            const currentEvent = this.safeDict (events, i);
            const currentTrades = this.safeList (currentEvent, 'trades');
            if (currentTrades === undefined) {
                continue;
            }
            const tradesLength = currentTrades.length;
            for (let j = 0; j < tradesLength; j++) {
                const item = currentTrades[tradesLength - j - 1];
                this.hold (item);
            }
        }
    }
}`;
console.log((t as any).transpileRust(src).content);

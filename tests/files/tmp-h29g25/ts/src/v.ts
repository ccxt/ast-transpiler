import { Exchange } from './base/Exchange.js';
export default class v extends Exchange {
    two (m: any) {
        const base = this.safeString (m, 'b');
        const quote = this.safeString (m, 'q');
        return {
            'id': base,
            'symbol': base + '/' + quote,
        };
    }
    pushed (m: any) {
        const result = [];
        const base = this.safeString (m, 'b');
        result.push ({ 'symbol': base + '/x' });
        return result;
    }
    anyLeaf (m: any) {
        const base = this.safeString (m, 'b');
        const raw = this.safeValue (m, 'r');
        return { 'symbol': base + '/' + raw };
    }
    callLeaf (m: any) {
        const base = this.safeString (m, 'b');
        return { 'symbol': base + '/' + this.safeString (m, 'q') };
    }
}

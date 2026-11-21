import { Exchange, Dict } from './base/Exchange';
export default class ex extends Exchange {
    async watchOHLCVForSymbols (symbolsAndTimeframes: string[][], params: Dict = {}): Promise<any> {
        const out = [];
        for (let i = 0; i < 5; i++) {
            const data = this.safeList (symbolsAndTimeframes, i);
            out.push (this.safeString (data, 0));
        }
        return out;
    }
}

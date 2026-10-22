import Exchange from './base/Exchange';
import type { Dict } from './base/Exchange';
export default class venue extends Exchange {
    fetchA (params: Dict = {}) {
        const [ stock, paramsStock ] = this.handleOptionBoolAndParams (params, 'fetchA', 'stock', false);
        if (stock) {
            paramsStock['stock'] = true;
        }
        return paramsStock;
    }
    fetchB (market: Dict, params: Dict = {}) {
        let paramsType = undefined;
        let type = undefined;
        [ type, paramsType ] = this.handleMarketTypeAndParams ('fetchB', market, params);
        paramsType['kind'] = type;
        return paramsType['other'];
    }
    fetchC (loose: any) {
        const [ ok, paramsLoose ] = this.handleOptionBoolAndParams (this.options['x'], 'fetchC', 'y', false);
        paramsLoose['z'] = ok;
        return paramsLoose;
    }
    fetchD (params: Dict = {}) {
        const [ ok, paramsOther ] = this.handleOther (params);
        paramsOther['w'] = ok;
        return paramsOther;
    }
}

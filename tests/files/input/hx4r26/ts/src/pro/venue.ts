import Exchange from '../base/Exchange';
import type { Dict } from '../base/Exchange';
export default class venue extends Exchange {
    watchA (params: Dict = {}) {
        const [ stock, paramsStock ] = this.handleOptionBoolAndParams (params, 'watchA', 'stock', false);
        paramsStock['stock'] = stock;
        return paramsStock;
    }
    watchB () {
        const request: Dict = {};
        const [ stock, paramsLocal ] = this.handleOptionBoolAndParams (request, 'watchB', 'stock', false);
        paramsLocal['stock'] = stock;
        return paramsLocal;
    }
}

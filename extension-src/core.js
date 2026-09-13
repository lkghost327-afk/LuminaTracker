import markets from '../shared/markets.cjs';
import deals from '../shared/deals.cjs';
import comparison from '../shared/comparison.cjs';
export const { marketFor, countryCode, localeCountry, countries } = markets;
export const { normalizeProduct, rankProducts, safeUrl } = deals;
export const { compareOffers } = comparison;

import { BRAND, ON_BRAND } from '../shared/brand';

/** Gives a page the brand as the kit's names, which `kit.css` uses but does not write: called once, as each page starts. */
export const applyBrand = (doc: Document): void => {
	doc.documentElement.style.setProperty('--dsnr-brand', BRAND);
	doc.documentElement.style.setProperty('--dsnr-on-brand', ON_BRAND);
};

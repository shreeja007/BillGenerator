# Original service-bill logos

Retrieved on **26 October 2026** from the manufacturers' or distributors' own websites. Files are kept as downloaded, without tracing, recolouring, or regenerating the marks. The selected originals are embedded into the local `service-brands.js` bundle so the invoice does not fetch images from third-party sites at viewing, printing, or PDF-export time.

| Brand | Official website | Downloaded logo |
| --- | --- | --- |
| Yamaha | [Yamaha Motor](https://global.yamaha-motor.com/) | [Header identity PNG](https://global.yamaha-motor.com/shared/img/rwd_identity.png) |
| Honda | [Honda Nepal](https://honda.com.np/) | [Header logo PNG](https://honda.com.np/wp-content/themes/honda/assets/img/global_top_logo.png) |
| Bajaj | [Bajaj Auto](https://www.bajajauto.com/) | [Logo SVG](https://cdn.bajajauto.com/rev-images/bajaj-logo.svg) |
| TVS | [TVS Nepal](https://www.tvsmotor.com/en/np) | [Logo PNG](https://www.tvsmotor.com/np/-/media/Feature/IB/TVS-Logo/tvs-logo.png) |
| Suzuki | [Suzuki Motorcycle India](https://www.suzukimotorcycle.co.in/) | [Website logo](https://s3.ap-south-1.amazonaws.com/suzuki-website-s3/public-live/images/website/logo.jpg) |
| Royal Enfield | [Royal Enfield Nepal](https://www.royalenfield.com/np/en/home/) | [Logo SVG](https://www.royalenfield.com/content/dam/royal-enfield/india/logos/logo.svg) |
| Hero | [Hero Nepal](https://www.heromotocorp.com/en-np) | [Logo SVG](https://www.heromotocorp.com/content/dam/hero-aem-website/in/design-bd/brand/hero-logo.svg) |
| KTM | [KTM](https://www.ktm.com/en-us.html) | [Logo JPG](https://www.ktm.com/content/dam/websites/ktm-com/language-masters/en/logo/37860_KTM_LogoPodium_orange_RGB.jpg) |
| MAW Group (optional dealer logo) | [MAW Group](https://mawnepal.com/) | [Logo SVG](https://mawnepal.com/wp-content/themes/maw/assets/logo-black-text.svg) |

The Suzuki source URL ends in `.jpg`, but its actual bytes are PNG; the local file and embedded MIME type therefore use PNG. Its image bytes remain unchanged.

These marks belong to their respective brand owners. Selecting a vehicle brand changes the logo; company, VAT, and other invoice details are supplied separately. MAW is an independent optional dealer choice, rather than a universal partner for every manufacturer. The current assets may differ from older logos shown on the supplied sample bills.

## Updating or adding brands

1. Download the original image from the brand's official site and retain it in this directory.
2. Add its ID, name, filename, MIME type, website, and source URL to `manifest.json`.
3. Run `npm run build:brands`, then `npm test` from the project root.

The generated bundle records SHA-256 hashes. Tests verify exact source bytes, PNG/JPEG file signatures, self-contained SVG content, safe catalog IDs, selection on every invoice page, draft/profile persistence, and embedded PDF snapshots. They do not verify actual PDF rasterization or browser screenshots.

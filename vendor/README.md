# Vendored calendar library

`nepali-date-converter-3.4.0.umd.js` is the browser UMD build from the MIT-licensed [`nepali-date-converter` 3.4.0](https://github.com/subeshb1/Nepali-Date) npm package. The upstream license is included as `nepali-date-converter.LICENSE`. The library is stored locally so invoice date conversion works offline, including when opening `index.html` directly.

Package integrity: `sha512-hBojNXCQN69I533CnxNubl72uNx2Zcow9t2bOML3CxXv227s7NKA2kStUGO5xysg0SwsubTTxAO6tcg9IhS61w==`.

Calendar table: BS 2000/01/01–2090/12/30, corresponding to AD 1943-04-14–2034-04-13. `invoice-dates.js` validates dates before converting and rejects the library's automatic day/month rollover behavior for invoice input. Preserve the license and rerun the date tests when updating this file.

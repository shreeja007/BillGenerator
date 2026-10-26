# Billbook — petrol and service bills

Open `index.html` in a modern browser. The Petrol and Service tabs now share one workspace, so switching bill types keeps both drafts intact. The old `service.html` link redirects to `index.html?bill=service`.

No server, build, account, or npm install is needed to use the app. Date conversion, calculations, profiles, and drafts work locally. Google Fonts and the first direct PDF download need internet access; browser Print / Save as PDF remains available with local font fallbacks.

## Auto mode

Auto mode is the default entry screen and skips the initial setup wizard. Enter the customer/company name and Nepali date, plus the correct pump price or service products and their prices. Today is the starting date on a fresh workspace. Saved provider, vehicle and logo details fill the rest; **Full editor** remains available for adjustments.

- **Randomized sample:** generates a `SAMPLE-…` reference and randomizes only unspecified quantities. Supplied names, dates, prices, descriptions and quantities remain unchanged. Every page has a **SAMPLE · NOT ISSUED** notice, a sample heading, and a watermark. These markings stay attached through manual edits, draft restoration, print, and PDF export. No PAN, VAT number, chassis identifier, signature or official issuer reference is randomly invented.
- **Actual transaction:** requires the original invoice reference and actual quantity or paid amount. No values are randomized. Generated sample references are rejected. Customer tax/contact details are cleared when the entered customer name differs from the current profile, and visit-specific mileage/narration are not copied into a new record. Other transaction fields can be completed in Full editor.

Use **Preview**, **Generate PDF**, or **Generate & print** directly from the form. Optional discounts are available without opening the full editor. Service rows can be added/removed inline. A successfully entered fuel price is remembered for next time; example pump prices are not silently treated as current market prices. Use the New bill/Undo controls as before.

Actual-transaction mode formats the information entered by the user. It does not independently verify a transaction or turn a sample into an officially issued merchant invoice.

## First-time setup

Open **Saved details** or start in **Full editor** to use the three-step setup for recurring details:

1. **Customers:** company details for petrol bills; separate personal details for service bills.
2. **Vehicles:** the usual petrol vehicle and the service vehicle's registration, chassis, model, and version.
3. **Defaults:** the Nepali billing date, petrol template, print layout, paper, prepared-by name, and optional station/service-centre details.

The supplied examples prefill the setup for review. Fields are optional and can be changed later through **Saved details**. **Set up later** keeps blank customer/vehicle details. Full editor asks again on a subsequent visit until setup is saved; Auto mode remains available without completing it.

Profiles are stored in this browser. They are separate from drafts: changing a customer on one bill does not silently replace saved defaults. When editing settings, select **Apply these details to the current bills too** if wanted; otherwise the changes apply to new bills. **Copy details from current bills** brings current customer, vehicle, and provider information into settings for review before saving.

**Forget saved details & drafts** clears only Billbook's data after confirmation. It does not clear unrelated browser storage. If the browser refuses storage, the save status explains that changes will last only while the tab remains open.

## Daily use

Choose Petrol or Service, enter an invoice number, add the amount or items, and use **Print** or **Download PDF**. Recurring customer, vehicle, provider, and printing fields sit in expandable sections. Mileage, service order type, and narration remain available for each service visit.

**New bill** keeps saved profiles and print defaults, clears transaction details, and uses the working date. An **Undo** action restores the preceding draft during the same visit. The app retains one current draft per bill type; it is not an invoice archive. Export a completed bill before moving on.

Both drafts autosave after edits, when switching tabs, and when the page is hidden or closed. They recover after reload, including incomplete numeric/date entries. Stored data has a version and bounded validation; damaged or unavailable storage does not prevent using the editor.

## Nepali date first

The main date control opens a BS calendar with Nepali month names and digits. Today in **Asia/Kathmandu** is the initial default and is marked in the grid. Select a date or type `YYYY/MM/DD` using English or Nepali digits. The corresponding AD date is shown automatically.

A date selected from the main calendar applies to the active bill and becomes the starting date for subsequent new bills in that tab session. Other existing drafts retain their own dates. A new browser session starts its working-date default at today; resuming an existing draft preserves its invoice date.

AD and BS fields remain available in the expanded date section for individual adjustments. Conversion runs locally for BS 2000/01/01–2090/12/30, corresponding to AD 1943-04-14–2034-04-13. Invalid dates disable export until corrected. Generated/printed timestamps remain separately editable.

## Petrol bills

Both Himal Enterprises and Banglamukhi Oil Store layouts are retained. Enter the pump rate and quantity or a target total. Discounts apply before the existing 13% VAT calculation. Amount mode keeps the target total while changing fuel or rate. Quantity retains full precision internally; printed quantities and rates follow the selected template's precision.

Direct receipt edits synchronize both copies. Calculated values and words update automatically. Switching templates preserves the current buyer, invoice number, and date while changing station details. **Load reference example** explicitly restores that template's example metadata; saved profiles remain unchanged.

Choose two copies on A4 landscape or a single copy on A4 portrait, with pink/white paper and optional copy labels.

## Service bills

The service invoice follows the supplied MAW/Yamaha samples: company/VAT details, customer and vehicle fields, parts and labour, percentage discounts, 13% VAT, narration, signature areas, page numbers, and a printed timestamp.

**Vehicle brand / invoice logo** in Bill details selects an original Yamaha, Honda, Bajaj, TVS, Suzuki, Royal Enfield, Hero, or KTM logo, or no logo. Every generated page uses the selected image. **Dealer / service-centre logo** independently offers MAW Group or none. Selecting a different vehicle brand clears the sample's MAW logo; it can then be explicitly selected if needed. Brand changes leave company/VAT fields and calculations intact.

The logo selection autosaves with the current draft. **Save these logos as my default** remembers it for new service bills; defaults are also editable during setup. Older saved profiles continue to use Yamaha/MAW until changed. Original image bytes are embedded locally to work offline and avoid cross-origin image issues during PDF export. Source links, the downloaded originals, and update instructions are in [assets/brands/SOURCES.md](assets/brands/SOURCES.md).

Add and remove items or edit them directly in the preview. Unit prices exclude VAT. Each gross line and discount rounds to paisa; discounted lines are summed before VAT. Invalid or incomplete items disable export and clear displayed totals until corrected.

The reference examples reproduce NPR **1,130.00** for Mobil and NPR **4,489.68** for the six-item service bill. They are available in **Reference examples**, separate from the normal saved-profile workflow. Check identifiers against the original before issuing a bill.

Service output uses A4 portrait, with up to ten items per generated page, repeated customer/vehicle details and page numbering, and totals on the last page. The checkbox in date/printing settings controls whether BS appears beside AD.

## Preview and export

The workspace uses a warm, light editor with a separate paper preview. Preview zoom offers Fit, 50%, 65%, 80%, and 100%. On small screens, **Edit bill / Preview** switches between the two. Preview transforms live outside the invoice and are removed for native printing; export snapshots contain only invoice paper.

The shared PDF loader pins html2pdf.js 0.14.0 with SHA-384 verification, loads on demand, and allows retries after failure. If it cannot load or render, use **Print** and choose **Save as PDF**.

## Development and verification

### Deploy to Vercel

Import the GitHub repository `shreeja007/BillGenerator` at [Vercel New Project](https://vercel.com/new). Use the repository root (`./`) and the `master` branch. The tracked `vercel.json` selects **Other**, skips dependency installation/build commands, and serves the existing files from the repository root. No environment variables or backend are required.

Click **Deploy** after importing. Subsequent pushes to the connected production branch redeploy the site. To deploy manually through the CLI instead, run `npx vercel` from this directory and use `npx vercel --prod` when ready for the production deployment. The `.vercel/` project-link directory is ignored by Git.

Profiles and drafts belong to the browser origin: the Vercel URL starts with separate local data from an existing `file://` or localhost session.

### Local checks

With Node.js 24 or newer:

```sh
npm ci
npm test
```

Tests cover fuel and service calculations, both supplied service totals, direct editing, validation, date conversion across the supported range and different timezones, calendar month lengths, first-time setup, provider/customer profiles, draft persistence/recovery, no-reload tab switching, new-bill/Undo, storage failures, original-logo assets/selection/persistence, Auto mode, random-sample identification, actual-data validation, and PDF options/failure handling. Workspace tests run the actual combined HTML and all application scripts.

Browser-based visual verification is currently unavailable because the browser tool fails to connect. Tests use jsdom and a controlled PDF-library stub; they do not verify canvas rendering, actual downloaded PDFs, physical page fit, fonts, or responsive screenshots. Those visual checks remain pending for both bill types and all print layouts.

Library references: [Nepali-Date](https://github.com/subeshb1/Nepali-Date) (local build and license in `vendor/`), [html2pdf.js](https://github.com/eKoopmans/html2pdf.js), [jsdom](https://github.com/jsdom/jsdom).

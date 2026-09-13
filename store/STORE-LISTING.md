# Microsoft Edge Add-ons listing draft

Target: Microsoft Edge Add-ons. Chrome Web Store publication is not planned. Prepare after the hosted service is configured and live-tested; no submission has been made. See EDGE-SUBMISSION.md for the release status.

**Name:** LuminaTracker — Compare Shopping Offers

**Short description:** Find regional shopping offers while you browse. Standalone price comparisons with no desktop app required.

**Single purpose:** Compare a product or shopping search with offers from other stores in the user's selected country.

**Description:**

LuminaTracker helps you compare shopping offers from your browser. Open a supported product page, select the extension, and compare offers from stores in your region. You can also search for a precise product model.

Choose your shopping country and see prices in its native currency. Optionally allow automatic comparisons on supported shopping sites to see a dismissible panel of other-store offers. The desktop LuminaTracker app is not required.

Savings labels appear only when product identity, condition, currency and known delivery totals can be compared. Missing delivery charges and source failures are shown clearly. Retailer availability varies. Prices are observations; verify the model, variant and final checkout price at the store.

An internet connection and the publisher's online deal service are required. No user API key or desktop pairing is needed.

## Permission explanations

- `activeTab`: read the current supported shopping page when the user opens the extension.
- `scripting`: inject locally bundled page extraction and offer-panel code into a supported shopping page after a user action or optional site permission.
- `storage`: keep the user's consent, country and automatic-comparison preferences on the device. No browsing-history database is created.
- API host permission: send only product queries and country to the deployed deal service over HTTPS.
- Optional retailer host permissions: show automatic comparisons only on stores the user has permitted. Automatic mode starts disabled.
- Optional `ipapi.co` permission: estimate country from the user's IP only when the user enables that option. Device region/manual selection are available without it.

All executable code is bundled. The remote server provides JSON data, not code or instructions to execute. There is no remote JavaScript, eval, affiliate-link injection, general history permission, cookie permission or checkout-form access.

## Data disclosures to complete in the dashboard

Declare current shopping-page/product content and browsing activity handled by the extension, including local processing, product queries transmitted to the service and upstream sources, and country/IP information. Do not claim that no user data is handled merely because page URLs stay local. The IP geolocation provider sees an IP only when that feature is enabled; the API host naturally sees incoming connection metadata.

The intended uses are the single-purpose comparison feature and service abuse prevention. Data is not sold or used for unrelated advertising/profiling. Review the generated privacy page against your actual host, shopping provider, logs and retention settings before submitting.

**Privacy URL:** your deployed service's `/privacy` page, with actual publisher and contact details.

**Support:** your actual support email or HTTPS support page and a working public support URL if required by the store. No invented addresses should be submitted.

## Reviewer instructions

1. Install the production package. No desktop app or account is required for users.
2. Open the toolbar popup and select Enable comparisons after reading the disclosure.
3. Select a supported country and enter a precise model query. Confirm results, native currency, source status and outbound retailer links.
4. Open a supported retailer product page and compare it. Current page URL and price stay local; only the query/country are transmitted.
5. Optionally enable automatic shopping-site comparisons, approve site access and reload a shopping page. A panel appears when another-store offer is retrieved.
6. Disable comparisons or reset preferences. Further automatic comparisons stop.

Supply a current query verified against your deployed provider and its region. Keep the service quota available for reviewers. No credentials should be needed in a normal public release.

## Assets still needed

The package includes the existing 128×128 icon. Capture real screenshots from the deployed extension and prepare the store's requested promotional images. Follow the current dashboard requirements for image dimensions and formats. Test screenshots under `tmp/` contain explicit fixtures and are not production evidence.

[Edge publishing and listing requirements](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

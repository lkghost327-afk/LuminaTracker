# Microsoft Edge Add-ons submission

The chosen publishing target is Microsoft Edge Add-ons. Chrome Web Store publication is not part of this release. Microsoft currently charges no registration fee for its Edge extension program; backend hosting and shopping-data usage are separate services.

## Current state

- Manifest V3 standalone extension implemented; no desktop app or pairing required.
- Automated tests and an actual Edge extension test pass.
- Listing text and permission/data disclosures: `STORE-LISTING.md`.
- ZIP generation and deployment files are available.
- Public API hosting, working production price coverage, actual publisher/contact information and public privacy URL remain unconfigured.
- GitHub source repository is public: https://github.com/lkghost327-afk/LuminaTracker
- Microsoft Partner Center enrollment is complete; the Individual developer account shows Authorized (checked 2026-09-13).
- Edge draft created: `4484bbc2-184b-4249-81ef-f782c5cc6c0c`. Package upload remains incomplete: Partner Center returned a generic upload error with both generated and standard ZIP archives.
- Draft dashboard: https://partner.microsoft.com/en-us/dashboard/microsoftedge/4484bbc2-184b-4249-81ef-f782c5cc6c0c/packages
- No package has been submitted for certification.

The preview ZIP intentionally shows Service setup pending. It must not be submitted as a working public extension. Draft preparation can continue before certification.

## Partner Center fields

| Field | Prepared value / required action |
| --- | --- |
| Extension name | LuminaTracker — Compare Shopping Offers |
| Category | Select the closest shopping category available in the dashboard. |
| Description | Use the reviewed description in `STORE-LISTING.md`. |
| Single purpose | Compare a product or shopping search with offers from other stores in the user's selected country. |
| Permissions | Use the individual explanations in `STORE-LISTING.md`; the API host comes from the final production manifest. |
| Remote code | No. Executable code is bundled; the service returns JSON price data. |
| Data usage | Disclose shopping-page content/activity, product queries and country/IP handling, including local processing. |
| Privacy URL | The deployed HTTPS API's `/privacy` page with actual publisher/contact details. |
| Support | Publisher-approved support email or support page. |
| Screenshots | Capture the real configured extension. Do not submit test-fixture prices as production results. |
| Markets | Start with countries whose live sources have actually been validated. |
| Reviewer notes | Use the test steps in `STORE-LISTING.md` with a query verified against the live provider. |

## Submission sequence

1. Sign in to Microsoft Partner Center with the publisher's Microsoft account and enroll in the Edge program if needed. The account owner supplies identity/contact information and reviews the developer agreement.
2. Deploy the API from the GitHub repository using `render.yaml` or `server/Dockerfile`. See `DEPLOYMENT.md`. No paid service should be purchased without a chosen budget.
3. Build a configured ZIP and create a draft Edge extension. Add its assigned extension ID to `ALLOWED_EXTENSION_IDS` on the API. Replace any temporary development IDs before release.
4. Set actual `PUBLISHER_NAME`, `SUPPORT_EMAIL`, and `LUMINA_API_URL`; run `npm run extension:store`. The build checks the live health and privacy endpoints.
5. Upload the final ZIP, complete the fields above, verify the live user flow, and submit for certification when the service and listing are ready.

Official references: [free Edge registration](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/create-dev-account), [publish an Edge extension](https://learn.microsoft.com/en-us/microsoft-edge/extensions/publish/publish-extension).

## Upload troubleshooting (2026-09-13)

Partner Center returned 'Something went wrong. Please try again.' during package uploads. The latest correlation ID is c254417f-0d31-4044-9f23-4a5f40537d55. No package validation report was returned. A standard Windows ZIP containing the same explicit runtime files also failed; this does not establish a package-format defect. Preserve the existing draft and retry the final configured package after the portal issue is resolved.

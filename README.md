# IVAC native Edge POM automation

The local `videoplayback.webm` has now been visually reviewed. The POM follows
its login, OTP, applicant webfile, mission/center, calendar, and payment screens.
See [the timestamped review](docs/video-review.md). **Live DOM selectors remain
unverified:** public network access was blocked and the closed portal's markup
could not be inspected. Visible labels are supported by the video; attributes
and selectors in `config/portal.json` are candidates requiring live verification.
No live login, upload, or booking was tested.

## Credentials and files

Edit `.env` locally:

```dotenv
IVAC_USERNAME=your_username
IVAC_PASSWORD="your_password"
OTP_MODE=manual
PRIMARY_WEBFILE=primary.pdf
ADDITIONAL_WEBFILES=
IVAC_MISSION=your exact mission option
IVAC_CENTER=your exact IVAC center option
```

Quote values containing `#` or spaces. `.env` and uploaded documents are ignored
by Git. Put applicant **webfile PDFs** in `uploads/`; the video does not request
separate photo/passport uploads on this screen. Each PDF must be at most 500,000
bytes. `PRIMARY_WEBFILE` is the primary applicant's filename, matching the account's
sign-up details. Additional applicants' filenames go in `ADDITIONAL_WEBFILES`,
separated by semicolons. Leave it blank for one applicant. The primary upload is
irreversible according to the video; choose the correct PDF before running.
The code validates PDF headers, sizes, and folder boundaries before uploading.

## Page Object Model

```text
src/pages/LoginPage.ts        credentials, OTP, authenticated state
src/pages/ApplicationPage.ts  applicant fields and mapped uploads
src/pages/WebfilesPage.ts     primary/additional webfile PDFs and applicant count
src/pages/MissionPage.ts      configured mission and IVAC center
src/pages/AppointmentFlow.ts  detects and skips pages already completed by the portal
src/pages/MessagesPage.ts     exact sender and fresh incoming OTPs
src/pages/SlotsPage.ts        available dates and payment handoff
src/support/                 notices, manual entry, OTP parsing
config/portal.json           selectors and application step mapping
tests/booking/ivac.spec.ts    live flow, one worker, no retries
tests/offline/flow.spec.ts    local sample pages; no portal requests
scripts/start-edge.cjs       independent native Edge launcher
```

## Finish mapping the live pages

Set actual login selectors, the authenticated-page marker, date/time selectors,
the button that proceeds to payment, an explicit slot-unavailability error,
and a marker visible **only after reaching payment**. Keep payment submission
buttons out of the application steps.

The default slot mode is the **calendar shown in the video**. The POM picks the
earliest enabled date identified by a full `data-day` or accessible date label,
skipping disabled/outside days. It does not infer availability from pixel colors.
Verify `calendarDayButtons` against the real markup. The default searches the
displayed month only; configure `nextMonth` and `maxMonths` for month navigation.
Native `<select>` mode remains supported. `timeSelect` stays empty because the
video says appointment time is assigned on the payment invoice. Only an explicit
unavailability response triggers the next date; unknown outcomes stop the flow.
The failure-message selectors are inferred because the video shows no failed
slot attempt. Verify those against actual portal error messages.

`webfiles` and `mission` configure the observed application flow. The flow
detects which page appears after login: upload, mission/center, dates, or
payment. Existing applicants redirected straight to mission or appointment dates
skip uploads automatically. PDF filenames and local files are required only if
the upload page actually appears; mission/center values are required only on
that page. No already-completed upload is repeated during a redirect.

The generic
`applicationSteps` mechanism remains available for extra forms, if the live site
adds them; `config/application.example.json` is an illustrative shape only.
Personal application data can stay in ignored `config/portal.local.json`; set
`PORTAL_CONFIG=config/portal.local.json` in `.env`. Mission/center values are
never copied from the video's applicant; set your own exact option labels.

`dismissButtons` targets known notice Close/Dismiss controls. Unexpected forms,
browser alerts, and CAPTCHAs require manual handling.

## Run with native Edge

From PowerShell, after mapping the live pages:

```powershell
npm.cmd run edge:start
npm.cmd run book
```

Close Edge yourself before `edge:start` if needed so the debugging flag can
take effect. The launcher never kills Edge processes. Set the correct
`EDGE_PROFILE_DIRECTORY` in `.env` (`Default`, `Profile 1`, etc.); find its name
at the end of **Profile path** in `edge://version`. The selected profile keeps
its own cookies and saved sessions.

Controlling an open browser requires a local DevTools connection.
[Microsoft documents the Edge remote debugging procedure](https://learn.microsoft.com/en-us/microsoft-edge/devtools/protocol/).
Some versions or policies may block debugging on the everyday profile. If the
launcher reports an unavailable connection, check `edge://inspect` and Edge
policy. A plain native launch cannot provide Playwright control. No profile
cloning or cookie extraction is performed. A separate automation profile would
require signing in and pairing again.

The linked Google Messages conversation opens in a separate tab in both modes.
With `OTP_MODE=manual` (default), no SMS content is read. Type the six-digit
code into the IVAC OTP boxes in Edge; automation supports six boxes or one field
and clicks Verify.
`OTP_TIMEOUT_MS` controls the wait (five minutes by default).

With `OTP_MODE=sms`, first inspect and configure Google Messages header,
incoming row, body, stable ID, and received timestamp selectors. The header must
show `01708-404440` or its +880 equivalent. Only incoming rows in that conversation
are read. IDs seen before the login request and messages older than the request
are excluded. The newest matching IVAC OTP is selected by timestamp. Timestamps
must be ISO dates or epoch milliseconds. `Eight-Two-Eight-Five-Four-One` becomes
`828541`. Missing identity/timestamp evidence stops SMS reading. Google Messages
must already be paired in that profile. Its current markup has not been verified.

At **Continue Payment**, the test ends without pressing that button or closing Edge.
Finish payment manually. Edge also stays open on failure. Avoid running multiple
booking instances on the same profile.

## Verification

```powershell
npm.cmd run test:offline
```

Sixteen tests run against local sample pages in installed Edge without visiting
IVAC or Google Messages. They cover credentials, single/six-box OTP, sender checks,
fresh-message filtering, OTP parsing, notices, uploads, PDF validation, mission
selection, calendar/date fallback, unknown outcomes, skipping completed pages,
and stopping before payment.

The original navigation-only launcher remains available:

```powershell
npm.cmd run test:edge
```

It opens native Edge at sign-in and verifies process launch only.

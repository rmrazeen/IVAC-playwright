# Local walkthrough review

Source: `videoplayback.webm`, 8 minutes 28 seconds, 1920 × 1080.
Visual frames were extracted and inspected locally. No personal details from
the video's applicant were copied into the booking configuration.

| Video time | Screen and behavior |
| --- | --- |
| About 1:01 | Important Notice modal with a close icon. |
| 1:55 | `/signin`: mobile number, password, Cloudflare check, **Sign In Now**. |
| 2:25 | `/verify-login-phone-otp`: six digit boxes, **Verify OTP**, resend countdown. |
| 2:55 | `/appointment/file-upload`: **Upload Primary Applicant's Webfile**. PDF only, maximum 500 KB. Primary webfile must match sign-up information and cannot be deleted/reuploaded once selected. |
| 3:15 | Applicant count becomes 1; **Upload Other Applicant's Webfile** appears. **Confirm All Information is Correct** proceeds. |
| 3:35 | `/appointment/mission`: choose mission and IVAC center; **Confirm Mission & IVAC Center**. Page says the choice cannot change after submission. |
| 3:50–4:25 | `/appointment/time-slot`: calendar with disabled/unavailable days and outlined selectable days. Selected date becomes orange. **Continue Booking** reserves the slot. Page says appointment time is provided in the payment invoice. |
| About 5:05 | Payment page: **Total Amount**, **Pay With DGePay**, countdown, **Continue Payment**, and a do-not-refresh notice. This is the requested automation stopping point. |
| After 5:40 | External payment and wallet screens; intentionally excluded from automation. |

The video splices recordings: September 2026 changes to August 2026 around 4:43.
It does not demonstrate a failed date followed by a retry. Date failure text and
retry navigation therefore still need live evidence. DOM IDs, accessibility
labels, calendar attributes, and Google Messages markup cannot be established
from pixels alone. Selectors inferred from visible labels remain unverified.

The POM now supports six OTP inputs, primary/additional PDF webfiles, mission
and center selection, and enabled calendar day buttons with full date metadata.
It never presses **Continue Payment**. Cloudflare checks remain manual.

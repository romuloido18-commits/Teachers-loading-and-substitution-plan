# Teacher Load Manager

A lightweight, browser-based school personnel and teaching-load tracker. Add teacher profiles, record learning areas and class assignments with configurable groups, periods 1–7, weekdays, and weekly minutes. Turn on automatic recording in the sidebar's **Groups & periods** settings to create one assignment for every configured group in each period; leave **Period and time** unselected to create all assignments, or choose an option to create a single assignment. Selected weekdays and weekly minutes apply to each generated assignment, and configured group-and-period times fill schedules automatically. The **Period and time** dropdown lists the configured schedules for every group and period; choosing an option synchronizes the group and period fields. Configure separate start and end times for every group and period in **Groups & periods**. Review workload totals, print the overview, or export the assignment list as CSV.

Teaching loads are automatically ordered by teacher, earliest selected weekday, and scheduled start time.

Admins can edit or delete assignments from the **Assignment directory**. Teachers can edit or delete loads only from their own profile. The directory and **Preview teacher loads** list show labeled **Edit** and **Delete** buttons for loads the signed-in account can manage.

Use **Substitution plans** in the sidebar to apply for leave or manage staff coverage. Teachers can submit a leave application with a start and end date; the admin can approve or reject it. Approval marks the teacher **On leave**, after which the teacher can submit a coverage proposal. Teachers can edit or delete their own pending coverage proposals until the admin reviews them. The admin reviews those proposals separately. The admin should update the teacher's status when the leave period is over. Admins can also create substitution plans directly. Filter assignments by the configured group (such as Morning shift or Afternoon shift) and Period 1–7; with **All periods** selected, the available-substitute list includes teachers free for at least one matching load, and selecting a specific period or load narrows it to that time. Displayed times follow the current Groups & periods settings; loads that conflict with the substitute's existing teaching or overlapping substitution-plan schedule are unavailable. Use **Print preview** on a saved plan's row to inspect its details, then select **Print this plan** to open the browser print preview. Edit or delete a saved plan from its row as well. **Print plan** prints a draft before saving. Saved plans are stored in the shared school database when the Supabase setup below is complete.

The interface uses Arial Narrow at 16px throughout.

Open **Settings** to configure school branding, including the school name, address, School ID, logo, and principal's name and designation. The logo must be a PNG, JPG, WebP, or GIF image no larger than 1 MB. Branding is stored with the school's shared records and appears in the app and printed reports.

## Sign in

Teachers can create an account with an email address and password. Their profile is added to the shared records automatically when Supabase Auth creates the account. Teachers can add, edit, or delete loads only for their own profile, apply for leave, and submit a substitution proposal after the admin approves their leave application. Leave applications and coverage proposals remain pending until the admin reviews them. The admin retains final control of schoolwide records. The application does not record sign-in history.

Admins can use **Teachers Account → Add user account** to create an individual teacher login. Enter the teacher's name, email, username, and a temporary password of at least 12 characters. The teacher must replace that password at first sign-in before accessing school records. Give the temporary password to the teacher through a private channel; the system does not email it. This process creates confirmed teacher accounts directly, so it does not use Supabase's limited confirmation-email sender. Never create shared accounts or grant teacher accounts the admin role.

## Supabase setup and publishing

The shared-account version is published at [Teacher Load Manager](https://romuloido18-commits.github.io/Teachers-loading-and-substitution-plan/). It uses the Supabase project configured in `app.js`; the SQL in `supabase-schema.sql` has been installed, and the Supabase Auth site URL and redirect allowlist are configured for this GitHub Pages address.

To start using the shared system:

1. Apply the latest `supabase-schema.sql` in the Supabase SQL Editor. It includes the profile flag and database trigger that enforce first-login password changes.
2. Deploy `supabase/functions/admin-create-teacher` as the `admin-create-teacher` Edge Function and enable JWT verification. Its CORS allowlist is restricted to the GitHub Pages origin. The function verifies the caller's signed-in admin role before using Supabase's server-side Auth Admin API. Supabase provides `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions; never put the service-role key in `app.js` or any browser-accessible file.
3. The first administrator must register through **Create a teacher account**, confirm their email if required, then be promoted in the SQL Editor. Do not let public users self-assign admin roles.
4. Publish the latest `index.html`, `app.js`, `styles.css`, `supabase-schema.sql`, and `supabase/functions` files. Sign in as admin and use **Teachers Account → Add user account** to create teacher logins.
5. On the browser containing old records, use **Settings → Import records from this browser** to merge old school records. Teachers can also register their own accounts, then use their accounts on other devices.

Previous browser-local accounts (including the old `admin` sign-in) are not Supabase accounts and cannot be used on another device. Importing records does not transfer passwords or account logins. Back up data before importing. Never put a Supabase service-role key in this static app; only the public anon key may be used alongside the database's RLS and RPC restrictions.

## Run

Open `index.html` in a modern browser with an internet connection. Supabase authentication and shared storage require the configured Supabase project and an installed schema; opening the static page alone does not provide offline sign-in.

## Records and privacy

With Supabase configured, teacher accounts and school records are stored in the school's shared database. Use **Export CSV** to download assignment records for backup or further processing. The former local-storage version saved accounts and records only on that browser; those records remain separate and are not automatically migrated.

The app does not enforce a weekly workload limit. Confirm applicable school and division policies before using the recorded minutes for official reporting.

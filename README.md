# Teacher Load Manager

A lightweight, browser-based school personnel and teaching-load tracker. Add teacher profiles, record learning areas and class assignments with configurable groups, periods 1–7, weekdays, and weekly minutes. Turn on automatic recording in the sidebar's **Groups & periods** settings to create one assignment for every configured group in each period; leave **Period and time** unselected to create all assignments, or choose an option to create a single assignment. Selected weekdays and weekly minutes apply to each generated assignment, and configured group-and-period times fill schedules automatically. The **Period and time** dropdown lists the configured schedules for every group and period; choosing an option synchronizes the group and period fields. Configure separate start and end times for every group and period in **Groups & periods**. Review workload totals, print the overview, or export the assignment list as CSV.

Teaching loads are automatically ordered by teacher, earliest selected weekday, and scheduled start time.

Admins can edit or delete assignments from the **Assignment directory**. Teachers can edit or delete loads only from their own profile. The directory and **Preview teacher loads** list show labeled **Edit** and **Delete** buttons for loads the signed-in account can manage.

Use **Substitution plans** in the sidebar to apply for leave or manage staff coverage. Teachers can submit a leave application with a start and end date; the admin can approve or reject it. Approval marks the teacher **On leave**, after which the teacher can submit a coverage proposal. Teachers can edit or delete their own pending coverage proposals until the admin reviews them. The admin reviews those proposals separately. The admin should update the teacher's status when the leave period is over. Admins can also create substitution plans directly. Filter assignments by the configured group (such as Morning shift or Afternoon shift) and Period 1–7; with **All periods** selected, the available-substitute list includes teachers free for at least one matching load, and selecting a specific period or load narrows it to that time. Displayed times follow the current Groups & periods settings; loads that conflict with the substitute's existing teaching or overlapping substitution-plan schedule are unavailable. Use **Print preview** on a saved plan's row to inspect its details, then select **Print this plan** to open the browser print preview. Edit or delete a saved plan from its row as well. **Print plan** prints a draft before saving. Saved plans are stored in the shared school database when the Supabase setup below is complete.

The interface uses Arial Narrow at 16px throughout.

Open **Settings** to configure school branding, including the school name, address, School ID, logo, and principal's name and designation. The logo must be a PNG, JPG, WebP, or GIF image no larger than 1 MB. Branding is stored with the school's shared records and appears in the app and printed reports.

## Sign in

Teachers can create an account with an email address and password. Their profile is added to the shared records automatically when Supabase Auth creates the account. Teachers can add, edit, or delete loads only for their own profile, apply for leave, and submit a substitution proposal after the admin approves their leave application. Leave applications and coverage proposals remain pending until the admin reviews them. The admin retains final control of schoolwide records. The application does not record sign-in history.

## Supabase setup and publishing

The shared-account feature requires the Supabase project configured in `app.js` and the SQL in `supabase-schema.sql`. Before publishing a cloud-enabled version:

1. In the Supabase SQL Editor for the configured project, run the complete `supabase-schema.sql` script. It creates the account profiles, teacher signup trigger, protected school-state table, and role/ownership-checked RPCs.
2. In Supabase Authentication settings, configure the allowed site URL and email-confirmation redirect for the deployed GitHub Pages URL. Decide whether to require email confirmation.
3. Create the administrator's account through the registration form, confirm the email if required, then promote it in the SQL Editor by replacing `ADMIN_EMAIL_HERE` in the final commented `UPDATE public.profiles` statement with that account's email. Do not let users self-assign an administrator role.
4. Publish the updated `index.html`, `app.js`, `styles.css`, and `supabase-schema.sql` to the GitHub Pages repository, then test administrator and teacher accounts on the deployed site.

The existing GitHub Pages deployment remains browser-local until the new files are published and the Supabase schema is installed. Previous local accounts (including the old `admin` sign-in) are not Supabase accounts and cannot be used to sign in on another device. After publishing, the administrator can sign into the new cloud account on the same browser that has the old records, open **Settings**, and select **Import records from this browser**. This explicitly merges teacher profiles, loads, leave applications, and substitution plans by record ID without replacing existing cloud records. It does not transfer passwords or account logins; teachers must create new email/password accounts. Back up data before importing. Never put a Supabase service-role key in this static app; only the public anon key may be used alongside the database's RLS and RPC restrictions.

## Run

Open `index.html` in a modern browser with an internet connection. Supabase authentication and shared storage require the configured Supabase project and an installed schema; opening the static page alone does not provide offline sign-in.

## Records and privacy

With Supabase configured, teacher accounts and school records are stored in the school's shared database. Use **Export CSV** to download assignment records for backup or further processing. The former local-storage version saved accounts and records only on that browser; those records remain separate and are not automatically migrated.

The app does not enforce a weekly workload limit. Confirm applicable school and division policies before using the recorded minutes for official reporting.

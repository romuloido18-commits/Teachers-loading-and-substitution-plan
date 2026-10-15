# Teacher Load Manager

A lightweight, browser-based school personnel and teaching-load tracker. Add teacher profiles, record learning areas and class assignments with configurable groups, periods 1–7, weekdays, and weekly minutes. Turn on automatic recording in the sidebar's **Groups & periods** settings to create one assignment for every configured group in each period; leave **Period and time** unselected to create all assignments, or choose an option to create a single assignment. Selected weekdays and weekly minutes apply to each generated assignment, and configured group-and-period times fill schedules automatically. The **Period and time** dropdown lists the configured schedules for every group and period; choosing an option synchronizes the group and period fields. Configure separate start and end times for every group and period in **Groups & periods**. Review workload totals, print the overview, or export the assignment list as CSV.

Teaching loads are automatically ordered by teacher, earliest selected weekday, and scheduled start time.

Admins can edit or delete assignments from the **Assignment directory**. Teachers can edit or delete loads only from their own profile. The directory and **Preview teacher loads** list show labeled **Edit** and **Delete** buttons for loads the signed-in account can manage.

Use **Substitution plans** in the sidebar to apply for leave or manage staff coverage. Teachers can submit a leave application with a start and end date; the admin can approve or reject it. Approval marks the teacher **On leave**, after which the teacher can submit a coverage proposal. Teachers can edit or delete their own pending coverage proposals until the admin reviews them. The admin reviews those proposals separately. The admin should update the teacher's status when the leave period is over. Admins can also create substitution plans directly. Filter assignments by the configured group (such as Morning shift or Afternoon shift) and Period 1–7; with **All periods** selected, the available-substitute list includes teachers free for at least one matching load, and selecting a specific period or load narrows it to that time. Displayed times follow the current Groups & periods settings; loads that conflict with the substitute's existing teaching or overlapping substitution-plan schedule are unavailable. Use **Print preview** on a saved plan's row to inspect its details, then select **Print this plan** to open the browser print preview. Edit or delete a saved plan from its row as well. **Print plan** prints a draft before saving. Each saved plan records its coverage dates and is saved in this browser.

The interface uses Arial Narrow at 16px throughout.

Open **Settings** to configure school branding, including the school name, address, School ID, logo, and principal's name and designation. The logo must be a PNG, JPG, WebP, or GIF image no larger than 1 MB. Branding is stored with the school's records in that browser and appears in the app and printed reports.

## Sign in

Teachers can create an account from the sign-in page. Their profile and teaching loads are added to the school's shared records in that browser. Teachers can add, edit, or delete loads only for their own profile, apply for leave, and submit a substitution proposal after the admin approves their leave application. Leave applications and coverage proposals remain pending until the admin reviews them. Teachers can change or withdraw their own proposal only while it is pending. Teachers cannot manage teacher profiles, settings, groups, periods, or other schoolwide records. The admin retains final control and can review all teacher sign-ins under **Teachers Account**. The existing `admin` sign-in continues to access legacy schoolwide records.

This static app has no server: accounts, passwords, records, and sign-in history are stored in browser local storage and do not sync across browsers or devices. The admin can supervise teacher activity only in that same browser. This is not secure authentication or a true access-control boundary; do not use it to protect confidential information or reuse a sensitive password.

## Run

Open `index.html` in a modern browser. No installation or server is required.

## Records and privacy

Records are saved in the browser's local storage on the device where the app is used. They are not sent to a server. Use **Export CSV** to download assignment records for backup or further processing. Clearing the browser's site data will remove saved records.

The app does not enforce a weekly workload limit. Confirm applicable school and division policies before using the recorded minutes for official reporting.

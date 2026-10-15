# Teacher Load Manager

A lightweight, browser-based school personnel and teaching-load tracker. Add teacher profiles, record learning areas and class assignments with configurable groups, periods 1–7, weekdays, and weekly minutes. Turn on automatic recording in the sidebar's **Groups & periods** settings to create one assignment for every configured group in each period; leave **Period and time** unselected to create all assignments, or choose an option to create a single assignment. Selected weekdays and weekly minutes apply to each generated assignment, and configured group-and-period times fill schedules automatically. The **Period and time** dropdown lists the configured schedules for every group and period; choosing an option synchronizes the group and period fields. Configure separate start and end times for every group and period in **Groups & periods**. Review workload totals, print the overview, or export the assignment list as CSV.

Teaching loads are automatically ordered by teacher, earliest selected weekday, and scheduled start time.

Use **Substitution plans** in the sidebar to assign an Active teacher to selected teaching loads for a teacher marked On leave. If no leave teacher appears, update the teacher's employment status in **Teachers**. Filter assignments by the configured group (such as Morning shift or Afternoon shift) and Period 1–7; with **All periods** selected, the available-substitute list includes teachers free for at least one matching load, and selecting a specific period or load narrows it to that time. Displayed times follow the current Groups & periods settings; loads that conflict with the substitute's existing teaching or overlapping substitution-plan schedule are unavailable. Use **Print preview** on a saved plan's row to inspect its details, then select **Print this plan** to open the browser print preview. Edit or delete a saved plan from its row as well. **Print plan** prints a draft before saving. Each saved plan records its coverage dates and is saved in this browser.

The interface uses Arial Narrow at 16px throughout.

Open **Settings** to configure school branding, including the school name, address, School ID, logo, and principal's name and designation. The logo must be a PNG, JPG, WebP, or GIF image no larger than 1 MB. Branding is stored with the school's records in that browser and appears in the app and printed reports.

## Sign in

Teachers can create an account from the sign-in page. Each teacher account gets its own profile and teaching-load records in the current browser, and every successful sign-in is recorded in **Teachers Account**. Use the same browser and device to see that account and its records again. The existing `admin` sign-in continues to access legacy schoolwide records.

This static app has no server: accounts, passwords, and sign-in history are stored in browser local storage and do not sync across browsers or devices. This is not secure authentication; do not use it to protect confidential information or reuse a sensitive password. Teacher accounts cannot access the schoolwide roster needed to create substitution plans; manage those from the admin account.

## Run

Open `index.html` in a modern browser. No installation or server is required.

## Records and privacy

Records are saved in the browser's local storage on the device where the app is used. They are not sent to a server. Use **Export CSV** to download assignment records for backup or further processing. Clearing the browser's site data will remove saved records.

The app does not enforce a weekly workload limit. Confirm applicable school and division policies before using the recorded minutes for official reporting.

# CCDI EDU PHP/MySQL setup

1. Start **Apache** and **MySQL** in the XAMPP Control Panel.
2. Open phpMyAdmin at `http://localhost/phpmyadmin` and import `php/schema.sql`. It creates or additively updates `ccdi_edu`, including stable account CCDI IDs, professor profiles and invitations, class/subject assignments, student enrollments, weighted grades and audit history, account theme preferences, announcements, and meetings. Existing records are preserved and matching schedules, student sections, and legacy grades are backfilled.
3. Check the connection values in `php/config.php`. The defaults are the standard XAMPP local MySQL account (`root` with an empty password). For a different setup, set `CCDI_DB_HOST`, `CCDI_DB_NAME`, `CCDI_DB_USER`, and `CCDI_DB_PASSWORD` in the PHP environment.
4. Open the site through Apache at `http://localhost/website/`. Do not open `index.html` directly as a file; browser requests to PHP need Apache.
5. Student applications are submitted through **Create Student Account**. The server creates a disabled account and a pending enrollment payment request; the fee is loaded from `enrollment_fee_config` (default ₱500.00). An administrator must verify receipt and confirm the request in Finance before the account is activated and receives its CCDI ID. Update the fee in phpMyAdmin with `UPDATE enrollment_fee_config SET amount = 500.00 WHERE id = 1;` as needed.
6. Create staff accounts from a command prompt, using the PHP executable bundled with XAMPP:

   ```powershell
   C:\xampp\php\php.exe C:\xampp\htdocs\website\php\create_staff.php admin admin@example.com "Use-A-Strong-Password" "School Admin"
   C:\xampp\php\php.exe C:\xampp\htdocs\website\php\create_staff.php professor professor@example.com "Use-A-Strong-Password" "Instructor Name"
   ```

   Use a unique email and a password of at least eight characters. Do not put real passwords in source code or share them.
7. Administrators can issue single-use professor invitation codes from **Users**. Codes are stored only as hashes, expire within 1-30 days, can be revoked, and are throttled after repeated invalid attempts. The recipient completes registration at `http://localhost/website/professor-register.html`; the server consumes the invitation and assigns the professor CCDI ID atomically. The CLI command above remains available for administrators who provision accounts directly.
8. Administrators create, edit, publish, and delete audience-targeted announcements and meetings from the Announcements and Meetings pages. Announcements can include JPEG, PNG, or WebP images up to 5 MB; uploaded files are stored under `uploads/announcements/`. Announcements are shown to their selected audience; Meetings are available to professors and admins. Profile pages open from the avatar, omit the sidebar, and include a Back link. CCDI IDs and academic placement are read-only.
9. In **Admin Dashboard → Classes**, create course/year/block sections, assign each subject to a professor, enroll active students by CCDI ID, and review section rosters. Legacy schedule assignments are backfilled when the schedule instructor matches a professor account; reconcile any unmatched assignment here.
10. Configure the school's four grading weights in Class Management; they must total 100%. Professors open **Classes**, select an assigned subject, save drafts or publish grades, and can drop a student from that subject with a required reason. Students see only their own published grades; published grade history remains visible after a drop. Events pages were removed without deleting event records.

Enrollment and tuition payment requests remain **pending** until an administrator manually confirms receipt. This is not an external payment gateway and does not independently verify GCash, bank, or card transactions. Shop orders are stored for pickup; the prototype does not process online payments.

Profile, invitation, announcement, meeting, and theme endpoints require the session CSRF token. Admin-only operations are enforced in PHP, not by hiding controls in the browser. The professor registration form never submits a role value; the server assigns the professor role only after locking and consuming an active invitation.

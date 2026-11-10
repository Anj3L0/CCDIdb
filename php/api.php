<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

session_set_cookie_params([
    'httponly' => true,
    'samesite' => 'Lax',
    'secure' => !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off',
]);
session_start();

function respond(array $body, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE);
    exit;
}

function input_data(): array
{
    $contentType = strtolower((string)($_SERVER['CONTENT_TYPE'] ?? ''));
    if (str_starts_with($contentType, 'multipart/form-data')) {
        return is_array($_POST) ? $_POST : [];
    }
    $raw = file_get_contents('php://input');
    $data = json_decode($raw ?: '[]', true);
    if (!is_array($data)) {
        respond(['error' => 'Request body must be a JSON object.'], 400);
    }
    return $data;
}

function current_user(): ?array
{
    return $_SESSION['user'] ?? null;
}

function require_user(array $roles = []): array
{
    $user = current_user();
    if (!$user) {
        respond(['error' => 'Please sign in to continue.'], 401);
    }
    if ($roles && !in_array($user['role'], $roles, true)) {
        respond(['error' => 'You do not have permission to do that.'], 403);
    }
    return $user;
}

function require_csrf(): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$token || !hash_equals($_SESSION['csrf_token'] ?? '', $token)) {
        respond(['error' => 'Your session expired. Refresh the page and try again.'], 419);
    }
}

function required_string(array $data, string $key, int $maxLength = 255): string
{
    $raw = $data[$key] ?? '';
    if (!is_string($raw) && !is_numeric($raw)) {
        respond(['error' => ucfirst(str_replace('_', ' ', $key)) . ' must be text.'], 422);
    }
    $value = trim((string)$raw);
    $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    if ($value === '' || $length > $maxLength) {
        respond(['error' => sprintf('%s is required and must be %d characters or fewer.', ucfirst(str_replace('_', ' ', $key)), $maxLength)], 422);
    }
    return $value;
}

function store_announcement_image(array $file): string
{
    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
        return '';
    }
    if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK || (int)($file['size'] ?? 0) > 5 * 1024 * 1024) {
        respond(['error' => 'Announcement images must be no larger than 5 MB.'], 422);
    }
    $temporaryPath = $file['tmp_name'] ?? '';
    if (!is_string($temporaryPath) || !is_uploaded_file($temporaryPath)) {
        respond(['error' => 'The uploaded announcement image is invalid.'], 422);
    }
    $mime = (new finfo(FILEINFO_MIME_TYPE))->file($temporaryPath);
    $extensions = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];
    if (!is_string($mime) || !isset($extensions[$mime])) {
        respond(['error' => 'Upload a JPEG, PNG, or WebP announcement image.'], 422);
    }
    $directory = dirname(__DIR__) . '/uploads/announcements';
    if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) {
        respond(['error' => 'The announcement image folder is unavailable.'], 500);
    }
    $filename = bin2hex(random_bytes(16)) . '.' . $extensions[$mime];
    if (!move_uploaded_file($temporaryPath, $directory . '/' . $filename)) {
        respond(['error' => 'The announcement image could not be saved.'], 500);
    }
    return 'uploads/announcements/' . $filename;
}

function optional_string(array $data, string $key, int $maxLength = 255): string
{
    $raw = $data[$key] ?? '';
    if (!is_string($raw)) {
        respond(['error' => ucfirst(str_replace('_', ' ', $key)) . ' must be text.'], 422);
    }
    $value = trim($raw);
    $length = function_exists('mb_strlen') ? mb_strlen($value) : strlen($value);
    if ($length > $maxLength) {
        respond(['error' => sprintf('%s must be %d characters or fewer.', ucfirst(str_replace('_', ' ', $key)), $maxLength)], 422);
    }
    return $value;
}

function optional_grade(array $data, string $key): ?float
{
    if (!isset($data[$key]) || $data[$key] === '') {
        return null;
    }
    if ((!is_string($data[$key]) && !is_numeric($data[$key]))
        || !preg_match('/^\d+(?:\.\d{1,2})?$/', (string)$data[$key])
        || (float)$data[$key] < 0 || (float)$data[$key] > 5) {
        respond(['error' => ucfirst($key) . ' must be between 0.00 and 5.00.'], 422);
    }
    return round((float)$data[$key], 2);
}

function configured_grade_weights(PDO $pdo): ?array
{
    $weights = $pdo->query(
        'SELECT prelim_weight, midterm_weight, prefinal_weight, final_weight FROM grade_weight_config WHERE id = 1'
    )->fetch();
    return !$weights || in_array(null, $weights, true) ? null : $weights;
}

function configured_grade_total(array $grades, ?array $weights): ?float
{
    if (in_array(null, $grades, true) || !$weights) {
        return null;
    }
    return round(
        (float)$grades['prelim'] * (float)$weights['prelim_weight'] / 100
        + (float)$grades['midterm'] * (float)$weights['midterm_weight'] / 100
        + (float)$grades['prefinal'] * (float)$weights['prefinal_weight'] / 100
        + (float)$grades['final'] * (float)$weights['final_weight'] / 100,
        2
    );
}

function payment_method(array $data): string
{
    $method = required_string($data, 'method', 40);
    if (!in_array($method, ['GCash', 'Bank transfer', 'Card', 'Cashier'], true)) {
        respond(['error' => 'Select a valid payment method.'], 422);
    }
    return $method;
}

function staff_user(): array
{
    return require_user(['professor', 'admin']);
}

function invite_client_hash(): string
{
    return hash('sha256', (string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'));
}

function enforce_invite_rate_limit(PDO $pdo): void
{
    $ipHash = invite_client_hash();
    $pdo->prepare('DELETE FROM professor_invite_attempts WHERE attempted_at < DATE_SUB(NOW(), INTERVAL 1 DAY)')->execute();
    $statement = $pdo->prepare(
        'SELECT COUNT(*) FROM professor_invite_attempts WHERE ip_hash = ? AND attempted_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)'
    );
    $statement->execute([$ipHash]);
    if ((int)$statement->fetchColumn() >= 5) {
        respond(['error' => 'Too many invitation attempts. Try again in 15 minutes.'], 429);
    }
}

function record_invite_attempt(PDO $pdo): void
{
    $pdo->prepare('INSERT INTO professor_invite_attempts (ip_hash) VALUES (?)')->execute([invite_client_hash()]);
}

function assigned_grade_subject(PDO $pdo, array $staff, string $studentNumber, string $subjectCode): array
{
    $student = $pdo->prepare(
        'SELECT u.id, s.course, s.year_level, s.block
         FROM users u JOIN students s ON s.user_id = u.id
         WHERE u.student_number = ? AND u.role = "student"'
    );
    $student->execute([$studentNumber]);
    $record = $student->fetch();
    if (!$record) {
        respond(['error' => 'No student was found with that CCDI ID.'], 404);
    }

    if ($staff['role'] === 'admin') {
        return ['studentId' => (int)$record['id'], 'subjectName' => null, 'instructor' => null];
    }

    $assignment = $pdo->prepare(
        'SELECT subject_name, instructor FROM schedules
         WHERE course = ? AND year_level = ? AND block = ? AND subject_code = ?
           AND instructor = ? AND is_published = 1 LIMIT 1'
    );
    $assignment->execute([
        $record['course'],
        $record['year_level'],
        $record['block'],
        $subjectCode,
        $staff['name'],
    ]);
    $subject = $assignment->fetch();
    if (!$subject) {
        respond(['error' => 'You are not assigned to this student and subject.'], 403);
    }

    return [
        'studentId' => (int)$record['id'],
        'subjectName' => $subject['subject_name'],
        'instructor' => $subject['instructor'],
    ];
}

try {
    $pdo = database_connection();
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    $action = (string)($_GET['action'] ?? '');

    if ($method === 'GET' && $action === 'session') {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        $user = current_user();
        if ($user) {
            $theme = $pdo->prepare('SELECT theme_preference FROM users WHERE id = ?');
            $theme->execute([$user['id']]);
            $user['theme'] = $theme->fetchColumn() ?: 'light';
        }
        $profile = null;
        if ($user && $user['role'] === 'student') {
            $statement = $pdo->prepare(
                'SELECT u.ccdi_id AS ccdiId, u.student_number AS studentNumber, u.email, u.status,
                    s.first_name AS firstName, s.middle_name AS middleName, s.last_name AS lastName,
                    s.birthday, s.sex, s.phone, s.address, s.previous_school AS previousSchool,
                    s.course, s.year_level AS year, s.block, s.guardian,
                    IF(s.entrance_fee_confirmed = 1, "Enrolled", "Pending payment") AS enrollmentStatus
                 FROM students s JOIN users u ON u.id = s.user_id WHERE u.id = ?'
            );
            $statement->execute([$user['id']]);
            $profile = $statement->fetch() ?: null;
            if ($profile) {
                $profile['name'] = trim($profile['firstName'] . ' ' . ($profile['middleName'] ? $profile['middleName'] . ' ' : '') . $profile['lastName']);
            }
        } elseif ($user && $user['role'] === 'professor') {
            $statement = $pdo->prepare(
                'SELECT u.ccdi_id AS ccdiId, u.email, u.status,
                        COALESCE(p.first_name, u.display_name) AS firstName, p.middle_name AS middleName,
                        p.last_name AS lastName, p.birthday, p.civil_status AS civilStatus,
                        p.phone, p.address, p.employment_status AS employmentStatus
                 FROM users u LEFT JOIN professors p ON p.user_id = u.id WHERE u.id = ?'
            );
            $statement->execute([$user['id']]);
            $profile = $statement->fetch() ?: null;
            if ($profile) {
                $profile['name'] = trim(implode(' ', array_filter([
                    $profile['firstName'], $profile['middleName'], $profile['lastName'],
                ], static fn($part) => is_string($part) && trim($part) !== '')));
                $classes = $pdo->prepare(
                    'SELECT DISTINCT course, year_level AS year, block, subject_code AS subjectCode, subject_name AS subjectName
                     FROM schedules WHERE instructor = ? AND is_published = 1 ORDER BY course, year_level, block, subject_code'
                );
                $classes->execute([$user['name']]);
                $profile['assignedClasses'] = $classes->fetchAll();
            }
        } elseif ($user && $user['role'] === 'admin') {
            $statement = $pdo->prepare(
                'SELECT ccdi_id AS ccdiId, email, display_name AS name, status FROM users WHERE id = ? AND role = "admin"'
            );
            $statement->execute([$user['id']]);
            $profile = $statement->fetch() ?: null;
        }
        respond(['csrfToken' => $_SESSION['csrf_token'], 'user' => $user, 'profile' => $profile]);
    }

    if ($method === 'POST') {
        require_csrf();
        $data = input_data();

        if ($action === 'register') {
            $firstName = required_string($data, 'firstName', 100);
            $lastName = required_string($data, 'lastName', 100);
            $birthday = required_string($data, 'birthday', 10);
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthday)
                || !checkdate((int)substr($birthday, 5, 2), (int)substr($birthday, 8, 2), (int)substr($birthday, 0, 4))) {
                respond(['error' => 'Enter a valid birthday.'], 422);
            }
            $emailInput = $data['email'] ?? '';
            $password = $data['password'] ?? '';
            if (!is_string($emailInput) || !is_string($password) || strlen($password) > 4096) {
                respond(['error' => 'Enter a valid email address and password.'], 422);
            }
            $email = filter_var(trim($emailInput), FILTER_VALIDATE_EMAIL);
            $middleNameInput = $data['middleName'] ?? '';
            if (!is_string($middleNameInput)) {
                respond(['error' => 'Middle name must be text.'], 422);
            }
            $middleName = trim($middleNameInput) ?: null;
            $sex = required_string($data, 'sex', 30);
            $phone = required_string($data, 'phone', 40);
            $address = required_string($data, 'address', 500);
            $previousSchool = required_string($data, 'previousSchool', 200);
            $course = required_string($data, 'course', 150);
            $year = required_string($data, 'year', 30);
            $guardian = required_string($data, 'guardian', 200);
            $method = payment_method($data);
            if (!$email) {
                respond(['error' => 'Enter a valid email address.'], 422);
            }
            if (strlen($password) < 8) {
                respond(['error' => 'Password must be at least 8 characters.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $displayName = trim($firstName . ' ' . $lastName);
                $insertUser = $pdo->prepare('INSERT INTO users (email, password_hash, display_name, role, status) VALUES (?, ?, ?, "student", "disabled")');
                $insertUser->execute([$email, password_hash($password, PASSWORD_DEFAULT), $displayName]);
                $userId = (int)$pdo->lastInsertId();
                $insertStudent = $pdo->prepare(
                    'INSERT INTO students (user_id, first_name, middle_name, last_name, birthday, sex, phone, address, previous_school, course, year_level, guardian, entrance_fee_confirmed)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $insertStudent->execute([
                    $userId,
                    $firstName,
                    $middleName,
                    $lastName,
                    $birthday,
                    $sex,
                    $phone,
                    $address,
                    $previousSchool,
                    $course,
                    $year,
                    $guardian,
                    0,
                ]);
                $fee = (float)$pdo->query('SELECT amount FROM enrollment_fee_config WHERE id = 1')->fetchColumn();
                if ($fee <= 0) {
                    throw new RuntimeException('The enrollment fee is not configured.');
                }
                $reference = 'ENR-' . strtoupper(bin2hex(random_bytes(5)));
                $payment = $pdo->prepare(
                    'INSERT INTO enrollment_payments (user_id, reference, method, amount, status) VALUES (?, ?, ?, ?, "pending")'
                );
                $payment->execute([$userId, $reference, $method, $fee]);
                $pdo->commit();
            } catch (Throwable $error) {
                $pdo->rollBack();
                if ($error instanceof PDOException && $error->getCode() === '23000') {
                    respond(['error' => 'An account already exists with that email address.'], 409);
                }
                throw $error;
            }
            respond(['status' => 'pending', 'reference' => $reference, 'amount' => $fee], 201);
        }

                    if ($action === 'check_professor_invite') {
                        enforce_invite_rate_limit($pdo);
                        $code = required_string($data, 'code', 100);
                        $statement = $pdo->prepare(
                            'SELECT id FROM professor_invitation_codes
                             WHERE code_hash = ? AND expires_at > NOW() AND used_at IS NULL AND revoked_at IS NULL LIMIT 1'
                        );
                        $statement->execute([hash('sha256', strtoupper($code))]);
                        if (!$statement->fetch()) {
                            record_invite_attempt($pdo);
                            respond(['error' => 'The invitation code is invalid, expired, used, or revoked.'], 422);
                        }
                        respond(['valid' => true]);
                    }

                    if ($action === 'register_professor') {
                        enforce_invite_rate_limit($pdo);
                        $code = required_string($data, 'invitationCode', 100);
                        $firstName = required_string($data, 'firstName', 100);
                        $middleName = optional_string($data, 'middleName', 100);
                        $lastName = required_string($data, 'lastName', 100);
                        $birthday = required_string($data, 'birthday', 10);
                        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $birthday)
                            || !checkdate((int)substr($birthday, 5, 2), (int)substr($birthday, 8, 2), (int)substr($birthday, 0, 4))) {
                            respond(['error' => 'Enter a valid birthday.'], 422);
                        }
                        $email = filter_var(required_string($data, 'email', 255), FILTER_VALIDATE_EMAIL);
                        $phone = required_string($data, 'phone', 40);
                        $address = required_string($data, 'address', 500);
                        $civilStatus = optional_string($data, 'civilStatus', 40);
                        $password = $data['password'] ?? '';
                        if (!$email || !is_string($password) || strlen($password) < 8 || strlen($password) > 4096) {
                            respond(['error' => 'Enter a valid email address and a password of at least eight characters.'], 422);
                        }
                        $pdo->beginTransaction();
                        try {
                            $invitation = $pdo->prepare(
                                'SELECT id FROM professor_invitation_codes
                                 WHERE code_hash = ? AND expires_at > NOW() AND used_at IS NULL AND revoked_at IS NULL FOR UPDATE'
                            );
                            $invitation->execute([hash('sha256', strtoupper($code))]);
                            $invite = $invitation->fetch();
                            if (!$invite) {
                                $pdo->rollBack();
                                record_invite_attempt($pdo);
                                respond(['error' => 'The invitation code is invalid, expired, used, or revoked.'], 422);
                            }
                            $displayName = trim($firstName . ' ' . ($middleName ? $middleName . ' ' : '') . $lastName);
                            $insertUser = $pdo->prepare(
                                'INSERT INTO users (email, password_hash, display_name, role, status)
                                 VALUES (?, ?, ?, "professor", "active")'
                            );
                            $insertUser->execute([$email, password_hash($password, PASSWORD_DEFAULT), $displayName]);
                            $userId = (int)$pdo->lastInsertId();
                            $ccdiId = sprintf('CCDI-PROF-%08d', $userId);
                            $pdo->prepare('UPDATE users SET ccdi_id = ? WHERE id = ?')->execute([$ccdiId, $userId]);
                            $pdo->prepare(
                                'INSERT INTO professors (user_id, first_name, middle_name, last_name, birthday, civil_status, phone, address)
                                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                            )->execute([$userId, $firstName, $middleName ?: null, $lastName, $birthday,
                                $civilStatus ?: null, $phone, $address]);
                            $pdo->prepare('UPDATE professor_invitation_codes SET used_by = ?, used_at = NOW() WHERE id = ?')
                                ->execute([$userId, $invite['id']]);
                            $pdo->commit();
                        } catch (Throwable $error) {
                            if ($pdo->inTransaction()) $pdo->rollBack();
                            if ($error instanceof PDOException && $error->getCode() === '23000') {
                                respond(['error' => 'An account already exists with that email address.'], 409);
                            }
                            throw $error;
                        }
                        $pdo->prepare('DELETE FROM professor_invite_attempts WHERE ip_hash = ?')->execute([invite_client_hash()]);
                        session_regenerate_id(true);
                        $_SESSION['user'] = [
                            'id' => $userId,
                            'studentNumber' => null,
                            'ccdiId' => $ccdiId,
                            'name' => $displayName,
                            'role' => 'professor',
                            'theme' => 'light',
                        ];
                        respond(['user' => $_SESSION['user']], 201);
                    }

                    if ($action === 'login') {
            $login = required_string($data, 'login', 255);
            $password = $data['password'] ?? '';
            if (!is_string($password) || strlen($password) > 4096) {
                respond(['error' => 'The ID/email or password is incorrect.'], 401);
            }
            $statement = $pdo->prepare(
                'SELECT u.id, u.student_number, u.ccdi_id, u.email, u.password_hash, u.role, u.status, u.theme_preference,
                        COALESCE(CONCAT(s.first_name, " ", s.last_name), u.display_name, u.email) AS display_name
                 FROM users u LEFT JOIN students s ON s.user_id = u.id
                 WHERE u.student_number = ? OR u.email = ? LIMIT 1'
            );
            $statement->execute([$login, $login]);
            $account = $statement->fetch();
            if (!$account || $account['status'] !== 'active' || !password_verify($password, $account['password_hash'])) {
                unset($_SESSION['user']);
                session_regenerate_id(true);
                respond(['error' => 'The ID/email or password is incorrect.'], 401);
            }
            session_regenerate_id(true);
            $_SESSION['user'] = [
                'id' => (int)$account['id'],
                'studentNumber' => $account['student_number'],
                'ccdiId' => $account['ccdi_id'],
                'theme' => $account['theme_preference'],
                'name' => $account['display_name'],
                'role' => $account['role'],
            ];
            respond(['user' => $_SESSION['user']]);
        }

        if ($action === 'update_profile') {
            $user = require_user(['student', 'professor', 'admin']);
            $email = filter_var(required_string($data, 'email', 255), FILTER_VALIDATE_EMAIL);
            if (!$email) {
                respond(['error' => 'Enter a valid email address.'], 422);
            }
            if ($user['role'] === 'admin') {
                try {
                    $pdo->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$email, $user['id']]);
                } catch (PDOException $error) {
                    if ($error->getCode() === '23000') {
                        respond(['error' => 'An account already exists with that email address.'], 409);
                    }
                    throw $error;
                }
                respond(['ok' => true]);
            }
            $phone = required_string($data, 'phone', 40);
            $address = required_string($data, 'address', 500);
            $middleName = optional_string($data, 'middleName', 100);
            try {
                $pdo->beginTransaction();
                $pdo->prepare('UPDATE users SET email = ? WHERE id = ?')->execute([$email, $user['id']]);
                if ($user['role'] === 'student') {
                    $pdo->prepare(
                        'UPDATE students SET middle_name = ?, phone = ?, address = ? WHERE user_id = ?'
                    )->execute([$middleName ?: null, $phone, $address, $user['id']]);
                } else {
                    $civilStatus = optional_string($data, 'civilStatus', 40);
                    $pdo->prepare(
                        'INSERT INTO professors (user_id, middle_name, civil_status, phone, address)
                         VALUES (?, ?, ?, ?, ?)
                         ON DUPLICATE KEY UPDATE middle_name = VALUES(middle_name), civil_status = VALUES(civil_status),
                           phone = VALUES(phone), address = VALUES(address)'
                    )->execute([$user['id'], $middleName ?: null, $civilStatus ?: null, $phone, $address]);
                }
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                if ($error instanceof PDOException && $error->getCode() === '23000') {
                    respond(['error' => 'An account already exists with that email address.'], 409);
                }
                throw $error;
            }
            respond(['ok' => true]);
        }

        if ($action === 'save_theme') {
            $user = require_user();
            $theme = $data['theme'] ?? null;
            if (!is_string($theme) || !in_array($theme, ['light', 'dark'], true)) {
                respond(['error' => 'Choose a valid theme.'], 422);
            }
            $statement = $pdo->prepare('UPDATE users SET theme_preference = ? WHERE id = ?');
            $statement->execute([$theme, $user['id']]);
            respond(['ok' => true, 'theme' => $theme]);
        }

                    if ($action === 'create_professor_invite') {
                        $admin = require_user(['admin']);
                        $days = filter_var($data['expiresInDays'] ?? 7, FILTER_VALIDATE_INT);
                        if ($days === false || $days < 1 || $days > 30) {
                            respond(['error' => 'Invitation expiry must be from 1 to 30 days.'], 422);
                        }
                        $code = 'CCDI-PROF-' . strtoupper(bin2hex(random_bytes(12)));
                        $statement = $pdo->prepare(
                            'INSERT INTO professor_invitation_codes (code_hash, expires_at, created_by)
                             VALUES (?, DATE_ADD(NOW(), INTERVAL ' . (int)$days . ' DAY), ?)'
                        );
                        $statement->execute([hash('sha256', $code), $admin['id']]);
                        respond(['ok' => true, 'code' => $code, 'expiresInDays' => $days], 201);
                    }

                    if ($action === 'revoke_professor_invite') {
                        $admin = require_user(['admin']);
                        $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
                        if (!$id) respond(['error' => 'Select a valid invitation.'], 422);
                        $statement = $pdo->prepare(
                            'UPDATE professor_invitation_codes SET revoked_by = ?, revoked_at = NOW()
                             WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL'
                        );
                        $statement->execute([$admin['id'], $id]);
                        if ($statement->rowCount() !== 1) respond(['error' => 'This invitation is no longer active.'], 409);
                        respond(['ok' => true]);
                    }

                    if ($action === 'save_announcement') {
            $admin = require_user(['admin']);
            $title = required_string($data, 'title', 200);
            $content = required_string($data, 'content', 20000);
            $announcementDate = (string)($data['announcementDate'] ?? date('Y-m-d'));
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $announcementDate)
                || !checkdate((int)substr($announcementDate, 5, 2), (int)substr($announcementDate, 8, 2), (int)substr($announcementDate, 0, 4))) {
                respond(['error' => 'Enter a valid announcement date.'], 422);
            }
            $audience = $data['audience'] ?? 'both';
            $status = $data['status'] ?? 'draft';
            $attachment = optional_string($data, 'attachmentUrl', 1000);
            $upload = $_FILES['attachmentImage'] ?? null;
            $hasUpload = is_array($upload) && ($upload['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;
            if (!is_string($audience) || !in_array($audience, ['students', 'professors', 'both'], true)
                || !is_string($status) || !in_array($status, ['draft', 'published'], true)) {
                respond(['error' => 'Choose a valid audience and publication status.'], 422);
            }
            $isExistingImage = preg_match('#^uploads/announcements/[a-f0-9]{32}\.(?:jpg|png|webp)$#', $attachment) === 1;
            if (!$hasUpload && $attachment !== '' && !$isExistingImage
                && (!filter_var($attachment, FILTER_VALIDATE_URL)
                    || !in_array(strtolower((string)parse_url($attachment, PHP_URL_SCHEME)), ['https', 'http'], true))) {
                respond(['error' => 'Attachment must be a valid HTTP or HTTPS URL.'], 422);
            }
            $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
            if ($hasUpload) {
                $attachment = store_announcement_image($upload);
            }
            if ($id) {
                $statement = $pdo->prepare(
                    'UPDATE announcements SET title = ?, content = ?, announcement_date = ?, audience = ?, status = ?, attachment_url = ?, updated_by = ? WHERE id = ?'
                );
                $statement->execute([$title, $content, $announcementDate, $audience, $status, $attachment ?: null, $admin['id'], $id]);
                if ($statement->rowCount() === 0) {
                    $exists = $pdo->prepare('SELECT 1 FROM announcements WHERE id = ?');
                    $exists->execute([$id]);
                    if (!$exists->fetchColumn()) respond(['error' => 'Announcement not found.'], 404);
                }
            } else {
                $statement = $pdo->prepare(
                    'INSERT INTO announcements (title, content, announcement_date, audience, status, attachment_url, created_by, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
                );
                 $statement->execute([$title, $content, $announcementDate, $audience, $status, $attachment ?: null, $admin['id'], $admin['id']]);
            }
            respond(['ok' => true]);
        }

        if ($action === 'delete_announcement') {
            require_user(['admin']);
            $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id) respond(['error' => 'Select a valid announcement.'], 422);
            $statement = $pdo->prepare('DELETE FROM announcements WHERE id = ?');
            $statement->execute([$id]);
            respond(['ok' => $statement->rowCount() === 1]);
        }

        if ($action === 'save_meeting') {
            $admin = require_user(['admin']);
            $title = required_string($data, 'title', 200);
            $description = required_string($data, 'description', 20000);
            $meetingDate = (string)($data['meetingDate'] ?? '');
            $startTime = (string)($data['startTime'] ?? '');
            $endTime = (string)($data['endTime'] ?? '');
            $location = optional_string($data, 'location', 200);
            $meetingLink = optional_string($data, 'meetingLink', 1000);
            $audience = $data['audience'] ?? 'both';
            $status = $data['status'] ?? 'draft';
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $meetingDate)
                || !checkdate((int)substr($meetingDate, 5, 2), (int)substr($meetingDate, 8, 2), (int)substr($meetingDate, 0, 4))
                || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $startTime)
                || !preg_match('/^(?:[01]\d|2[0-3]):[0-5]\d$/', $endTime) || $endTime <= $startTime) {
                respond(['error' => 'Enter a valid meeting date and a start/end time in order.'], 422);
            }
            if (!is_string($audience) || !in_array($audience, ['students', 'professors', 'both'], true)
                || !is_string($status) || !in_array($status, ['draft', 'published'], true)) {
                respond(['error' => 'Choose a valid audience and publication status.'], 422);
            }
            if ($meetingLink !== '' && (!filter_var($meetingLink, FILTER_VALIDATE_URL)
                || !in_array(strtolower((string)parse_url($meetingLink, PHP_URL_SCHEME)), ['https', 'http'], true))) {
                respond(['error' => 'Meeting link must be a valid HTTP or HTTPS URL.'], 422);
            }
            $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
            if ($id) {
                $statement = $pdo->prepare(
                    'UPDATE meetings SET title = ?, description = ?, meeting_date = ?, start_time = ?, end_time = ?, location = ?,
                     meeting_link = ?, audience = ?, status = ?, updated_by = ? WHERE id = ?'
                );
                $statement->execute([$title, $description, $meetingDate, $startTime, $endTime, $location,
                    $meetingLink ?: null, $audience, $status, $admin['id'], $id]);
                if ($statement->rowCount() === 0) {
                    $exists = $pdo->prepare('SELECT 1 FROM meetings WHERE id = ?');
                    $exists->execute([$id]);
                    if (!$exists->fetchColumn()) respond(['error' => 'Meeting not found.'], 404);
                }
            } else {
                $statement = $pdo->prepare(
                    'INSERT INTO meetings (title, description, meeting_date, start_time, end_time, location, meeting_link, audience, status, created_by, updated_by)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $statement->execute([$title, $description, $meetingDate, $startTime, $endTime, $location,
                    $meetingLink ?: null, $audience, $status, $admin['id'], $admin['id']]);
            }
            respond(['ok' => true]);
        }

        if ($action === 'delete_meeting') {
            require_user(['admin']);
            $id = filter_var($data['id'] ?? null, FILTER_VALIDATE_INT);
            if (!$id) respond(['error' => 'Select a valid meeting.'], 422);
            $statement = $pdo->prepare('DELETE FROM meetings WHERE id = ?');
            $statement->execute([$id]);
            respond(['ok' => $statement->rowCount() === 1]);
        }

        if ($action === 'logout') {
            $_SESSION = [];
            session_destroy();
            respond(['ok' => true]);
        }

                            if ($action === 'save_assignment_grades') {
                                $professor = require_user(['professor']);
                                $assignmentId = filter_var($data['assignmentId'] ?? null, FILTER_VALIDATE_INT);
                                $rows = $data['grades'] ?? null;
                                if (!$assignmentId || !is_array($rows) || !$rows || count($rows) > 200) {
                                    respond(['error' => 'Select an assigned class and submit at least one student row.'], 422);
                                }
                                $published = !empty($data['published']) ? 1 : 0;
                                $pdo->beginTransaction();
                                try {
                                    $assignment = $pdo->prepare(
                                        'SELECT id FROM class_subject_assignments WHERE id = ? AND professor_user_id = ? AND active = 1 FOR UPDATE'
                                    );
                                    $assignment->execute([$assignmentId, $professor['id']]);
                                    if (!$assignment->fetchColumn()) {
                                        $pdo->rollBack();
                                        respond(['error' => 'This class and subject are not assigned to you.'], 403);
                                    }
                                    $enrollmentQuery = $pdo->prepare(
                                        'SELECT sse.id FROM student_subject_enrollments sse
                                         JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
                                         JOIN users u ON u.id = ce.student_user_id AND u.status = "active"
                                         WHERE sse.id = ? AND sse.assignment_id = ? AND sse.status = "active" AND ce.status = "active" FOR UPDATE'
                                    );
                                    $existingGrade = $pdo->prepare('SELECT * FROM assignment_grades WHERE student_subject_enrollment_id = ? FOR UPDATE');
                                    $saveGrade = $pdo->prepare(
                                        'INSERT INTO assignment_grades
                                           (student_subject_enrollment_id, prelim, midterm, prefinal, final, total, is_published, saved_by)
                                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                         ON DUPLICATE KEY UPDATE prelim = VALUES(prelim), midterm = VALUES(midterm), prefinal = VALUES(prefinal),
                                           final = VALUES(final), total = VALUES(total), is_published = VALUES(is_published), saved_by = VALUES(saved_by)'
                                    );
                                    $gradeIdQuery = $pdo->prepare('SELECT id FROM assignment_grades WHERE student_subject_enrollment_id = ?');
                                    $history = $pdo->prepare(
                                        'INSERT INTO grade_change_history (assignment_grade_id, changed_by, old_values, new_values)
                                         VALUES (?, ?, ?, ?)'
                                    );
                                    $weightConfig = configured_grade_weights($pdo);
                                    $saved = 0;
                                    foreach ($rows as $row) {
                                        if (!is_array($row)) respond(['error' => 'A grade row is invalid.'], 422);
                                        $enrollmentId = filter_var($row['enrollmentId'] ?? null, FILTER_VALIDATE_INT);
                                        if (!$enrollmentId) respond(['error' => 'A student enrollment is invalid.'], 422);
                                        $terms = [
                                            'prelim' => optional_grade($row, 'prelim'),
                                            'midterm' => optional_grade($row, 'midterm'),
                                            'prefinal' => optional_grade($row, 'prefinal'),
                                            'final' => optional_grade($row, 'final'),
                                        ];
                                        if ($published && in_array(null, $terms, true)) {
                                            respond(['error' => 'Enter all four grading periods before publishing.'], 422);
                                        }
                                        $enrollmentQuery->execute([$enrollmentId, $assignmentId]);
                                        if (!$enrollmentQuery->fetchColumn()) {
                                            $pdo->rollBack();
                                            respond(['error' => 'A student is no longer actively enrolled in this assignment. Refresh the gradebook.'], 409);
                                        }
                                        $total = configured_grade_total($terms, $weightConfig);
                                        $existingGrade->execute([$enrollmentId]);
                                        $old = $existingGrade->fetch();
                                        $oldValues = $old ? [
                                            'prelim' => $old['prelim'], 'midterm' => $old['midterm'], 'prefinal' => $old['prefinal'],
                                            'final' => $old['final'], 'total' => $old['total'], 'is_published' => (int)$old['is_published'],
                                        ] : ['prelim' => null, 'midterm' => null, 'prefinal' => null, 'final' => null, 'total' => null, 'is_published' => 0];
                                        $newValues = $terms + ['total' => $total, 'is_published' => $published];
                                        $saveGrade->execute([$enrollmentId, $terms['prelim'], $terms['midterm'], $terms['prefinal'],
                                            $terms['final'], $total, $published, $professor['id']]);
                                        $gradeIdQuery->execute([$enrollmentId]);
                                        $history->execute([(int)$gradeIdQuery->fetchColumn(), $professor['id'],
                                            json_encode($oldValues, JSON_THROW_ON_ERROR), json_encode($newValues, JSON_THROW_ON_ERROR)]);
                                        $saved++;
                                    }
                                    $pdo->commit();
                                } catch (Throwable $error) {
                                    if ($pdo->inTransaction()) $pdo->rollBack();
                                    throw $error;
                                }
                                respond(['ok' => true, 'saved' => $saved]);
                            }

                            if ($action === 'drop_assignment_student') {
                                $professor = require_user(['professor']);
                                $assignmentId = filter_var($data['assignmentId'] ?? null, FILTER_VALIDATE_INT);
                                $enrollmentId = filter_var($data['enrollmentId'] ?? null, FILTER_VALIDATE_INT);
                                $reason = required_string($data, 'reason', 1000);
                                if (!$assignmentId || !$enrollmentId) respond(['error' => 'Select a valid student and class assignment.'], 422);
                                $pdo->beginTransaction();
                                try {
                                    $assignment = $pdo->prepare(
                                        'SELECT id FROM class_subject_assignments WHERE id = ? AND professor_user_id = ? AND active = 1 FOR UPDATE'
                                    );
                                    $assignment->execute([$assignmentId, $professor['id']]);
                                    if (!$assignment->fetchColumn()) {
                                        $pdo->rollBack();
                                        respond(['error' => 'This class and subject are not assigned to you.'], 403);
                                    }
                                    $drop = $pdo->prepare(
                                        'UPDATE student_subject_enrollments sse
                                         JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
                                         SET sse.status = "dropped", sse.drop_reason = ?, sse.dropped_by = ?, sse.dropped_at = NOW()
                                         WHERE sse.id = ? AND sse.assignment_id = ? AND sse.status = "active" AND ce.status = "active"'
                                    );
                                    $drop->execute([$reason, $professor['id'], $enrollmentId, $assignmentId]);
                                    if ($drop->rowCount() !== 1) {
                                        $pdo->rollBack();
                                        respond(['error' => 'The student is not actively enrolled in this assignment.'], 409);
                                    }
                                    $pdo->commit();
                                } catch (Throwable $error) {
                                    if ($pdo->inTransaction()) $pdo->rollBack();
                                    throw $error;
                                }
                                respond(['ok' => true]);
                            }

                    if ($action === 'save_grade_weights') {
                        $admin = require_user(['admin']);
                        $weights = [];
                        foreach (['prelim', 'midterm', 'prefinal', 'final'] as $term) {
                            $weight = filter_var($data[$term . 'Weight'] ?? null, FILTER_VALIDATE_FLOAT);
                            if ($weight === false || $weight < 0 || $weight > 100) {
                                respond(['error' => 'Each grading weight must be between 0 and 100.'], 422);
                            }
                            $weights[$term] = (float)$weight;
                        }
                        if (abs(array_sum($weights) - 100) > 0.001) {
                            respond(['error' => 'Grading weights must total exactly 100%.'], 422);
                        }
                        $statement = $pdo->prepare(
                            'UPDATE grade_weight_config SET prelim_weight = ?, midterm_weight = ?, prefinal_weight = ?, final_weight = ?, updated_by = ? WHERE id = 1'
                        );
                        $statement->execute([$weights['prelim'], $weights['midterm'], $weights['prefinal'], $weights['final'], $admin['id']]);
                        respond(['ok' => true, 'weights' => $weights]);
                    }

                    if ($action === 'save_academic_class') {
                        require_user(['admin']);
                        $course = required_string($data, 'course', 150);
                        $year = required_string($data, 'yearLevel', 30);
                        $block = strtoupper(required_string($data, 'block', 5));
                        $statement = $pdo->prepare(
                            'INSERT INTO academic_classes (course, year_level, block) VALUES (?, ?, ?)
                             ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id)'
                        );
                        $statement->execute([$course, $year, $block]);
                        respond(['ok' => true, 'classId' => (int)$pdo->lastInsertId()], 201);
                    }

                    if ($action === 'save_class_assignment') {
                        $admin = require_user(['admin']);
                        $classId = filter_var($data['classId'] ?? null, FILTER_VALIDATE_INT);
                        $professorId = filter_var($data['professorId'] ?? null, FILTER_VALIDATE_INT);
                        $units = filter_var($data['units'] ?? 0, FILTER_VALIDATE_INT);
                        if (!$classId || !$professorId || $units === false || $units < 0 || $units > 20) {
                            respond(['error' => 'Select a class, professor, and valid subject units.'], 422);
                        }
                        $professor = $pdo->prepare('SELECT id FROM users WHERE id = ? AND role = "professor" AND status = "active"');
                        $professor->execute([$professorId]);
                        if (!$professor->fetchColumn()) respond(['error' => 'Select an active professor.'], 422);
                        $class = $pdo->prepare('SELECT id FROM academic_classes WHERE id = ?');
                        $class->execute([$classId]);
                        if (!$class->fetchColumn()) respond(['error' => 'Select an existing class section.'], 404);
                        $code = required_string($data, 'subjectCode', 30);
                        $name = required_string($data, 'subjectName', 150);
                        $pdo->beginTransaction();
                        try {
                            $pdo->prepare(
                                'INSERT INTO subjects (subject_code, subject_name, units) VALUES (?, ?, ?)
                                 ON DUPLICATE KEY UPDATE units = VALUES(units), active = 1'
                            )->execute([$code, $name, $units]);
                            $subject = $pdo->prepare('SELECT id FROM subjects WHERE subject_code = ? AND subject_name = ?');
                            $subject->execute([$code, $name]);
                            $subjectId = (int)$subject->fetchColumn();
                            $pdo->prepare(
                                'INSERT INTO class_subject_assignments (class_id, subject_id, professor_user_id, created_by, active)
                                 VALUES (?, ?, ?, ?, 1)
                                 ON DUPLICATE KEY UPDATE professor_user_id = VALUES(professor_user_id), active = 1'
                            )->execute([$classId, $subjectId, $professorId, $admin['id']]);
                            $assignment = $pdo->prepare('SELECT id FROM class_subject_assignments WHERE class_id = ? AND subject_id = ?');
                            $assignment->execute([$classId, $subjectId]);
                            $assignmentId = (int)$assignment->fetchColumn();
                            $classEnrollments = $pdo->prepare(
                                'SELECT id FROM student_class_enrollments WHERE class_id = ? AND status = "active"'
                            );
                            $classEnrollments->execute([$classId]);
                            $enrollSubject = $pdo->prepare(
                                'INSERT INTO student_subject_enrollments (class_enrollment_id, assignment_id, status)
                                 VALUES (?, ?, "active")
                                 ON DUPLICATE KEY UPDATE
                                   status = IF(drop_reason = "Assignment removed by administrator.", "active", status),
                                   dropped_by = IF(drop_reason = "Assignment removed by administrator.", NULL, dropped_by),
                                   dropped_at = IF(drop_reason = "Assignment removed by administrator.", NULL, dropped_at),
                                   drop_reason = IF(drop_reason = "Assignment removed by administrator.", NULL, drop_reason)'
                            );
                            foreach ($classEnrollments->fetchAll(PDO::FETCH_COLUMN) as $classEnrollmentId) {
                                $enrollSubject->execute([(int)$classEnrollmentId, $assignmentId]);
                            }
                            $pdo->commit();
                        } catch (Throwable $error) {
                            if ($pdo->inTransaction()) $pdo->rollBack();
                            throw $error;
                        }
                        respond(['ok' => true, 'assignmentId' => $assignmentId]);
                    }

                    if ($action === 'remove_class_assignment') {
                        $admin = require_user(['admin']);
                        $assignmentId = filter_var($data['assignmentId'] ?? null, FILTER_VALIDATE_INT);
                        if (!$assignmentId) respond(['error' => 'Select a valid class assignment.'], 422);
                        $pdo->beginTransaction();
                        try {
                            $pdo->prepare('UPDATE class_subject_assignments SET active = 0 WHERE id = ?')->execute([$assignmentId]);
                            $pdo->prepare(
                                'UPDATE student_subject_enrollments SET status = "withdrawn", drop_reason = "Assignment removed by administrator.",
                                 dropped_by = ?, dropped_at = NOW() WHERE assignment_id = ? AND status = "active"'
                            )->execute([$admin['id'], $assignmentId]);
                            $pdo->commit();
                        } catch (Throwable $error) {
                            if ($pdo->inTransaction()) $pdo->rollBack();
                            throw $error;
                        }
                        respond(['ok' => true]);
                    }

                    if ($action === 'enroll_student_in_class') {
                        $admin = require_user(['admin']);
                        $classId = filter_var($data['classId'] ?? null, FILTER_VALIDATE_INT);
                        $ccdiId = required_string($data, 'ccdiId', 40);
                        if (!$classId) respond(['error' => 'Select a valid class section.'], 422);
                        $statement = $pdo->prepare(
                            'SELECT u.id, s.course, s.year_level, s.block, c.course AS class_course, c.year_level AS class_year, c.block AS class_block
                             FROM users u JOIN students s ON s.user_id = u.id JOIN academic_classes c ON c.id = ?
                             WHERE u.ccdi_id = ? AND u.role = "student" AND u.status = "active"'
                        );
                        $statement->execute([$classId, $ccdiId]);
                        $student = $statement->fetch();
                        if (!$student) respond(['error' => 'No active student was found with that CCDI ID.'], 404);
                        if (strcasecmp($student['course'], $student['class_course']) !== 0
                            || strcasecmp($student['year_level'], $student['class_year']) !== 0
                            || strcasecmp($student['block'], $student['class_block']) !== 0) {
                            respond(['error' => 'The student profile does not match this class section.'], 422);
                        }
                        $pdo->beginTransaction();
                        try {
                            $pdo->prepare(
                                'INSERT INTO student_class_enrollments (student_user_id, class_id, status) VALUES (?, ?, "active")
                                 ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), status = "active"'
                            )->execute([$student['id'], $classId]);
                            $classEnrollmentId = (int)$pdo->lastInsertId();
                            $assignments = $pdo->prepare('SELECT id FROM class_subject_assignments WHERE class_id = ? AND active = 1');
                            $assignments->execute([$classId]);
                            $insertEnrollment = $pdo->prepare(
                                        'INSERT INTO student_subject_enrollments (class_enrollment_id, assignment_id, status) VALUES (?, ?, "active")
                                         ON DUPLICATE KEY UPDATE
                                             status = IF(status = "withdrawn" AND drop_reason = "Assignment removed by administrator.", "active", status),
                                               dropped_by = IF(drop_reason = "Assignment removed by administrator.", NULL, dropped_by),
                                               dropped_at = IF(drop_reason = "Assignment removed by administrator.", NULL, dropped_at),
                                               drop_reason = IF(drop_reason = "Assignment removed by administrator.", NULL, drop_reason)'
                            );
                            foreach ($assignments->fetchAll(PDO::FETCH_COLUMN) as $assignmentId) {
                                $insertEnrollment->execute([$classEnrollmentId, $assignmentId]);
                            }
                            $pdo->commit();
                        } catch (Throwable $error) {
                            if ($pdo->inTransaction()) $pdo->rollBack();
                            throw $error;
                        }
                        respond(['ok' => true]);
                    }

                    if ($action === 'save_grade') {
            $staff = require_user(['admin']);
            $studentNumber = required_string($data, 'studentNumber', 40);
            $subjectCode = required_string($data, 'subjectCode', 30);
            $target = assigned_grade_subject($pdo, $staff, $studentNumber, $subjectCode);
            $terms = [
                'prelim' => optional_grade($data, 'prelim'),
                'midterm' => optional_grade($data, 'midterm'),
                'prefinal' => optional_grade($data, 'prefinal'),
                'final' => optional_grade($data, 'final'),
            ];
            $statement = $pdo->prepare(
                'INSERT INTO grades (student_id, subject_code, subject_name, instructor, prelim, midterm, prefinal, final, is_published)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE subject_name = VALUES(subject_name), instructor = VALUES(instructor),
                   prelim = VALUES(prelim), midterm = VALUES(midterm), prefinal = VALUES(prefinal),
                   final = VALUES(final), is_published = VALUES(is_published)'
            );
            $statement->execute([
                $target['studentId'],
                $subjectCode,
                $target['subjectName'] ?? required_string($data, 'subjectName', 150),
                $target['instructor'] ?? optional_string($data, 'instructor', 150),
                $terms['prelim'],
                $terms['midterm'],
                $terms['prefinal'],
                $terms['final'],
                !empty($data['published']) ? 1 : 0,
            ]);
            respond(['ok' => true]);
        }

        if ($action === 'save_grade_set') {
            $staff = require_user(['admin']);
            $studentNumber = required_string($data, 'studentNumber', 40);
            $subjects = $data['subjects'] ?? null;
            if (!is_array($subjects) || !$subjects || count($subjects) > 100) {
                respond(['error' => 'Enter grades for at least one subject.'], 422);
            }
            $published = !empty($data['published']) ? 1 : 0;
            $validatedSubjects = [];
            foreach ($subjects as $subject) {
                if (!is_array($subject)) {
                    respond(['error' => 'A subject grade entry is invalid.'], 422);
                }
                $terms = [
                    'prelim' => optional_grade($subject, 'prelim'),
                    'midterm' => optional_grade($subject, 'midterm'),
                    'prefinal' => optional_grade($subject, 'prefinal'),
                    'final' => optional_grade($subject, 'final'),
                ];
                if (array_filter($terms, static fn($grade) => $grade !== null) === []) {
                    continue;
                }
                $subjectCode = required_string($subject, 'subjectCode', 30);
                $target = assigned_grade_subject($pdo, $staff, $studentNumber, $subjectCode);
                $validatedSubjects[] = [
                    $subjectCode,
                    $target['subjectName'] ?? required_string($subject, 'subjectName', 150),
                    $target['instructor'] ?? optional_string($subject, 'instructor', 150),
                    $terms['prelim'],
                    $terms['midterm'],
                    $terms['prefinal'],
                    $terms['final'],
                    $published,
                    $target['studentId'],
                ];
            }
            if (!$validatedSubjects) {
                respond(['error' => 'Enter at least one grade before saving.'], 422);
            }
            $statement = $pdo->prepare(
                'INSERT INTO grades (student_id, subject_code, subject_name, instructor, prelim, midterm, prefinal, final, is_published)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE subject_name = VALUES(subject_name), instructor = VALUES(instructor),
                   prelim = VALUES(prelim), midterm = VALUES(midterm), prefinal = VALUES(prefinal),
                   final = VALUES(final), is_published = VALUES(is_published)'
            );
            $pdo->beginTransaction();
            try {
                foreach ($validatedSubjects as $subject) {
                    $studentId = array_pop($subject);
                    $statement->execute(array_merge([$studentId], $subject));
                }
                $pdo->commit();
            } catch (Throwable $error) {
                $pdo->rollBack();
                throw $error;
            }
            respond(['ok' => true, 'saved' => count($validatedSubjects)]);
        }

        if ($action === 'save_schedule') {
            require_user(['admin']);
            $course = required_string($data, 'course', 150);
            $year = required_string($data, 'year', 30);
            $block = strtoupper(required_string($data, 'block', 5));
            $statement = $pdo->prepare(
                'INSERT INTO schedules (course, year_level, block, subject_code, subject_name, units, day, class_time, room, instructor, is_published)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)'
            );
            $units = filter_var($data['units'] ?? null, FILTER_VALIDATE_INT);
            if ($units === false || $units < 0 || $units > 20) {
                respond(['error' => 'Units must be a number from 0 to 20.'], 422);
            }
            $statement->execute([
                $course,
                $year,
                $block,
                required_string($data, 'subjectCode', 30),
                required_string($data, 'subjectName', 150),
                $units,
                required_string($data, 'day', 15),
                required_string($data, 'time', 50),
                required_string($data, 'room', 50),
                optional_string($data, 'instructor', 150),
            ]);
            respond(['ok' => true], 201);
        }

        if ($action === 'save_tuition_term') {
            require_user(['admin']);
            $amount = filter_var($data['amount'] ?? null, FILTER_VALIDATE_FLOAT);
            $dueDate = (string)($data['dueDate'] ?? '');
            if ($amount === false || $amount < 0 || $amount > 99999999.99
                || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $dueDate)
                || !checkdate((int)substr($dueDate, 5, 2), (int)substr($dueDate, 8, 2), (int)substr($dueDate, 0, 4))) {
                respond(['error' => 'Enter a valid non-negative amount and due date.'], 422);
            }
            $statement = $pdo->prepare(
                'INSERT INTO tuition_terms (school_year, name, due_date, amount)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE due_date = VALUES(due_date), amount = VALUES(amount)'
            );
            $statement->execute([
                required_string($data, 'schoolYear', 15),
                required_string($data, 'name', 40),
                $dueDate,
                $amount,
            ]);
            respond(['ok' => true]);
        }

        if ($action === 'request_tuition_payment') {
            $user = require_user(['student']);
            $termId = filter_var($data['termId'] ?? null, FILTER_VALIDATE_INT);
            if (!$termId) {
                respond(['error' => 'Select a valid tuition term.'], 422);
            }
            $term = $pdo->prepare('SELECT id, amount FROM tuition_terms WHERE id = ?');
            $term->execute([$termId]);
            $termData = $term->fetch();
            if (!$termData) {
                respond(['error' => 'That tuition term is unavailable.'], 404);
            }
            $reference = 'PAY-' . strtoupper(bin2hex(random_bytes(5)));
            $statement = $pdo->prepare(
                'INSERT INTO tuition_payments (user_id, term_id, reference, method, amount, status) VALUES (?, ?, ?, ?, ?, "pending")'
            );
            try {
                $statement->execute([$user['id'], $termId, $reference, payment_method($data), $termData['amount']]);
            } catch (PDOException $error) {
                if ($error->getCode() === '23000') {
                    respond(['error' => 'A payment record already exists for this tuition term.'], 409);
                }
                throw $error;
            }
            respond(['id' => (int)$pdo->lastInsertId(), 'reference' => $reference, 'status' => 'pending'], 201);
        }

        if ($action === 'confirm_tuition_payment') {
            require_user(['admin']);
            $paymentId = filter_var($data['paymentId'] ?? null, FILTER_VALIDATE_INT);
            $statement = $pdo->prepare('UPDATE tuition_payments SET status = "paid", confirmed_at = NOW() WHERE id = ? AND status = "pending"');
            if (!$paymentId) {
                respond(['error' => 'Select a valid payment record.'], 422);
            }
            $statement->execute([$paymentId]);
            if ($statement->rowCount() !== 1) {
                respond(['error' => 'This payment is no longer pending.'], 409);
            }
            respond(['ok' => true]);
        }

        if ($action === 'confirm_enrollment_payment') {
            require_user(['admin']);
            $paymentId = filter_var($data['paymentId'] ?? null, FILTER_VALIDATE_INT);
            if (!$paymentId) {
                respond(['error' => 'Select a valid enrollment payment.'], 422);
            }
            $pdo->beginTransaction();
            try {
                $payment = $pdo->prepare('SELECT user_id, status FROM enrollment_payments WHERE id = ? FOR UPDATE');
                $payment->execute([$paymentId]);
                $record = $payment->fetch();
                if (!$record || $record['status'] !== 'pending') {
                    $pdo->rollBack();
                    respond(['error' => 'This enrollment payment is no longer pending.'], 409);
                }
                $userId = (int)$record['user_id'];
                $studentNumber = sprintf('CCDI-%s-%04d', date('Y'), $userId);
                $pdo->prepare('UPDATE enrollment_payments SET status = "paid", confirmed_at = NOW() WHERE id = ?')->execute([$paymentId]);
                $pdo->prepare('UPDATE students SET entrance_fee_confirmed = 1 WHERE user_id = ?')->execute([$userId]);
                $pdo->prepare('UPDATE users SET student_number = ?, ccdi_id = ?, status = "active" WHERE id = ? AND role = "student"')
                    ->execute([$studentNumber, $studentNumber, $userId]);
                $pdo->commit();
            } catch (Throwable $error) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                throw $error;
            }
            respond(['ok' => true, 'studentNumber' => $studentNumber]);
        }

        if ($action === 'save_product') {
            require_user(['admin']);
            $price = filter_var($data['price'] ?? null, FILTER_VALIDATE_FLOAT);
            if ($price === false || $price < 0 || $price > 99999999.99) {
                respond(['error' => 'Enter a valid non-negative product price.'], 422);
            }
            $statement = $pdo->prepare(
                'INSERT INTO products (sku, name, description, price, image, sizes, active)
                 VALUES (?, ?, ?, ?, ?, ?, 1)
                 ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), price = VALUES(price),
                   image = VALUES(image), sizes = VALUES(sizes), active = 1'
            );
            $sizes = $data['sizes'] ?? [];
            if (!is_array($sizes) || count($sizes) > 20) {
                respond(['error' => 'Product sizes must be a list with no more than 20 entries.'], 422);
            }
            foreach ($sizes as $size) {
                if (!is_string($size) || strlen($size) > 30) {
                    respond(['error' => 'Each product size must be text of 30 characters or fewer.'], 422);
                }
            }
            $statement->execute([
                required_string($data, 'sku', 60),
                required_string($data, 'name', 150),
                trim((string)($data['description'] ?? '')),
                $price,
                trim((string)($data['image'] ?? '')),
                json_encode(array_values(array_filter(array_map('strval', $sizes)))),
            ]);
            respond(['ok' => true]);
        }

        if ($action === 'place_order') {
            $user = require_user(['student']);
            $items = $data['items'] ?? null;
            if (!is_array($items) || !$items) {
                respond(['error' => 'Add at least one item to your cart.'], 422);
            }
            $methodName = payment_method($data);
            $pdo->beginTransaction();
            try {
                $orderReference = 'SHOP-' . strtoupper(bin2hex(random_bytes(5)));
                $order = $pdo->prepare('INSERT INTO shop_orders (user_id, reference, payment_method, total, status) VALUES (?, ?, ?, 0, "submitted")');
                $order->execute([$user['id'], $orderReference, $methodName]);
                $orderId = (int)$pdo->lastInsertId();
                $productQuery = $pdo->prepare('SELECT id, name, price, sizes FROM products WHERE sku = ? AND active = 1');
                $itemInsert = $pdo->prepare('INSERT INTO shop_order_items (order_id, product_id, product_name, size, price) VALUES (?, ?, ?, ?, ?)');
                $total = 0;
                foreach ($items as $item) {
                    if (!is_array($item) || !isset($item['sku']) || !is_string($item['sku']) || $item['sku'] === '') {
                        throw new InvalidArgumentException('An item in your cart is invalid.');
                    }
                    $productQuery->execute([$item['sku']]);
                    $product = $productQuery->fetch();
                    if (!$product) {
                        throw new InvalidArgumentException('A product in your cart is no longer available.');
                    }
                    $rawSize = $item['size'] ?? 'One size';
                    if (!is_string($rawSize)) {
                        throw new InvalidArgumentException('The selected product size is invalid.');
                    }
                    $size = trim($rawSize);
                    $availableSizes = json_decode($product['sizes'], true) ?: [];
                    if ($availableSizes && !in_array($size, $availableSizes, true)) {
                        throw new InvalidArgumentException('The selected size is not available.');
                    }
                    $price = (float)$product['price'];
                    $total += $price;
                    $itemInsert->execute([$orderId, $product['id'], $product['name'], $size, $price]);
                }
                $pdo->prepare('UPDATE shop_orders SET total = ? WHERE id = ?')->execute([$total, $orderId]);
                $pdo->commit();
            } catch (Throwable $error) {
                $pdo->rollBack();
                if ($error instanceof InvalidArgumentException) {
                    respond(['error' => $error->getMessage()], 422);
                }
                throw $error;
            }
            respond(['id' => $orderReference], 201);
        }

        respond(['error' => 'Unknown API action.'], 404);
    }

    if ($method !== 'GET') {
        header('Allow: GET, POST');
        respond(['error' => 'Method not allowed.'], 405);
    }

            if ($action === 'professor_invites') {
                require_user(['admin']);
                $statement = $pdo->query(
                    'SELECT id, expires_at, used_at, revoked_at, created_at,
                            CASE WHEN revoked_at IS NOT NULL THEN "revoked"
                                 WHEN used_at IS NOT NULL THEN "used"
                                 WHEN expires_at <= NOW() THEN "expired"
                                 ELSE "active" END AS status
                     FROM professor_invitation_codes ORDER BY created_at DESC'
                );
                respond(['invitations' => $statement->fetchAll()]);
            }

            if ($action === 'announcements') {
        $user = require_user(['student', 'professor', 'admin']);
        if ($user['role'] === 'admin') {
            $statement = $pdo->query(
                'SELECT a.*, creator.display_name AS creator_name FROM announcements a
                 JOIN users creator ON creator.id = a.created_by ORDER BY a.created_at DESC'
            );
        } else {
            $audience = $user['role'] === 'student' ? 'students' : 'professors';
            $statement = $pdo->prepare(
                'SELECT a.id, a.title, a.content, a.announcement_date, a.audience, a.status, a.attachment_url, a.created_at, a.updated_at
                 FROM announcements a WHERE a.status = "published" AND a.audience IN (?, "both") ORDER BY a.created_at DESC'
            );
            $statement->execute([$audience]);
        }
        respond(['announcements' => $statement->fetchAll()]);
    }

    if ($action === 'meetings') {
        $user = require_user(['professor', 'admin']);
        if ($user['role'] === 'admin') {
            $statement = $pdo->query('SELECT * FROM meetings ORDER BY meeting_date DESC, start_time DESC');
        } else {
            $audience = $user['role'] === 'student' ? 'students' : 'professors';
            $statement = $pdo->prepare(
                'SELECT id, title, description, meeting_date, start_time, end_time, location, meeting_link, audience, status
                 FROM meetings WHERE status = "published" AND audience IN (?, "both") ORDER BY meeting_date, start_time'
            );
            $statement->execute([$audience]);
        }
        respond(['meetings' => $statement->fetchAll()]);
    }

            if ($action === 'admin_class_data') {
                require_user(['admin']);
                $classes = $pdo->query('SELECT id, course, year_level, block FROM academic_classes ORDER BY course, year_level, block')->fetchAll();
                $assignments = $pdo->query(
                    'SELECT a.id AS assignment_id, a.active, c.id AS class_id, c.course, c.year_level, c.block,
                            sub.id AS subject_id, sub.subject_code, sub.subject_name, sub.units,
                            a.professor_user_id, COALESCE(u.display_name, u.email) AS professor_name,
                            (SELECT COUNT(*) FROM student_subject_enrollments sse
                             JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
                             WHERE sse.assignment_id = a.id AND sse.status = "active" AND ce.status = "active") AS student_count
                     FROM class_subject_assignments a
                     JOIN academic_classes c ON c.id = a.class_id
                     JOIN subjects sub ON sub.id = a.subject_id
                     JOIN users u ON u.id = a.professor_user_id
                     ORDER BY c.course, c.year_level, c.block, sub.subject_code'
                )->fetchAll();
                $professors = $pdo->query('SELECT id, display_name, email FROM users WHERE role = "professor" AND status = "active" ORDER BY display_name')->fetchAll();
                $weights = $pdo->query('SELECT prelim_weight, midterm_weight, prefinal_weight, final_weight FROM grade_weight_config WHERE id = 1')->fetch();
                respond(['classes' => $classes, 'assignments' => $assignments, 'professors' => $professors, 'weights' => $weights]);
            }

            if ($action === 'class_enrollments') {
                require_user(['admin']);
                $classId = filter_var($_GET['classId'] ?? null, FILTER_VALIDATE_INT);
                if (!$classId) respond(['error' => 'Select a valid class section.'], 422);
                $statement = $pdo->prepare(
                    'SELECT u.ccdi_id, s.first_name, s.middle_name, s.last_name, ce.status
                     FROM student_class_enrollments ce JOIN users u ON u.id = ce.student_user_id
                     JOIN students s ON s.user_id = u.id WHERE ce.class_id = ? ORDER BY s.last_name, s.first_name'
                );
                $statement->execute([$classId]);
                respond(['students' => $statement->fetchAll()]);
            }

            if ($action === 'professor_assignments') {
                $professor = require_user(['professor']);
                $statement = $pdo->prepare(
                    'SELECT a.id AS assignment_id, c.id AS class_id, c.course, c.year_level, c.block,
                            sub.subject_code, sub.subject_name, sub.units,
                            (SELECT COUNT(*) FROM student_subject_enrollments sse
                             JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
                             WHERE sse.assignment_id = a.id AND sse.status = "active" AND ce.status = "active") AS student_count
                     FROM class_subject_assignments a
                     JOIN academic_classes c ON c.id = a.class_id
                     JOIN subjects sub ON sub.id = a.subject_id
                     WHERE a.professor_user_id = ? AND a.active = 1
                     ORDER BY c.course, c.year_level, c.block, sub.subject_code'
                );
                $statement->execute([$professor['id']]);
                respond(['assignments' => $statement->fetchAll()]);
            }

            if ($action === 'assignment_gradebook') {
                $professor = require_user(['professor']);
                $assignmentId = filter_var($_GET['assignmentId'] ?? null, FILTER_VALIDATE_INT);
                if (!$assignmentId) respond(['error' => 'Select a valid class assignment.'], 422);
                $assignment = $pdo->prepare(
                    'SELECT a.id, c.course, c.year_level, c.block, sub.subject_code, sub.subject_name
                     FROM class_subject_assignments a JOIN academic_classes c ON c.id = a.class_id
                     JOIN subjects sub ON sub.id = a.subject_id
                     WHERE a.id = ? AND a.professor_user_id = ? AND a.active = 1'
                );
                $assignment->execute([$assignmentId, $professor['id']]);
                $selected = $assignment->fetch();
                if (!$selected) respond(['error' => 'This class and subject are not assigned to you.'], 403);
                $students = $pdo->prepare(
                        'SELECT sse.id AS enrollment_id, u.ccdi_id, s.last_name, s.first_name, s.middle_name,
                            g.prelim, g.midterm, g.prefinal, g.final,
                            CASE WHEN g.prelim IS NULL OR g.midterm IS NULL OR g.prefinal IS NULL OR g.final IS NULL
                                  OR w.prelim_weight IS NULL OR w.midterm_weight IS NULL OR w.prefinal_weight IS NULL OR w.final_weight IS NULL
                             THEN NULL ELSE ROUND(g.prelim * w.prelim_weight / 100 + g.midterm * w.midterm_weight / 100
                                  + g.prefinal * w.prefinal_weight / 100 + g.final * w.final_weight / 100, 2) END AS total,
                            g.is_published
                     FROM student_subject_enrollments sse
                     JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
                     JOIN users u ON u.id = ce.student_user_id AND u.status = "active"
                     JOIN students s ON s.user_id = u.id
                     LEFT JOIN assignment_grades g ON g.student_subject_enrollment_id = sse.id
                     LEFT JOIN grade_weight_config w ON w.id = 1
                     WHERE sse.assignment_id = ? AND sse.status = "active" AND ce.status = "active"
                     ORDER BY s.last_name, s.first_name, s.middle_name'
                );
                $students->execute([$assignmentId]);
                $weights = $pdo->query('SELECT prelim_weight, midterm_weight, prefinal_weight, final_weight FROM grade_weight_config WHERE id = 1')->fetch();
                respond(['assignment' => $selected, 'students' => $students->fetchAll(), 'weights' => $weights]);
            }

            if ($action === 'grades') {
        $user = require_user();
        if ($user['role'] === 'student') {
                        $statement = $pdo->prepare(
                                  'SELECT sub.subject_code, sub.subject_name, p.display_name AS instructor,
                                               c.course, c.year_level, c.block, g.prelim, g.midterm, g.prefinal, g.final,
                                               CASE WHEN g.prelim IS NULL OR g.midterm IS NULL OR g.prefinal IS NULL OR g.final IS NULL
                                                       OR w.prelim_weight IS NULL OR w.midterm_weight IS NULL OR w.prefinal_weight IS NULL OR w.final_weight IS NULL
                                                   THEN NULL ELSE ROUND(g.prelim * w.prelim_weight / 100 + g.midterm * w.midterm_weight / 100
                                                       + g.prefinal * w.prefinal_weight / 100 + g.final * w.final_weight / 100, 2) END AS total,
                                                g.id AS grade_record_id, g.is_published, sse.status AS enrollment_status
                                 FROM student_class_enrollments ce
                                 JOIN academic_classes c ON c.id = ce.class_id
                                 JOIN student_subject_enrollments sse ON sse.class_enrollment_id = ce.id
                                 JOIN class_subject_assignments a ON a.id = sse.assignment_id
                                 JOIN subjects sub ON sub.id = a.subject_id
                                 JOIN users p ON p.id = a.professor_user_id
                                 LEFT JOIN assignment_grades g ON g.student_subject_enrollment_id = sse.id AND g.is_published = 1
                                 LEFT JOIN grade_weight_config w ON w.id = 1
                                 WHERE ce.student_user_id = ?
                                     AND ((ce.status = "active" AND sse.status = "active") OR g.id IS NOT NULL)
                                 ORDER BY c.course, c.year_level, c.block, sub.subject_code'
                        );
                        $statement->execute([$user['id']]);
                } elseif ($user['role'] === 'professor') {
            $statement = $pdo->prepare(
                'SELECT u.student_number, CONCAT(s.first_name, " ", s.last_name) AS student_name,
                        sub.subject_code, sub.subject_name, p.display_name AS instructor,
                        g.prelim, g.midterm, g.prefinal, g.final, g.total, g.is_published
                 FROM assignment_grades g
                 JOIN student_subject_enrollments sse ON sse.id = g.student_subject_enrollment_id
                 JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
                 JOIN users u ON u.id = ce.student_user_id
                 JOIN students s ON s.user_id = u.id
                 JOIN class_subject_assignments a ON a.id = sse.assignment_id
                 JOIN subjects sub ON sub.id = a.subject_id
                 JOIN users p ON p.id = a.professor_user_id
                 WHERE a.professor_user_id = ? AND a.active = 1 AND sse.status = "active" AND ce.status = "active"
                 ORDER BY s.last_name, s.first_name, sub.subject_code'
            );
            $statement->execute([$user['id']]);
        } else {
            $statement = $pdo->query(
                'SELECT u.student_number, CONCAT(s.first_name, " ", s.last_name) AS student_name, g.subject_code, g.subject_name, g.instructor, g.prelim, g.midterm, g.prefinal, g.final, g.is_published
                 FROM grades g JOIN users u ON u.id = g.student_id JOIN students s ON s.user_id = u.id ORDER BY s.last_name, g.subject_code'
            );
        }
        respond(['grades' => $statement->fetchAll()]);
    }

    if ($action === 'enrollment_fee') {
        $amount = $pdo->query('SELECT amount FROM enrollment_fee_config WHERE id = 1')->fetchColumn();
        if ($amount === false) {
            respond(['error' => 'The enrollment fee is not configured.'], 503);
        }
        respond(['amount' => (float)$amount]);
    }

    if ($action === 'enrollment_payments') {
        require_user(['admin']);
        $payments = $pdo->query(
            'SELECT ep.id, ep.reference, ep.method, ep.amount, ep.status, ep.created_at,
                    u.student_number, s.first_name, s.last_name
             FROM enrollment_payments ep JOIN users u ON u.id = ep.user_id
             JOIN students s ON s.user_id = u.id ORDER BY ep.created_at DESC'
        );
        respond(['payments' => $payments->fetchAll()]);
    }

    if ($action === 'schedule') {
        $user = require_user();
        if ($user['role'] === 'student' && empty($_GET['all'])) {
            $statement = $pdo->prepare(
                'SELECT sc.* FROM schedules sc JOIN students s ON s.course = sc.course AND s.year_level = sc.year_level AND s.block = sc.block WHERE s.user_id = ? AND sc.is_published = 1 ORDER BY FIELD(sc.day, "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"), sc.class_time'
            );
            $statement->execute([$user['id']]);
        } else {
            $statement = $pdo->query('SELECT * FROM schedules WHERE is_published = 1 ORDER BY course, year_level, block, subject_code');
        }
        respond(['schedules' => $statement->fetchAll()]);
    }

    if ($action === 'tuition') {
        $user = require_user();
        if ($user['role'] === 'student') {
            $terms = $pdo->prepare(
                'SELECT t.id, t.school_year, t.name, t.due_date, t.amount, p.id AS payment_id, p.reference, p.method, p.status, p.created_at AS payment_date
                 FROM tuition_terms t LEFT JOIN tuition_payments p ON p.term_id = t.id AND p.user_id = ?
                 ORDER BY t.due_date'
            );
            $terms->execute([$user['id']]);
        } else {
            $terms = $pdo->query(
                'SELECT t.id, t.school_year, t.name, t.due_date, t.amount, p.id AS payment_id, p.reference, p.method, p.status, p.created_at AS payment_date, u.student_number, s.first_name, s.last_name
                 FROM tuition_terms t LEFT JOIN tuition_payments p ON p.term_id = t.id LEFT JOIN users u ON u.id = p.user_id LEFT JOIN students s ON s.user_id = u.id
                 ORDER BY t.due_date'
            );
        }
        respond(['terms' => $terms->fetchAll()]);
    }

    if ($action === 'products') {
        require_user();
        $products = $pdo->query('SELECT sku, name, description, price, image, sizes FROM products WHERE active = 1 ORDER BY id');
        respond(['products' => $products->fetchAll()]);
    }

    if ($action === 'orders') {
        $user = require_user();
        $statement = $user['role'] === 'admin'
            ? $pdo->query('SELECT o.id, o.reference, o.total, o.status, o.payment_method, o.created_at, u.student_number FROM shop_orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC')
            : $pdo->prepare('SELECT id, reference, total, status, payment_method, created_at FROM shop_orders WHERE user_id = ? ORDER BY created_at DESC');
        if ($statement instanceof PDOStatement && $user['role'] !== 'admin') {
            $statement->execute([$user['id']]);
        }
        respond(['orders' => $statement->fetchAll()]);
    }

    if ($action === 'payment_receipt') {
        $user = require_user();
        $reference = required_string($_GET, 'id', 40);
        $statement = $pdo->prepare(
            'SELECT p.reference, p.method, p.amount, p.status, p.created_at, t.name AS term, t.school_year,
                    CONCAT(s.first_name, " ", s.last_name) AS student_name
             FROM tuition_payments p JOIN tuition_terms t ON t.id = p.term_id JOIN students s ON s.user_id = p.user_id
             WHERE p.reference = ? AND (? = "admin" OR p.user_id = ?)'
        );
        $statement->execute([$reference, $user['role'], $user['id']]);
        $payment = $statement->fetch();
        if (!$payment) {
            respond(['error' => 'No tuition payment request was found.'], 404);
        }
        respond(['payment' => $payment]);
    }

    if ($action === 'order_detail') {
        $user = require_user();
        $reference = required_string($_GET, 'id', 40);
        $statement = $pdo->prepare(
            'SELECT o.id, o.reference, o.payment_method, o.total, o.status, o.created_at,
                    CONCAT(s.first_name, " ", s.last_name) AS student_name
             FROM shop_orders o JOIN students s ON s.user_id = o.user_id
             WHERE o.reference = ? AND (? = "admin" OR o.user_id = ?)'
        );
        $statement->execute([$reference, $user['role'], $user['id']]);
        $order = $statement->fetch();
        if (!$order) {
            respond(['error' => 'No shop order was found.'], 404);
        }
        $items = $pdo->prepare('SELECT product_name, size, price FROM shop_order_items WHERE order_id = ? ORDER BY id');
        $items->execute([$order['id']]);
        $order['items'] = $items->fetchAll();
        respond(['order' => $order]);
    }

    respond(['error' => 'Unknown API action.'], 404);
} catch (PDOException $error) {
    error_log('CCDI database error: ' . $error->getMessage());
    respond(['error' => 'The database request failed. Check the database configuration and try again.'], 500);
} catch (Throwable $error) {
    error_log('CCDI API error: ' . $error->getMessage());
    respond(['error' => 'The server could not complete this request.'], 500);
}

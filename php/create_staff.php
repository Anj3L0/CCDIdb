<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';

if (PHP_SAPI !== 'cli' || $argc !== 5) {
    fwrite(STDERR, "Usage: php create_staff.php <professor|admin> <email> <password> <display-name>\n");
    exit(1);
}

$role = $argv[1];
$email = filter_var($argv[2], FILTER_VALIDATE_EMAIL);
$password = $argv[3];
$displayName = trim($argv[4]);

if (!in_array($role, ['professor', 'admin'], true) || !$email || strlen($password) < 8 || $displayName === '') {
    fwrite(STDERR, "Role must be professor or admin; use a valid email, a password of at least 8 characters, and a display name.\n");
    exit(1);
}

$pdo = database_connection();
$pdo->beginTransaction();
$statement = $pdo->prepare('INSERT INTO users (email, password_hash, display_name, role) VALUES (?, ?, ?, ?)');
$statement->execute([$email, password_hash($password, PASSWORD_DEFAULT), $displayName, $role]);
$userId = (int)$pdo->lastInsertId();
$ccdiId = sprintf('CCDI-%s-%08d', strtoupper($role), $userId);
$pdo->prepare('UPDATE users SET ccdi_id = ? WHERE id = ?')->execute([$ccdiId, $userId]);
if ($role === 'professor') {
    $nameParts = preg_split('/\s+/', $displayName, 2) ?: [$displayName];
    $pdo->prepare('INSERT INTO professors (user_id, first_name, last_name) VALUES (?, ?, ?)')
        ->execute([$userId, $nameParts[0], $nameParts[1] ?? null]);
}
$pdo->commit();
fwrite(STDOUT, sprintf("Created %s account for %s. Display name: %s\n", $role, $email, $displayName));

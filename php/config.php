<?php
declare(strict_types=1);

function database_connection(): PDO
{
    static $connection = null;

    if ($connection instanceof PDO) {
        return $connection;
    }

    $host = getenv('CCDI_DB_HOST') ?: '127.0.0.1';
    $database = getenv('CCDI_DB_NAME') ?: 'ccdi_edu';
    $username = getenv('CCDI_DB_USER') ?: 'root';
    $password = getenv('CCDI_DB_PASSWORD') ?: '';
    $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $host, $database);

    $connection = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $connection;
}

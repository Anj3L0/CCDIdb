CREATE DATABASE IF NOT EXISTS ccdi_edu
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
USE ccdi_edu;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_number VARCHAR(40) NULL UNIQUE,
  ccdi_id VARCHAR(40) NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(200) NULL,
  role ENUM('student', 'professor', 'admin') NOT NULL DEFAULT 'student',
  status ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
  theme_preference ENUM('light', 'dark') NOT NULL DEFAULT 'light',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

ALTER TABLE users ADD COLUMN IF NOT EXISTS ccdi_id VARCHAR(40) NULL UNIQUE AFTER student_number;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference ENUM('light', 'dark') NOT NULL DEFAULT 'light' AFTER status;
UPDATE users SET ccdi_id = student_number WHERE ccdi_id IS NULL AND student_number IS NOT NULL;
UPDATE users SET ccdi_id = CONCAT('CCDI-', UPPER(role), '-', LPAD(id, 8, '0')) WHERE ccdi_id IS NULL;

CREATE TABLE IF NOT EXISTS students (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  first_name VARCHAR(100) NOT NULL,
  middle_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NOT NULL,
  birthday DATE NULL,
  sex VARCHAR(30) NOT NULL,
  phone VARCHAR(40) NOT NULL,
  address VARCHAR(500) NOT NULL,
  previous_school VARCHAR(200) NOT NULL,
  course VARCHAR(150) NOT NULL,
  year_level VARCHAR(30) NOT NULL,
  block VARCHAR(5) NOT NULL DEFAULT 'A',
  guardian VARCHAR(200) NOT NULL,
  entrance_fee_confirmed TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT fk_students_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS professors (
  user_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  first_name VARCHAR(100) NULL,
  middle_name VARCHAR(100) NULL,
  last_name VARCHAR(100) NULL,
  birthday DATE NULL,
  civil_status VARCHAR(40) NULL,
  phone VARCHAR(40) NULL,
  address VARCHAR(500) NULL,
  employment_status VARCHAR(40) NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_professors_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

INSERT IGNORE INTO professors (user_id, first_name, last_name)
SELECT id,
       NULLIF(SUBSTRING_INDEX(TRIM(display_name), ' ', 1), ''),
       CASE WHEN LOCATE(' ', TRIM(display_name)) > 0
            THEN NULLIF(TRIM(SUBSTRING(TRIM(display_name), LOCATE(' ', TRIM(display_name)) + 1)), '')
            ELSE NULL END
FROM users WHERE role = 'professor';

CREATE TABLE IF NOT EXISTS professor_invitation_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_by BIGINT UNSIGNED NULL,
  used_at DATETIME NULL,
  revoked_by BIGINT UNSIGNED NULL,
  revoked_at DATETIME NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_professor_invites_active (expires_at, used_at, revoked_at),
  CONSTRAINT fk_professor_invites_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_professor_invites_used_by FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_professor_invites_revoked_by FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS professor_invite_attempts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  ip_hash CHAR(64) NOT NULL,
  attempted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_invite_attempts_ip_time (ip_hash, attempted_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS announcements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  announcement_date DATE NULL,
  audience ENUM('students', 'professors', 'both') NOT NULL DEFAULT 'both',
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  attachment_url VARCHAR(1000) NULL,
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_announcements_visibility (status, audience, created_at),
  CONSTRAINT fk_announcements_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_announcements_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS announcement_date DATE NULL AFTER content;
UPDATE announcements SET announcement_date = DATE(created_at) WHERE announcement_date IS NULL;

CREATE TABLE IF NOT EXISTS meetings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  meeting_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  location VARCHAR(200) NOT NULL DEFAULT '',
  meeting_link VARCHAR(1000) NULL,
  audience ENUM('students', 'professors', 'both') NOT NULL DEFAULT 'both',
  status ENUM('draft', 'published') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NOT NULL,
  updated_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_meetings_visibility (status, audience, meeting_date, start_time),
  CONSTRAINT fk_meetings_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_meetings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

ALTER TABLE students ADD COLUMN IF NOT EXISTS birthday DATE NULL AFTER last_name;

CREATE TABLE IF NOT EXISTS enrollment_fee_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  amount DECIMAL(10,2) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT IGNORE INTO enrollment_fee_config (id, amount) VALUES (1, 500.00);

CREATE TABLE IF NOT EXISTS enrollment_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  reference VARCHAR(40) NOT NULL UNIQUE,
  method VARCHAR(40) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  UNIQUE KEY uq_enrollment_payment_user (user_id),
  CONSTRAINT fk_enrollment_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grades (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_id BIGINT UNSIGNED NOT NULL,
  subject_code VARCHAR(30) NOT NULL,
  subject_name VARCHAR(150) NOT NULL,
  instructor VARCHAR(150) NOT NULL DEFAULT '',
  prelim DECIMAL(4,2) NULL,
  midterm DECIMAL(4,2) NULL,
  prefinal DECIMAL(4,2) NULL,
  final DECIMAL(4,2) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_grade_student_subject (student_id, subject_code),
  CONSTRAINT fk_grades_student FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS schedules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course VARCHAR(150) NOT NULL,
  year_level VARCHAR(30) NOT NULL,
  block VARCHAR(5) NOT NULL,
  subject_code VARCHAR(30) NOT NULL,
  subject_name VARCHAR(150) NOT NULL,
  units TINYINT UNSIGNED NOT NULL,
  day VARCHAR(15) NOT NULL,
  class_time VARCHAR(50) NOT NULL,
  room VARCHAR(50) NOT NULL,
  instructor VARCHAR(150) NOT NULL DEFAULT '',
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_schedule_student_group (course, year_level, block, is_published)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS academic_classes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  course VARCHAR(150) NOT NULL,
  year_level VARCHAR(30) NOT NULL,
  block VARCHAR(5) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_academic_class_section (course, year_level, block)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS subjects (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  subject_code VARCHAR(30) NOT NULL,
  subject_name VARCHAR(150) NOT NULL,
  units TINYINT UNSIGNED NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_subject_code_name (subject_code, subject_name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS class_subject_assignments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_id BIGINT UNSIGNED NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL,
  professor_user_id BIGINT UNSIGNED NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_subject_assignment (class_id, subject_id),
  KEY idx_assignment_professor (professor_user_id, active),
  CONSTRAINT fk_assignment_class FOREIGN KEY (class_id) REFERENCES academic_classes(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_subject FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_professor FOREIGN KEY (professor_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_class_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_user_id BIGINT UNSIGNED NOT NULL,
  class_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active', 'withdrawn') NOT NULL DEFAULT 'active',
  enrolled_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_class_enrollment (student_user_id, class_id),
  KEY idx_class_enrollment_active (class_id, status),
  CONSTRAINT fk_student_class_user FOREIGN KEY (student_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_student_class_class FOREIGN KEY (class_id) REFERENCES academic_classes(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS student_subject_enrollments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  class_enrollment_id BIGINT UNSIGNED NOT NULL,
  assignment_id BIGINT UNSIGNED NOT NULL,
  status ENUM('active', 'dropped', 'withdrawn') NOT NULL DEFAULT 'active',
  drop_reason VARCHAR(1000) NULL,
  dropped_by BIGINT UNSIGNED NULL,
  dropped_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_student_subject_enrollment (class_enrollment_id, assignment_id),
  KEY idx_subject_enrollment_assignment (assignment_id, status),
  CONSTRAINT fk_subject_enrollment_class FOREIGN KEY (class_enrollment_id) REFERENCES student_class_enrollments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subject_enrollment_assignment FOREIGN KEY (assignment_id) REFERENCES class_subject_assignments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_subject_enrollment_drop_actor FOREIGN KEY (dropped_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grade_weight_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  prelim_weight DECIMAL(5,2) NULL,
  midterm_weight DECIMAL(5,2) NULL,
  prefinal_weight DECIMAL(5,2) NULL,
  final_weight DECIMAL(5,2) NULL,
  updated_by BIGINT UNSIGNED NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_grade_weights_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO grade_weight_config (id) VALUES (1);

CREATE TABLE IF NOT EXISTS assignment_grades (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  student_subject_enrollment_id BIGINT UNSIGNED NOT NULL UNIQUE,
  prelim DECIMAL(4,2) NULL,
  midterm DECIMAL(4,2) NULL,
  prefinal DECIMAL(4,2) NULL,
  final DECIMAL(4,2) NULL,
  total DECIMAL(5,2) NULL,
  is_published TINYINT(1) NOT NULL DEFAULT 0,
  saved_by BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_assignment_grade_enrollment FOREIGN KEY (student_subject_enrollment_id) REFERENCES student_subject_enrollments(id) ON DELETE RESTRICT,
  CONSTRAINT fk_assignment_grade_saved_by FOREIGN KEY (saved_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS grade_change_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  assignment_grade_id BIGINT UNSIGNED NOT NULL,
  changed_by BIGINT UNSIGNED NOT NULL,
  old_values JSON NOT NULL,
  new_values JSON NOT NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_grade_history_grade (assignment_grade_id, changed_at),
  CONSTRAINT fk_grade_history_grade FOREIGN KEY (assignment_grade_id) REFERENCES assignment_grades(id) ON DELETE RESTRICT,
  CONSTRAINT fk_grade_history_actor FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

INSERT IGNORE INTO academic_classes (course, year_level, block)
SELECT DISTINCT course, year_level, block FROM schedules;

INSERT IGNORE INTO subjects (subject_code, subject_name, units)
SELECT subject_code, subject_name, MAX(units) FROM schedules GROUP BY subject_code, subject_name;

INSERT IGNORE INTO class_subject_assignments (class_id, subject_id, professor_user_id, created_by)
SELECT DISTINCT c.id, s.id, p.id, p.id
FROM schedules sc
JOIN academic_classes c ON c.course = sc.course AND c.year_level = sc.year_level AND c.block = sc.block
JOIN subjects s ON s.subject_code = sc.subject_code AND s.subject_name = sc.subject_name
JOIN users p ON p.role = 'professor' AND p.display_name = sc.instructor
WHERE sc.is_published = 1;

INSERT IGNORE INTO student_class_enrollments (student_user_id, class_id)
SELECT st.user_id, c.id
FROM students st
JOIN users u ON u.id = st.user_id AND u.role = 'student' AND u.status = 'active'
JOIN academic_classes c ON c.course = st.course AND c.year_level = st.year_level AND c.block = st.block;

INSERT IGNORE INTO student_subject_enrollments (class_enrollment_id, assignment_id)
SELECT ce.id, a.id
FROM student_class_enrollments ce
JOIN class_subject_assignments a ON a.class_id = ce.class_id AND a.active = 1
WHERE ce.status = 'active';

INSERT IGNORE INTO assignment_grades
  (student_subject_enrollment_id, prelim, midterm, prefinal, final, is_published, saved_by)
SELECT sse.id, g.prelim, g.midterm, g.prefinal, g.final, g.is_published, a.professor_user_id
FROM student_subject_enrollments sse
JOIN student_class_enrollments ce ON ce.id = sse.class_enrollment_id
JOIN class_subject_assignments a ON a.id = sse.assignment_id
JOIN subjects sub ON sub.id = a.subject_id
JOIN grades g ON g.student_id = ce.student_user_id AND g.subject_code = sub.subject_code;

CREATE TABLE IF NOT EXISTS tuition_terms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  school_year VARCHAR(15) NOT NULL,
  name VARCHAR(40) NOT NULL,
  due_date DATE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  UNIQUE KEY uq_tuition_year_term (school_year, name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tuition_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  term_id BIGINT UNSIGNED NOT NULL,
  reference VARCHAR(40) NOT NULL UNIQUE,
  method VARCHAR(40) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending', 'paid') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMP NULL,
  UNIQUE KEY uq_payment_student_term (user_id, term_id),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_payments_term FOREIGN KEY (term_id) REFERENCES tuition_terms(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(60) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(500) NOT NULL DEFAULT '',
  price DECIMAL(10,2) NOT NULL,
  image VARCHAR(255) NOT NULL DEFAULT '',
  sizes JSON NOT NULL,
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shop_orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  reference VARCHAR(40) NOT NULL UNIQUE,
  payment_method VARCHAR(40) NOT NULL,
  total DECIMAL(10,2) NOT NULL,
  status ENUM('submitted', 'paid', 'cancelled') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS shop_order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  product_name VARCHAR(150) NOT NULL,
  size VARCHAR(30) NOT NULL DEFAULT 'One size',
  price DECIMAL(10,2) NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES shop_orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
) ENGINE=InnoDB;

INSERT IGNORE INTO tuition_terms (school_year, name, due_date, amount) VALUES
  ('2026-2027', 'Prelim', '2026-10-15', 2200.00),
  ('2026-2027', 'Midterm', '2026-11-15', 2200.00),
  ('2026-2027', 'Pre-final', '2026-12-15', 2200.00),
  ('2026-2027', 'Final', '2027-01-15', 2200.00);

INSERT IGNORE INTO products (sku, name, description, price, image, sizes) VALUES
  ('mens-uniform', 'School Uniform for Men', 'Men''s campus uniform set.', 1250.00, 'image/Untitled design (2).png', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('womens-uniform-a', 'School Uniform for Women · Type A', 'Women''s campus uniform, Type A.', 1250.00, 'image/Untitled design.png', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('womens-uniform-b', 'School Uniform for Women · Type B', 'Women''s campus uniform, Type B.', 1250.00, 'image/Untitled design (1).png', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('bsoa-uniform', 'BSOA Department Uniform', 'Business Office Administration department uniform.', 950.00, 'image/products/bsoa-uniform.jpg', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('bscs-uniform', 'BSCS Department Uniform', 'Computer Science department uniform.', 950.00, 'image/products/bscs-uniform.jpg', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('bsis-uniform', 'BSIS Department Uniform', 'Information Systems department uniform.', 950.00, 'image/products/bsis-uniform.jpg', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('act-uniform', 'P.E Uniform', 'Associate in Computer Technology department uniform.', 950.00, 'image/Untitled design (3).png', JSON_ARRAY('XS', 'S', 'M', 'L', 'XL')),
  ('school-id', 'School ID', 'Student ID generated from enrollment information.', 180.00, 'image/products/school-id.jpg', JSON_ARRAY());

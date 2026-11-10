(() => {
  const tuitionTotal = 8800;
  let csrfToken = '';
  let apiUser = null;
  let apiSessionPromise = null;
  let databaseAnnouncements = [];
  let databaseMeetings = [];
  let professorAssignments = [];
  let selectedProfessorAssignment = null;
  let administratorClassData = null;
  let currentGradeWeights = null;

  function setTheme(theme, persist = true) {
    const selectedTheme = theme === 'dark' ? 'dark' : 'light';
    document.body?.classList.toggle('dark-theme', selectedTheme === 'dark');
    document.documentElement.dataset.theme = selectedTheme;
    if (persist) localStorage.setItem('ccdiTheme', selectedTheme);
    const selector = document.getElementById('themeSelect');
    if (selector) selector.value = selectedTheme;
  }

  function initializeTheme() {
    setTheme(localStorage.getItem('ccdiTheme') || 'light', false);
    document.getElementById('themeSelect')?.addEventListener('change', (event) => {
      setTheme(event.currentTarget.value);
      if (apiUser) {
        apiRequest('save_theme', 'POST', { theme: event.currentTarget.value })
          .catch((error) => showToast(error.message));
      }
    });
  }

  function loadApiSession() {
    if (!apiSessionPromise) {
      apiSessionPromise = fetch('php/api.php?action=session', { credentials: 'same-origin' })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Could not connect to the database service.');
          csrfToken = result.csrfToken;
          apiUser = result.user;
          if (apiUser?.theme) setTheme(apiUser.theme, false);
          if (result.profile) {
            localStorage.setItem('ccdiStudentProfile', JSON.stringify(result.profile));
            localStorage.setItem('ccdiStudentName', result.profile.name);
          }
          return result;
        })
        .catch((error) => {
          apiSessionPromise = null;
          throw error;
        });
    }
    return apiSessionPromise;
  }

  async function apiRequest(action, method = 'GET', data = null) {
    if (method !== 'GET' && !csrfToken) await loadApiSession();
    const headers = {};
    const isFormData = data instanceof FormData;
    if (data && !isFormData) headers['Content-Type'] = 'application/json';
    if (method !== 'GET') headers['X-CSRF-Token'] = csrfToken;
    const response = await fetch(`php/api.php?action=${action}`, {
      method,
      credentials: 'same-origin',
      headers,
      body: data ? (isFormData ? data : JSON.stringify(data)) : undefined
    });
    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('The server returned an invalid response. Check that PHP is running.');
    }
    if (!response.ok) throw new Error(result.error || 'The request could not be completed.');
    return result;
  }

  async function refreshEnrollmentFee() {
    const display = document.querySelector('[data-enrollment-fee]');
    if (!display) return;
    const result = await apiRequest('enrollment_fee');
    display.textContent = formatMoney(result.amount);
  }

  const tuitionTerms = [
    { name: 'Prelim', due: 'October 15, 2026', amount: 2200 },
    { name: 'Midterm', due: 'November 15, 2026', amount: 2200 },
    { name: 'Pre-final', due: 'December 15, 2026', amount: 2200 },
    { name: 'Final', due: 'January 15, 2027', amount: 2200 }
  ];
  let dbTuitionTerms = [];
  const studentSchedules = {
    '1-A': [
      ['ITE 101', 'IT Fundamentals', '3', '8:00 AM - 10:00 AM', 'MON', 'Room 101', 'Prof. Santos'],
      ['ITE 102', 'Web Development', '3', '10:30 AM - 12:30 PM', 'MON', 'Room 203', 'Prof. Reyes'],
      ['ITE 103', 'Database Systems', '3', '1:30 PM - 3:30 PM', 'TUE', 'Room 104', 'Prof. Cruz'],
      ['ITE 104', 'System Analysis & Design', '3', '8:00 AM - 10:00 AM', 'WED', 'Room 201', 'Prof. Santos'],
      ['ITE 105', 'Computer Networks', '3', '10:30 AM - 12:30 PM', 'THU', 'Room 102', 'Prof. Lim'],
      ['ITE 106', 'Mobile App Development', '3', '1:30 PM - 3:30 PM', 'FRI', 'Room 105', 'Prof. Dela Cruz']
    ],
    '2-A': [
      ['PATHFIT3', '(P.E. 3) Dance (Folk Dance)', '2', '7:30-10:30', 'MON', 'A2B', '—'],
      ['PT 101', 'Platform Technologies', '3', '10:30-1:30', 'MON', 'A2B', '—'],
      ['CC 105', 'Information Management', '3', '1:30-4:30', 'MON', 'A2B', '—'],
      ['PF 101', 'Object Oriented Programming', '1', '7:30-8:30', 'WED', '302', '—'],
      ['PF 101', 'Object Oriented Programming', '2', '9:30-11:30', 'WED', 'LAB 2', '—'],
      ['CC 104', 'Data Structure and Algorithm', '1', '12:30-1:30', 'WED', '302', '—'],
      ['CC 104', 'Data Structure and Algorithm', '2', '1:30-3:30', 'WED', 'LAB 1', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '2', '3:30-5:30', 'WED', 'LAB 1', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '1', '5:30-6:30', 'WED', '302', '—'],
      ['SOC SCI 1', 'Life and Works of Rizal', '3', '1:30-4:30', 'FRI', 'A3A', '—'],
      ['History 1', 'Readings in Philippine History', '3', '4:30-7:30', 'FRI', 'A3A', '—']
    ],
    '2-B': [
      ['CC 105', 'Information Management', '3', '10:30-1:30', 'MON', 'A2A', '—'],
      ['PT 101', 'Platform Technologies', '3', '1:30-4:30', 'MON', 'A2A', '—'],
      ['SOC SCI 1', 'Life and Works of Rizal', '3', '4:30-7:30', 'MON', 'A2A', '—'],
      ['CC 104', 'Data Structure and Algorithm', '2', '7:30-9:30', 'TUE', 'LAB 1', '—'],
      ['CC 104', 'Data Structure and Algorithm', '1', '9:30-10:30', 'TUE', '303', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '1', '3:30-4:30', 'TUE', '303', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '2', '5:30-7:30', 'TUE', 'LAB 1', '—'],
      ['History 1', 'Readings in Philippine History', '3', '10:30-1:30', 'THU', 'A3A', '—'],
      ['PF 101', 'Object Oriented Programming', '1', '2:30-3:30', 'THU', '303', '—'],
      ['PF 101', 'Object Oriented Programming', '2', '3:30-5:30', 'THU', 'LAB 2', '—'],
      ['PATHFIT3', '(P.E. 3) Dance (Folk Dance)', '2', '7:30-9:30', 'THU', 'A3-A', '—']
    ],
    '2-C': [
      ['PATHFIT3', '(P.E. 3) Dance (Folk Dance)', '2', '7:30-9:30', 'TUE', 'A2A', '—'],
      ['History 1', 'Readings in Philippine History', '3', '10:30-1:30', 'TUE', 'A2A', '—'],
      ['PF 101', 'Object Oriented Programming', '1', '2:30-3:30', 'TUE', '303', '—'],
      ['PF 101', 'Object Oriented Programming', '2', '3:30-5:30', 'TUE', 'LAB 1', '—'],
      ['PT 101', 'Platform Technologies', '3', '7:30-10:30', 'THU', 'A2A', '—'],
      ['CC 104', 'Data Structure and Algorithm', '1', '12:30-1:30', 'THU', '102', '—'],
      ['CC 104', 'Data Structure and Algorithm', '2', '1:30-3:30', 'THU', 'LAB 1', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '2', '3:30-5:30', 'THU', 'LAB 1', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '1', '5:30-6:30', 'THU', '302', '—'],
      ['CC 105', 'Information Management', '3', '1:30-4:30', 'SAT', '103', '—'],
      ['SOC SCI 1', 'Life and Works of Rizal', '3', '4:30-7:30', 'SAT', '103', '—']
    ],
    '2-D': [
      ['CC 104', 'Data Structure and Algorithm', '2', '7:30-9:30', 'TUE', 'LAB 1', '—'],
      ['CC 104', 'Data Structure and Algorithm', '1', '9:30-10:30', 'TUE', '302', '—'],
      ['PATHFIT3', '(P.E. 3) Dance (Folk Dance)', '2', '11:30-1:30', 'TUE', 'A2B', '—'],
      ['CC 105', 'Information Management', '3', '1:30-4:30', 'TUE', 'A2B', '—'],
      ['PT 101', 'Platform Technologies', '3', '4:30-7:30', 'TUE', 'A2B', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '2', '7:30-9:30', 'WED', 'LAB 1', '—'],
      ['HCI 102', 'Human Computer Interaction 2', '1', '9:30-10:30', 'WED', '302', '—'],
      ['PF 101', 'Object Oriented Programming', '1', '12:00-1:00', 'WED', '102', '—'],
      ['PF 101', 'Object Oriented Programming', '2', '1:30-3:30', 'WED', 'LAB 3', '—'],
      ['SOC SCI 1', 'Life and Works of Rizal', '3', '1:30-4:30', 'FRI', 'A2B', '—'],
      ['History 1', 'Readings in Philippine History', '3', '4:30-7:30', 'FRI', 'A2B', '—']
    ]
  };
  const databaseSchedules = {};

  function readRecords(key) {
    try {
      const records = JSON.parse(localStorage.getItem(key) || '[]');
      return Array.isArray(records) ? records : [];
    } catch {
      return [];
    }
  }

  function formatMoney(amount) {
    return `₱ ${Number(amount || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  function getStudentSchedule(profile) {
    const year = String(profile.year || '1st Year').match(/[1-4]/)?.[0] || '1';
    const block = String(profile.block || 'A').toUpperCase();
    const course = profile.course || 'BS Information Technology';
    const normalizedCourse = course.toLowerCase();
    const isBsit = normalizedCourse.includes('bsit') || normalizedCourse.includes('information technology');
    const databaseKey = `${normalizedCourse}|${year}|${block}`;
    return {
      year,
      block,
      course,
      rows: databaseSchedules[databaseKey] || (isBsit ? studentSchedules[`${year}-${block}`] || [] : [])
    };
  }

  function getStudentSubjects(profile) {
    const subjects = new Map();
    getStudentSchedule(profile).rows.forEach(([code, name, units, time, day, room, instructor]) => {
      const key = `${code}|${name}`;
      const subject = subjects.get(key);
      if (subject) {
        subject.units += Number(units || 0);
        subject.meetings.push({ time, day, room });
      } else {
        subjects.set(key, { code, name, units: Number(units || 0), instructor, meetings: [{ time, day, room }] });
      }
    });
    return [...subjects.values()];
  }

  function buildStudentCorMarkup(profile, includeActions = true, logoSource = 'image/CCDI EDU.png') {
    const studentSchedule = getStudentSchedule(profile);
    const subjects = getStudentSubjects(profile);
    const totalUnits = subjects.reduce((total, subject) => total + subject.units, 0);
    const subjectRows = subjects.length
      ? subjects.map((subject) => {
        const meetings = subject.meetings
          .map((meeting) => `${escapeHtml(meeting.day)} ${escapeHtml(meeting.time)}${meeting.room ? ` · ${escapeHtml(meeting.room)}` : ''}`)
          .join('<br>');
        return `<tr><td>${escapeHtml(subject.code)}</td><td>${escapeHtml(subject.name)}</td><td>${escapeHtml(subject.units)}</td><td>${meetings}</td><td>${escapeHtml(subject.instructor)}</td></tr>`;
      }).join('')
      : '<tr><td colspan="5" class="muted">No registered subjects are available for this course, year, and block.</td></tr>';
    const installments = tuitionTerms.map((term) => `<div><span>${term.name}</span><strong>${formatMoney(term.amount)}</strong><small>Due ${term.due}</small></div>`).join('');
    const actions = includeActions
      ? '<div class="cor-document-actions"><button class="btn btn-outline" type="button" onclick="downloadCor()">Download COR</button><button class="btn btn-primary" type="button" onclick="window.print()">Print / Save PDF</button></div>'
      : '';
    return `<article class="cor-document"><header class="cor-document-header"><img src="${escapeHtml(logoSource)}" alt="CCDI EDU"><div><span>COMPUTER COMMUNICATION DEVELOPMENT INSTITUTE</span><h2>Certificate of Registration</h2><p>College Department · 1st Semester · AY 2026-2027</p></div></header><div class="cor-student-details"><div><small>Student Name</small><strong>${escapeHtml(profile.name || 'Rene Batterbonia')}</strong></div><div><small>Student Number</small><strong>${escapeHtml(profile.studentNumber || 'CCDI-2026-0001')}</strong></div><div><small>Course / Program</small><strong>${escapeHtml(studentSchedule.course)}</strong></div><div><small>Year and Block</small><strong>${escapeHtml(profile.year || '1st Year')} · Block ${escapeHtml(studentSchedule.block)}</strong></div></div><div class="cor-document-section"><div class="cor-document-section-title"><h3>Registered Subjects</h3><span>Total units: ${totalUnits}</span></div><div class="table-wrap"><table><thead><tr><th>Subject Code</th><th>Description</th><th>Units</th><th>Schedule / Room</th><th>Instructor</th></tr></thead><tbody>${subjectRows}</tbody></table></div></div><div class="cor-document-fees"><div class="cor-document-section-title"><h3>Tuition Fee Summary</h3><span>Total assessment: ${formatMoney(tuitionTotal)}</span></div><div class="cor-installments">${installments}</div></div><p class="cor-document-note">Student copy · Verify enrollment and fee details with the Registrar.</p>${actions}</article>`;
  }

  function enrollmentBlock(index) {
    let block = '';
    let remaining = index;
    do {
      block = String.fromCharCode(65 + (remaining % 26)) + block;
      remaining = Math.floor(remaining / 26) - 1;
    } while (remaining >= 0);
    return block;
  }

  function renderStudentSubjects(profile) {
    const subjects = getStudentSubjects(profile);
    document.querySelectorAll('#corSubjectRows').forEach((corRows) => {
      corRows.innerHTML = subjects.length
        ? subjects.map((subject) => `<tr><td>${escapeHtml(subject.code)}</td><td>${escapeHtml(subject.name)}</td><td>${escapeHtml(subject.instructor)}</td><td>${escapeHtml(subject.units)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="muted">No registered subjects are available for this course, year, and block.</td></tr>';
    });
  }

  const gradeTerms = ['prelim', 'midterm', 'prefinal', 'final'];
  const gradeTermLabels = { prelim: 'Prelim', midterm: 'Midterm', prefinal: 'Pre-final', final: 'Final' };

  function getIT2DGradeRecord() {
    const studentNumber = document.getElementById('angeloStudentNumber')?.value.trim();
    return studentNumber
      ? readRecords('ccdiStudentGrades').find((record) => record.studentNumber === studentNumber)
      : null;
  }

  function formatTermGrade(value) {
    return value === '' || value == null ? '-' : Number(value).toFixed(2);
  }

  function renderIT2DGrades() {
    const inputRows = document.getElementById('angeloGradeRows');
    const previewRows = document.getElementById('angeloPublishedGradeRows');
    if (!inputRows || !previewRows) return;

    const record = getIT2DGradeRecord();
    const subjects = new Map();
    (studentSchedules['2-D'] || []).forEach(([code, name]) => {
      if (!subjects.has(code)) subjects.set(code, name);
    });
    inputRows.innerHTML = [...subjects].map(([code, name]) => {
      const grades = record?.subjects?.[code] || {};
      const fields = gradeTerms.map((term) => `<td><input class="grade-input" type="number" min="0" max="5" step="0.01" inputmode="decimal" aria-label="${escapeHtml(name)} ${gradeTermLabels[term]} grade" data-grade-code="${escapeHtml(code)}" data-grade-term="${term}" value="${grades[term] ?? ''}"></td>`).join('');
      return `<tr><td>${escapeHtml(code)}</td><td>${escapeHtml(name)}</td>${fields}</tr>`;
    }).join('');

    const published = record?.publishedSubjects || {};
    previewRows.innerHTML = [...subjects].map(([code, name]) => {
      const grades = published[code];
      const fields = gradeTerms.map((term) => `<td>${formatTermGrade(grades?.[term])}</td>`).join('');
      const hasGrades = grades && gradeTerms.some((term) => grades[term] !== '' && grades[term] != null);
      return `<tr><td>${escapeHtml(code)}</td><td>${escapeHtml(name)}</td>${fields}<td>${hasGrades ? 'Published' : 'Awaiting Release'}</td></tr>`;
    }).join('');

    const isPublished = record?.publishedAt
      && JSON.stringify(record.subjects || {}) === JSON.stringify(record.publishedSubjects || {});
    const status = document.getElementById('angeloGradeStatus');
    if (status) {
      status.textContent = isPublished ? 'Published' : record?.savedAt ? 'Draft saved' : 'Draft changes';
      status.className = `badge ${isPublished ? 'badge-success' : 'badge-warning'}`;
    }
  }

  function collectIT2DGrades() {
    const subjects = {};
    document.querySelectorAll('#angeloGradeRows input[data-grade-code]').forEach((input) => {
      input.setCustomValidity('');
      const value = input.value.trim();
      if (value === '') return;
      const grade = Number(value);
      if (!Number.isFinite(grade) || grade < 0 || grade > 5 || Math.round(grade * 100) !== grade * 100) {
        input.setCustomValidity('Enter a grade from 0.00 to 5.00 with up to two decimal places.');
        input.reportValidity();
        throw new Error('Please correct the highlighted grade before saving.');
      }
      input.setCustomValidity('');
      subjects[input.dataset.gradeCode] ||= {};
      subjects[input.dataset.gradeCode][input.dataset.gradeTerm] = Number(grade.toFixed(2));
    });
    return subjects;
  }

  async function loadIT2DGrades(event) {
    event?.preventDefault();
    const studentNumber = document.getElementById('angeloStudentNumber')?.value.trim();
    if (!studentNumber) {
      showToast('Enter the student CCDI ID first.');
      return;
    }
    renderIT2DGrades();
    try {
      const result = await apiRequest('grades');
      const matches = result.grades.filter((grade) => grade.student_number === studentNumber);
      if (!matches.length) {
        renderIT2DGrades();
        showToast('No grade records were found for this student yet.');
        return;
      }
      const subjects = {};
      const publishedSubjects = {};
      matches.forEach((grade) => {
        subjects[grade.subject_code] = {
          prelim: grade.prelim,
          midterm: grade.midterm,
          prefinal: grade.prefinal,
          final: grade.final
        };
        if (Number(grade.is_published)) publishedSubjects[grade.subject_code] = subjects[grade.subject_code];
      });
      const records = readRecords('ccdiStudentGrades').filter((record) => record.studentNumber !== studentNumber);
      records.push({
        studentNumber,
        studentName: matches[0].student_name,
        subjects,
        publishedSubjects,
        publishedAt: matches.every((grade) => Number(grade.is_published)) ? new Date().toISOString() : null,
        savedAt: new Date().toISOString()
      });
      localStorage.setItem('ccdiStudentGrades', JSON.stringify(records));
      renderIT2DGrades();
      showToast(`Grades loaded for ${matches[0].student_name}.`);
    } catch (error) {
      showToast(error.message);
    }
  }

  async function saveIT2DGradeRecord(publish) {
    const studentNumber = document.getElementById('angeloStudentNumber')?.value.trim();
    if (!studentNumber) {
      showToast('Enter the student CCDI ID first.');
      return;
    }
    const subjects = collectIT2DGrades();
    const subjectNames = new Map();
    (studentSchedules['2-D'] || []).forEach(([code, name]) => subjectNames.set(code, name));
    const gradeEntries = Object.entries(subjects).map(([subjectCode, grades]) => ({
      subjectCode,
      subjectName: subjectNames.get(subjectCode) || subjectCode,
      instructor: 'Prof. Ynna',
      ...Object.fromEntries(gradeTerms.map((term) => [term, grades[term] ?? '']))
    }));
    if (!gradeEntries.length) {
      showToast('Enter at least one grade before saving.');
      return;
    }
    try {
      await apiRequest('save_grade_set', 'POST', { studentNumber, subjects: gradeEntries, published: publish });
      const records = readRecords('ccdiStudentGrades').filter((record) => record.studentNumber !== studentNumber);
      const previous = getIT2DGradeRecord();
      const savedAt = new Date().toISOString();
      const savedSubjects = Object.fromEntries(gradeEntries.map((entry) => [
        entry.subjectCode,
        Object.fromEntries(gradeTerms.map((term) => [term, entry[term] === '' ? null : entry[term]]))
      ]));
      const publishedSubjects = { ...(previous?.publishedSubjects || {}) };
      Object.entries(savedSubjects).forEach(([subjectCode, grades]) => {
        if (publish) publishedSubjects[subjectCode] = grades;
        else delete publishedSubjects[subjectCode];
      });
      records.push({
        ...previous,
        studentNumber,
        subjects: { ...(previous?.subjects || {}), ...savedSubjects },
        publishedSubjects,
        publishedAt: publish ? savedAt : previous?.publishedAt || null,
        savedAt
      });
      localStorage.setItem('ccdiStudentGrades', JSON.stringify(records));
      renderIT2DGrades();
      showToast(publish ? 'Grades published to the student account.' : 'Grade draft saved to the database.');
    } catch (error) {
      showToast(error.message);
    }
  }

  function getPublishedStudentGrades(profile, subjectCode) {
    const profileName = String(profile.name || '').toLowerCase().match(/[a-z]+/g) || [];
    const profileIdentity = profileName.length >= 2 ? `${profileName[0]} ${profileName[profileName.length - 1]}` : '';
    if (!profileIdentity) return null;

    const profileYear = String(profile.year || '').match(/[1-4]/)?.[0] || '1';
    const profileBlock = String(profile.block || 'A').toUpperCase();
    const isBsit = /bsit|information technology/i.test(String(profile.course || ''));
    if (!isBsit) return null;

    const record = readRecords('ccdiStudentGrades').find((item) => {
      const nameParts = String(item.studentName || '').toLowerCase().match(/[a-z]+/g) || [];
      const identity = nameParts.length >= 2 ? `${nameParts[0]} ${nameParts[nameParts.length - 1]}` : '';
      return identity === profileIdentity
        && String(item.year) === profileYear
        && String(item.block || '').toUpperCase() === profileBlock;
    });
    const grades = record?.publishedSubjects?.[subjectCode]
      ?? (record?.publishedAt ? record?.subjects?.[subjectCode] : null);
    return grades && gradeTerms.some((term) => grades[term] !== '' && grades[term] != null) ? grades : null;
  }

  function renderTuition() {
    const payments = readRecords('ccdiTuitionPayments');
    const paid = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const remaining = Math.max(0, tuitionTotal - paid);
    document.querySelectorAll('[data-total-payment], [data-payment-total]').forEach((node) => { node.textContent = formatMoney(tuitionTotal); });
    document.querySelectorAll('[data-paid-payment], [data-payment-paid]').forEach((node) => { node.textContent = formatMoney(paid); });
    document.querySelectorAll('[data-remaining-payment], [data-payment-balance], [data-payment-remaining]').forEach((node) => { node.textContent = formatMoney(remaining); });

    const periods = document.getElementById('paymentPeriods');
    if (periods) {
      periods.innerHTML = tuitionTerms.map((term) => {
        const receipt = payments.find((payment) => payment.term === term.name);
        return `<article class="payment-period ${receipt ? 'is-paid' : ''}"><div><span class="period-label">${term.name} payment</span><strong>${formatMoney(term.amount)}</strong><small>Due ${term.due}</small></div><div class="payment-period-action">${receipt ? `<span class="badge badge-success">Paid</span><button class="btn btn-outline" type="button" data-receipt-id="${receipt.id}">View receipt</button>` : `<button class="btn btn-primary" type="button" data-pay-term="${term.name}">Pay ${term.name}</button>`}</div></article>`;
      }).join('');
    }

    const history = document.getElementById('paymentHistory');
    if (history) {
      history.innerHTML = payments.length ? [...payments].reverse().map((payment) => `<tr><td>${payment.term}</td><td>${new Date(payment.date).toLocaleDateString()}</td><td>${payment.method}</td><td>${formatMoney(payment.amount)}</td><td><button class="text-link" type="button" data-receipt-id="${payment.id}">View receipt</button></td></tr>`).join('') : '<tr><td colspan="5" class="muted">No tuition payments recorded yet.</td></tr>';
    }
  }

  function renderTuitionReceipt() {
    const target = document.getElementById('tuitionReceipt');
    if (!target) return;
    const id = new URLSearchParams(window.location.search).get('id');
    const payment = readRecords('ccdiTuitionPayments').find((record) => record.id === id);
    if (!payment) {
      target.innerHTML = '<h1>Receipt unavailable</h1><p>No matching tuition payment was found in this browser.</p><a class="btn btn-primary" href="payments.html">Return to Tuition</a>';
      return;
    }
    target.innerHTML = `<span class="eyebrow">CCDI EDU · PAYMENT RECEIPT</span><h1>Tuition payment received</h1><p class="receipt-number">Receipt ${payment.id}</p><dl><div><dt>Student</dt><dd>${localStorage.getItem('ccdiStudentName') || 'Rene Batterbonia'}</dd></div><div><dt>Term</dt><dd>${payment.term} · AY 2026-2027</dd></div><div><dt>Payment date</dt><dd>${new Date(payment.date).toLocaleString()}</dd></div><div><dt>Method</dt><dd>${payment.method}</dd></div><div><dt>Amount</dt><dd>${formatMoney(payment.amount)}</dd></div><div><dt>Status</dt><dd>Recorded · Prototype</dd></div></dl><p class="muted">This receipt is a front-end demo record, not proof of a real financial transaction.</p>`;
  }

  function renderShopCheckout() {
    const cart = readRecords('ccdiCart');
    const items = document.getElementById('shopCheckoutItems');
    const total = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
    if (items) {
      items.innerHTML = cart.length ? cart.map((item, index) => `<div class="shop-checkout-item"><div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.size || 'One size')}</small></div><strong>${formatMoney(item.price)}</strong><button class="text-link" type="button" data-remove-cart-item="${index}" aria-label="Remove ${escapeHtml(item.name)}">Remove</button></div>`).join('') : '<p class="muted">Your cart is empty. Add an item from the CCDI Shop to begin an order.</p>';
    }
    const totalNode = document.getElementById('shopCheckoutTotal');
    if (totalNode) totalNode.textContent = formatMoney(total);
    const history = document.getElementById('shopOrderHistory');
    const orders = readRecords('ccdiShopOrders');
    if (history) history.innerHTML = orders.length ? [...orders].reverse().map((order) => `<tr><td>${order.id}</td><td>${new Date(order.date).toLocaleDateString()}</td><td>${formatMoney(order.amount)}</td><td><a class="text-link" href="shop-receipt.html?id=${encodeURIComponent(order.id)}">Receipt</a></td></tr>`).join('') : '<tr><td colspan="4" class="muted">No completed orders yet.</td></tr>';
    document.querySelectorAll('.shop-cart-count').forEach((count) => { count.textContent = `${cart.length} item${cart.length === 1 ? '' : 's'}`; });
    const summary = document.querySelector('[data-shop-cart-summary]');
    if (summary) summary.textContent = cart.length ? cart.map((item) => `${item.name} (${item.size || 'One size'})`).join(', ') : 'Your cart is empty.';
    const payButton = document.getElementById('completeShopPayment');
    if (payButton) payButton.disabled = cart.length === 0;
  }

  function renderShopReceipt() {
    const target = document.getElementById('shopReceipt');
    if (!target) return;
    const id = new URLSearchParams(window.location.search).get('id');
    const order = readRecords('ccdiShopOrders').find((record) => record.id === id);
    if (!order) {
      target.innerHTML = '<h1>Receipt unavailable</h1><p>No matching shop order was found in this browser.</p><a class="btn btn-primary" href="shop-payment.html">Return to Orders</a>';
      return;
    }
    const items = order.items.map((item) => `<li>${escapeHtml(item.name)} · ${escapeHtml(item.size || 'One size')} · ${formatMoney(item.price)}</li>`).join('');
    target.innerHTML = `<span class="eyebrow">CCDI EDU · SHOP ORDER</span><h1>Order payment receipt</h1><p class="receipt-number">Order ${order.id}</p><dl><div><dt>Student</dt><dd>${localStorage.getItem('ccdiStudentName') || 'Rene Batterbonia'}</dd></div><div><dt>Date</dt><dd>${new Date(order.date).toLocaleString()}</dd></div><div><dt>Payment method</dt><dd>${order.method}</dd></div><div><dt>Amount paid</dt><dd>${formatMoney(order.amount)}</dd></div><div><dt>Pickup status</dt><dd>Paid · Present this receipt at the school shop</dd></div></dl><h2>Items</h2><ul>${items}</ul><p class="muted">This receipt is a front-end demo record and does not confirm a real payment.</p>`;
  }

  async function refreshDatabaseGrades() {
    const result = await apiRequest('grades');
    if (apiUser?.role === 'student') {
      const rowsMarkup = result.grades.length
        ? result.grades.map((grade) => `<tr><td>${escapeHtml(grade.subject_code)}</td><td>${escapeHtml(grade.subject_name)}</td><td>${escapeHtml(grade.instructor || '—')}</td><td>${grade.prelim == null ? '—' : Number(grade.prelim).toFixed(2)}</td><td>${grade.midterm == null ? '—' : Number(grade.midterm).toFixed(2)}</td><td>${grade.prefinal == null ? '—' : Number(grade.prefinal).toFixed(2)}</td><td>${grade.final == null ? '—' : Number(grade.final).toFixed(2)}</td><td>${grade.total == null ? '—' : Number(grade.total).toFixed(2)}</td><td>${!grade.grade_record_id ? 'Awaiting Release' : grade.enrollment_status === 'active' ? 'Published' : 'Published · academic history'}</td></tr>`).join('')
        : '<tr><td colspan="9" class="muted">No published grades are available for your enrolled subjects.</td></tr>';
      document.querySelectorAll('#studentGradeRows, #dashboardStudentGradeRows').forEach((rows) => { rows.innerHTML = rowsMarkup; });
      const hasPublishedGrades = result.grades.some((grade) => grade.grade_record_id != null);
      document.querySelectorAll('#studentGradeStatus').forEach((status) => {
        status.textContent = hasPublishedGrades ? 'Published' : 'Awaiting Release';
        status.className = `badge ${hasPublishedGrades ? 'badge-success' : 'badge-warning'}`;
      });
      return;
    }
    const rows = document.getElementById('staffGradeRows');
    if (!rows) return;
    rows.innerHTML = result.grades.length ? result.grades.map((grade) => (
      `<tr><td>${escapeHtml(grade.student_number)}</td><td>${escapeHtml(grade.subject_code)} · ${escapeHtml(grade.subject_name)}</td>`
      + `<td>${grade.prelim == null ? '-' : Number(grade.prelim).toFixed(2)}</td><td>${grade.midterm == null ? '-' : Number(grade.midterm).toFixed(2)}</td>`
      + `<td>${grade.prefinal == null ? '-' : Number(grade.prefinal).toFixed(2)}</td><td>${grade.final == null ? '-' : Number(grade.final).toFixed(2)}</td>`
      + `<td>${Number(grade.is_published) ? 'Published' : 'Draft'}</td></tr>`
    )).join('') : '<tr><td colspan="7" class="muted">No grade records have been entered.</td></tr>';
  }

  function scheduleCourseKey(course) {
    const value = String(course || '').toLowerCase();
    if (value.includes('computer science')) return 'bscs';
    if (value.includes('information systems')) return 'bsis';
    if (value.includes('office administration')) return 'bsoa';
    if (value.includes('associate')) return 'act';
    return 'bsit';
  }

  async function refreshDatabaseSchedules(allSchedules = document.body.dataset.page === 'schedule-all') {
    const result = await apiRequest(allSchedules ? 'schedule&all=1' : 'schedule');
    const schedules = result.schedules;
    if (apiUser?.role === 'student' && !allSchedules) {
      const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
      const year = String(profile.year || '').match(/[1-4]/)?.[0] || '1';
      const block = String(profile.block || 'A').toUpperCase();
      const key = `${String(profile.course || '').toLowerCase()}|${year}|${block}`;
      databaseSchedules[key] = schedules.map((item) => [
        item.subject_code, item.subject_name, String(item.units), item.class_time, item.day, item.room, item.instructor || '—'
      ]);
      renderStudentSchedule();
      renderStudentSubjects(profile);
      const title = document.body.dataset.page === 'schedule'
        ? document.querySelector('#appContent .grade-toolbar strong')
        : null;
      if (title) title.textContent = `${profile.course || 'Course'} · ${profile.year || 'Year'} · Block ${block}`;
    }
    const scheduleRows = schedules.map((item) => (
      `<tr><td>${escapeHtml(item.subject_code)}</td><td>${escapeHtml(item.subject_name)}</td><td>${escapeHtml(item.units)}</td>`
      + `<td>${escapeHtml(item.class_time)}</td><td>${escapeHtml(item.day)}</td><td>${escapeHtml(item.room)}</td><td>${escapeHtml(item.instructor || '—')}</td></tr>`
    )).join('');
    const ownSchedule = document.body.dataset.page === 'schedule'
      ? document.querySelector('#appContent table tbody')
      : null;
    const ownScheduleRows = schedules.map((item) => (
      `<tr><td>${escapeHtml(item.day)}</td><td>${escapeHtml(item.class_time)}</td><td>${escapeHtml(item.subject_name)}</td>`
      + `<td>${escapeHtml(item.room)}</td><td>${escapeHtml(item.instructor || '—')}</td></tr>`
    )).join('');
    if (ownSchedule) ownSchedule.innerHTML = ownScheduleRows || '<tr><td colspan="5" class="muted">No schedule entries have been published for your course and block.</td></tr>';
    const dashboardSchedule = document.getElementById('dashboardStudentScheduleRows');
    if (dashboardSchedule) dashboardSchedule.innerHTML = scheduleRows || '<tr><td colspan="7" class="muted">No schedule entries have been published for your course and block.</td></tr>';

    const allScheduleContainer = document.querySelector('.app-content:not(#appContent)') || document.querySelector('#appContent');
    if (allSchedules && allScheduleContainer) {
      const groups = new Map();
      schedules.forEach((item) => {
        const key = `${item.course}|${item.year_level}|${item.block}`;
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(item);
      });
      const catalogs = [...groups].map(([key, items]) => {
        const [course, year, block] = key.split('|');
        const rows = items.map((item) => `<tr><td>${escapeHtml(item.subject_code)}</td><td>${escapeHtml(item.subject_name)}</td><td>${escapeHtml(item.units)}</td><td>${escapeHtml(item.class_time)}</td><td>${escapeHtml(item.day)}</td><td>${escapeHtml(item.room)}</td></tr>`).join('');
        return `<section class="panel schedule-catalog" data-course="${scheduleCourseKey(course)}" data-year="${escapeHtml(String(year).match(/[1-4]/)?.[0] || '')}" data-block="${escapeHtml(block)}"><div class="panel-head"><div><h2>${escapeHtml(course)} · ${escapeHtml(year)} · Block ${escapeHtml(block)}</h2><p class="muted">Published class schedule</p></div></div><div class="table-wrap"><table><thead><tr><th>Code</th><th>Subject</th><th>Units</th><th>Time</th><th>Day</th><th>Room</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
      }).join('');
      allScheduleContainer.querySelectorAll('.schedule-catalog').forEach((section) => section.remove());
      const unavailable = document.getElementById('scheduleUnavailable');
      if (unavailable) unavailable.hidden = schedules.length > 0;
      allScheduleContainer.insertAdjacentHTML('beforeend', catalogs);
    }

    const staffRows = document.getElementById('staffScheduleRows');
    if (staffRows) {
      staffRows.innerHTML = schedules.length ? schedules.map((item) => (
        `<tr><td>${escapeHtml(item.course)}</td><td>${escapeHtml(item.year_level)} / ${escapeHtml(item.block)}</td><td>${escapeHtml(item.subject_code)}</td>`
        + `<td>${escapeHtml(item.subject_name)}</td><td>${escapeHtml(item.day)} · ${escapeHtml(item.class_time)}</td><td>${escapeHtml(item.room)}</td><td>${escapeHtml(item.instructor || '—')}</td></tr>`
      )).join('') : '<tr><td colspan="7" class="muted">No schedule records have been entered.</td></tr>';
    }
  }

  async function refreshDatabaseTuition() {
    const result = await apiRequest('tuition');
    dbTuitionTerms = result.terms;
    const studentTerms = result.terms.filter((term) => term.payment_id || apiUser?.role === 'student');
    const assessmentTotal = result.terms.reduce((sum, term) => sum + Number(term.amount || 0), 0);
    const paidTotal = result.terms.reduce((sum, term) => sum + (term.status === 'paid' ? Number(term.amount || 0) : 0), 0);
    document.querySelectorAll('[data-total-payment], [data-payment-total]').forEach((node) => { node.textContent = formatMoney(assessmentTotal); });
    document.querySelectorAll('[data-paid-payment], [data-payment-paid]').forEach((node) => { node.textContent = formatMoney(paidTotal); });
    document.querySelectorAll('[data-remaining-payment], [data-payment-balance], [data-payment-remaining]').forEach((node) => { node.textContent = formatMoney(Math.max(0, assessmentTotal - paidTotal)); });

    const periods = document.getElementById('paymentPeriods');
    if (periods) {
      periods.innerHTML = result.terms.map((term) => {
        const action = term.status === 'paid'
          ? '<span class="badge badge-success">Paid</span>'
          : term.payment_id
            ? '<span class="badge badge-warning">Payment pending</span>'
            : `<button class="btn btn-primary" type="button" data-pay-term="${escapeHtml(term.name)}">Pay ${escapeHtml(term.name)}</button>`;
        return `<article class="payment-period ${term.status === 'paid' ? 'is-paid' : ''}"><div><span class="period-label">${escapeHtml(term.name)} payment</span><strong>${formatMoney(term.amount)}</strong><small>Due ${new Date(`${term.due_date}T00:00:00`).toLocaleDateString()}</small></div><div class="payment-period-action">${action}</div></article>`;
      }).join('') || '<p class="muted">No tuition terms have been set up yet.</p>';
    }

    const history = document.getElementById('paymentHistory');
    if (history) {
      const payments = studentTerms.filter((term) => term.payment_id);
      history.innerHTML = payments.length ? payments.map((term) => (
        `<tr><td>${escapeHtml(term.name)}</td><td>${new Date(term.payment_date).toLocaleDateString()}</td><td>${escapeHtml(term.method)}</td>`
        + `<td>${formatMoney(term.amount)}</td><td><a class="text-link" href="payment-receipt.html?id=${encodeURIComponent(term.reference)}">View ${escapeHtml(term.status)}</a></td></tr>`
      )).join('') : '<tr><td colspan="5" class="muted">No tuition payments recorded yet.</td></tr>';
    }

    const financeRows = document.getElementById('financePaymentRows');
    if (financeRows) {
      const payments = result.terms.filter((term) => term.payment_id);
      financeRows.innerHTML = payments.length ? payments.map((term) => (
        `<tr><td>${escapeHtml(`${term.first_name || ''} ${term.last_name || ''}`.trim() || term.student_number || '')}</td>`
        + `<td>${escapeHtml(term.reference)}</td><td>${formatMoney(term.amount)}</td><td>${escapeHtml(term.name)}</td>`
          + `<td>${new Date(term.payment_date).toLocaleDateString()}</td><td><span class="badge ${term.status === 'paid' ? 'badge-success' : 'badge-warning'}">${term.status === 'paid' ? 'Paid' : 'Pending'}</span></td>`
          + `<td>${term.status === 'pending' && apiUser?.role === 'admin' ? `<button class="text-link" type="button" data-confirm-payment="${term.payment_id}">Verify receipt</button>` : ''}</td></tr>`
      )).join('') : '<tr><td colspan="7" class="muted">No tuition payments recorded yet.</td></tr>';
    }
  }

  async function refreshDatabaseEnrollmentPayments() {
    const rows = document.getElementById('enrollmentPaymentRows');
    if (!rows) return;
    const result = await apiRequest('enrollment_payments');
    rows.innerHTML = result.payments.length ? result.payments.map((payment) => (
      `<tr><td>${escapeHtml(`${payment.first_name} ${payment.last_name}`)}</td><td>${escapeHtml(payment.reference)}</td>`
      + `<td>${formatMoney(payment.amount)}</td><td>${escapeHtml(payment.method)}</td>`
      + `<td>${new Date(payment.created_at).toLocaleDateString()}</td><td><span class="badge ${payment.status === 'paid' ? 'badge-success' : 'badge-warning'}">${payment.status === 'paid' ? 'Paid' : 'Pending'}</span></td>`
      + `<td>${payment.status === 'pending' ? `<button class="text-link" type="button" data-confirm-enrollment-payment="${payment.id}">Verify receipt</button>` : ''}</td></tr>`
    )).join('') : '<tr><td colspan="7" class="muted">No enrollment payments recorded yet.</td></tr>';
  }

  async function refreshDatabaseProducts() {
    const result = await apiRequest('products');
    const grid = document.getElementById('shopProductGrid');
    const manager = document.getElementById('shopProductManager');
    if (manager) manager.classList.toggle('hidden', apiUser?.role !== 'admin');
    if (!grid) return;
    grid.innerHTML = result.products.map((product) => {
      let sizes = [];
      try {
        sizes = Array.isArray(product.sizes) ? product.sizes : JSON.parse(product.sizes || '[]');
      } catch {
        sizes = [];
      }
      const sizeControl = sizes.length
        ? `<label class="size-field">Size<select>${sizes.map((size) => `<option>${escapeHtml(size)}</option>`).join('')}</select></label>`
        : '';
      const image = product.image ? `<img class="product-photo" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" onerror="this.hidden=true">` : '';
      return `<article class="shop-item" data-product="${escapeHtml(product.sku)}" data-price="${Number(product.price)}">${image}<h3>${escapeHtml(product.name)}</h3><p>${escapeHtml(product.description)}</p>${sizeControl}<strong>${formatMoney(product.price)}</strong><button class="btn btn-outline" type="button" data-add-product>Add to cart</button></article>`;
    }).join('') || '<p class="muted">No shop products are available.</p>';
  }

              function openAnnouncementDetails(id) {
                const announcement = databaseAnnouncements.find((item) => String(item.id) === String(id));
                if (!announcement) return;
                let modal = document.getElementById('announcementDetailModal');
                if (!modal) {
                  modal = document.createElement('div');
                  modal.id = 'announcementDetailModal';
                  modal.className = 'modal announcement-detail-modal hidden';
                  modal.setAttribute('role', 'dialog');
                  modal.setAttribute('aria-modal', 'true');
                  modal.setAttribute('aria-labelledby', 'announcementDetailTitle');
                  modal.innerHTML = '<article class="modal-card announcement-detail-card"><button class="modal-close" type="button" data-close-announcement aria-label="Close announcement">×</button><div data-announcement-detail-content></div></article>';
                  document.body.append(modal);
                }
                const content = modal.querySelector('[data-announcement-detail-content]');
                if (!content) return;
                const image = announcement.attachment_url && /\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(announcement.attachment_url)
                  ? `<img class="announcement-detail-image" src="${escapeHtml(announcement.attachment_url)}" alt="${escapeHtml(announcement.title)}">`
                  : '';
                const attachment = announcement.attachment_url && !image
                  ? `<p><a class="text-link" href="${escapeHtml(announcement.attachment_url)}" target="_blank" rel="noopener noreferrer">Open attachment</a></p>`
                  : '';
                const date = announcement.announcement_date
                  ? new Date(`${announcement.announcement_date}T00:00:00`)
                  : new Date(announcement.created_at);
                content.innerHTML = `${image}<span class="eyebrow">${escapeHtml(announcement.audience)}</span><h2 id="announcementDetailTitle">${escapeHtml(announcement.title)}</h2><p class="muted">${date.toLocaleDateString()}</p><div class="announcement-detail-content">${escapeHtml(announcement.content).replace(/\n/g, '<br>')}</div>${attachment}`;
                modal.classList.remove('hidden');
                modal.querySelector('[data-close-announcement]')?.focus();
              }

              function announcementCardMarkup(announcement) {
        const attachment = announcement.attachment_url
          ? /\.(?:png|jpe?g|webp)(?:$|[?#])/i.test(announcement.attachment_url)
            ? `<img class="announcement-attachment" src="${escapeHtml(announcement.attachment_url)}" alt="${escapeHtml(announcement.title)}">`
            : `<p><a class="text-link" href="${escapeHtml(announcement.attachment_url)}" target="_blank" rel="noopener noreferrer">Open attachment</a></p>`
          : '';
        const date = announcement.announcement_date
          ? new Date(`${announcement.announcement_date}T00:00:00`)
          : new Date(announcement.created_at);
        return `<article class="announcement-card announcement-card--interactive" role="button" tabindex="0" data-announcement-detail="${announcement.id}" aria-label="Read ${escapeHtml(announcement.title)}"><div>${attachment}<span class="eyebrow">${escapeHtml(announcement.audience)}</span><h3>${escapeHtml(announcement.title)}</h3><p>${escapeHtml(announcement.content)}</p><small class="muted">${date.toLocaleDateString()}</small></div></article>`;
      }

      async function refreshDatabaseAnnouncements() {
        const targets = document.querySelectorAll('[data-announcement-list], [data-announcements]');
        const managerRows = document.querySelector('[data-admin-announcements]');
        if (!targets.length && !managerRows) return;
        const result = await apiRequest('announcements');
        databaseAnnouncements = result.announcements;
        targets.forEach((target) => {
          const announcements = target.hasAttribute('data-announcements') ? databaseAnnouncements.slice(0, 3) : databaseAnnouncements;
          target.innerHTML = announcements.length
            ? announcements.map(announcementCardMarkup).join('')
            : '<p class="muted">No announcements have been published for your account.</p>';
        });
        if (managerRows) {
          managerRows.innerHTML = databaseAnnouncements.length
            ? databaseAnnouncements.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.audience)}</td><td>${escapeHtml(item.status)}</td><td class="table-actions"><button class="btn btn-outline" type="button" data-edit-announcement="${item.id}">Edit</button>${item.status === 'draft' ? `<button class="btn btn-primary" type="button" data-publish-announcement="${item.id}">Publish</button>` : ''}<button class="btn btn-outline" type="button" data-delete-announcement="${item.id}">Delete</button></td></tr>`).join('')
            : '<tr><td colspan="4" class="muted">No announcements have been created.</td></tr>';
        }
      }

      function meetingMarkup(meeting, now) {
        const start = new Date(`${meeting.meeting_date}T${meeting.start_time}`);
        const end = new Date(`${meeting.meeting_date}T${meeting.end_time}`);
        const status = now < start ? 'Upcoming' : now <= end ? 'Ongoing' : 'Past';
        const link = meeting.meeting_link
          ? `<a class="text-link" href="${escapeHtml(meeting.meeting_link)}" target="_blank" rel="noopener noreferrer">Join meeting</a>`
          : '';
        return `<article class="meeting-card"><div class="meeting-card-head"><div><h3>${escapeHtml(meeting.title)}</h3><span class="badge ${status === 'Past' ? 'badge-info' : 'badge-success'}">${status}</span></div><strong>${new Date(`${meeting.meeting_date}T00:00:00`).toLocaleDateString()}</strong></div><p>${escapeHtml(meeting.description)}</p><dl><div><dt>Time</dt><dd>${escapeHtml(meeting.start_time.slice(0, 5))}–${escapeHtml(meeting.end_time.slice(0, 5))}</dd></div><div><dt>Location</dt><dd>${escapeHtml(meeting.location || 'Online')}</dd></div><div><dt>Audience</dt><dd>${escapeHtml(meeting.audience)}</dd></div></dl>${link}</article>`;
      }

      async function refreshDatabaseMeetings() {
        const upcomingTarget = document.querySelector('[data-upcoming-meetings]');
        const pastTarget = document.querySelector('[data-past-meetings]');
        const managerRows = document.querySelector('[data-admin-meetings]');
        if (!upcomingTarget && !pastTarget && !managerRows) return;
        const result = await apiRequest('meetings');
        databaseMeetings = result.meetings;
        const now = new Date();
        const upcoming = databaseMeetings.filter((item) => new Date(`${item.meeting_date}T${item.end_time}`) >= now);
        const past = databaseMeetings.filter((item) => new Date(`${item.meeting_date}T${item.end_time}`) < now);
        if (upcomingTarget) upcomingTarget.innerHTML = upcoming.length ? upcoming.map((item) => meetingMarkup(item, now)).join('') : '<p class="panel muted">No upcoming meetings have been published.</p>';
        if (pastTarget) pastTarget.innerHTML = past.length ? past.reverse().map((item) => meetingMarkup(item, now)).join('') : '<p class="panel muted">No previous meetings are available.</p>';
        if (managerRows) {
          managerRows.innerHTML = databaseMeetings.length
            ? databaseMeetings.map((item) => `<tr><td>${escapeHtml(item.title)}</td><td>${new Date(`${item.meeting_date}T00:00:00`).toLocaleDateString()}</td><td>${escapeHtml(item.audience)}</td><td>${escapeHtml(item.status)}</td><td class="table-actions"><button class="btn btn-outline" type="button" data-edit-meeting="${item.id}">Edit</button>${item.status === 'draft' ? `<button class="btn btn-primary" type="button" data-publish-meeting="${item.id}">Publish</button>` : ''}<button class="btn btn-outline" type="button" data-delete-meeting="${item.id}">Delete</button></td></tr>`).join('')
            : '<tr><td colspan="5" class="muted">No meetings have been created.</td></tr>';
        }
      }

      async function refreshProfessorInvites() {
        const rows = document.querySelector('[data-professor-invites]');
        if (!rows) return;
        const result = await apiRequest('professor_invites');
        rows.innerHTML = result.invitations.length
          ? result.invitations.map((invite) => `<tr><td>${escapeHtml(invite.status)}</td><td>${new Date(invite.expires_at).toLocaleString()}</td><td>${new Date(invite.created_at).toLocaleString()}</td><td>${invite.status === 'active' ? `<button class="btn btn-outline" type="button" data-revoke-invite="${invite.id}">Revoke</button>` : ''}</td></tr>`).join('')
          : '<tr><td colspan="4" class="muted">No invitations have been issued.</td></tr>';
      }

      async function refreshAdminClassData() {
        const result = await apiRequest('admin_class_data');
        administratorClassData = result;
        const classSelects = ['assignmentClass', 'enrollmentClass', 'rosterClass'].map((id) => document.getElementById(id)).filter(Boolean);
        const classOptions = result.classes.map((item) => ({
          value: item.id,
          label: `${item.course} · ${item.year_level} · Block ${item.block}`
        }));
        classSelects.forEach((select) => {
          const previous = select.value;
          select.innerHTML = `<option value="">Select a class section</option>${classOptions.map((item) => `<option value="${item.value}">${escapeHtml(item.label)}</option>`).join('')}`;
          if (classOptions.some((item) => String(item.value) === previous)) select.value = previous;
        });
        const professorSelect = document.getElementById('assignmentProfessor');
        if (professorSelect) {
          professorSelect.innerHTML = `<option value="">Select a professor</option>${result.professors.map((item) => `<option value="${item.id}">${escapeHtml(item.display_name || item.email)}</option>`).join('')}`;
        }
        const weights = result.weights || {};
        ['prelim', 'midterm', 'prefinal', 'final'].forEach((term) => {
          const input = document.getElementById(`${term}Weight`);
          if (input) input.value = weights[`${term}_weight`] ?? '';
        });
        const rows = document.querySelector('[data-admin-class-assignments]');
        if (rows) {
          rows.innerHTML = result.assignments.length
            ? result.assignments.map((item) => `<tr><td>${escapeHtml(item.course)} · ${escapeHtml(item.year_level)} · Block ${escapeHtml(item.block)}</td><td>${escapeHtml(item.subject_code)} · ${escapeHtml(item.subject_name)}</td><td>${escapeHtml(item.professor_name)}</td><td>${Number(item.student_count)}</td><td>${Number(item.active) ? 'Active' : 'Removed'}</td><td class="table-actions">${Number(item.active) ? `<button class="btn btn-outline" type="button" data-edit-class-assignment="${item.assignment_id}">Edit</button><button class="btn btn-outline" type="button" data-remove-class-assignment="${item.assignment_id}">Remove</button>` : ''}</td></tr>`).join('')
            : '<tr><td colspan="6" class="muted">No subject assignments have been created.</td></tr>';
        }
        return result;
      }

      async function loadAdminClassRoster(classId) {
        const rows = document.querySelector('[data-class-roster]');
        if (!rows || !classId) return;
        const result = await apiRequest(`class_enrollments&classId=${encodeURIComponent(classId)}`);
        rows.innerHTML = result.students.length
          ? result.students.map((student) => `<tr><td>${escapeHtml(student.ccdi_id || '-')}</td><td>${escapeHtml(student.last_name)}</td><td>${escapeHtml(student.first_name)}</td><td>${escapeHtml(student.middle_name || '-')}</td><td>${escapeHtml(student.status)}</td></tr>`).join('')
          : '<tr><td colspan="5" class="muted">No students are enrolled in this section.</td></tr>';
      }

      function assignmentLabel(item) {
        const course = String(item.course || '').replace(/^BS\s+/i, 'BS ').replace(/Bachelor of Science in Information Technology/i, 'BSIT')
          .replace(/BS Information Technology/i, 'BSIT').replace(/BS Office Administration/i, 'BSOA')
          .replace(/BS Computer Science/i, 'BSCS').replace(/BS Information Systems/i, 'BSIS')
          .replace(/Associate in Computer Technology/i, 'ACT');
        const year = String(item.year_level || '').match(/\d+/)?.[0] || item.year_level;
        return `[${course} ${year} BLK ${item.block} | ${item.subject_code}]`;
      }

      async function refreshProfessorAssignments() {
        const target = document.querySelector('[data-professor-assignments]');
        const dashboardTarget = document.querySelector('[data-professor-dashboard-classes]');
        if (!target && !dashboardTarget) return;
        const result = await apiRequest('professor_assignments');
        professorAssignments = result.assignments;
        document.querySelectorAll('[data-professor-class-count]').forEach((node) => { node.textContent = String(professorAssignments.length); });
        if (target) {
          target.innerHTML = professorAssignments.length
            ? professorAssignments.map((item) => `<button class="assignment-card" type="button" data-select-assignment="${item.assignment_id}"><strong>${escapeHtml(assignmentLabel(item))}</strong><span>${escapeHtml(item.subject_name)}</span><small>${Number(item.student_count)} active students</small></button>`).join('')
            : '<p class="muted">No class or subject assignments have been made for your account.</p>';
        }
        if (dashboardTarget) {
          dashboardTarget.innerHTML = professorAssignments.length
            ? professorAssignments.slice(0, 4).map((item) => `<a class="list-item" href="classes.html"><div class="list-icon">▤</div><div><strong>${escapeHtml(assignmentLabel(item))} · ${escapeHtml(item.subject_name)}</strong><small>${Number(item.student_count)} active students</small></div></a>`).join('')
            : '<p class="muted">No class assignments have been made for your account.</p>';
        }
      }

      async function loadAssignmentGradebook(assignmentId) {
        const result = await apiRequest(`assignment_gradebook&assignmentId=${encodeURIComponent(assignmentId)}`);
        selectedProfessorAssignment = result.assignment;
        const panel = document.getElementById('professorGradebook');
        const title = document.querySelector('[data-selected-assignment]');
        const formula = document.querySelector('[data-grade-weight-formula]');
        const rows = document.querySelector('[data-assignment-grade-rows]');
        if (!panel || !rows) return;
        panel.classList.remove('hidden');
        title.textContent = assignmentLabel({ ...result.assignment, year_level: result.assignment.year_level });
        const weights = result.weights || {};
        currentGradeWeights = weights;
        const weightParts = [['prelim', 'Prelim'], ['midterm', 'Midterm'], ['prefinal', 'Pre-final'], ['final', 'Final']];
        const configured = weightParts.every(([term]) => weights[`${term}_weight`] != null);
        formula.textContent = configured
          ? `Total = ${weightParts.map(([term, label]) => `${label} × ${Number(weights[`${term}_weight`])}%`).join(' + ')}`
          : 'Overall total is unavailable until an administrator configures the grading weights.';
        rows.innerHTML = result.students.length
          ? result.students.map((student) => `<tr data-grade-enrollment="${student.enrollment_id}"><td>${escapeHtml(student.ccdi_id || '-')}</td><td>${escapeHtml(student.last_name)}</td><td>${escapeHtml(student.first_name)}</td><td>${escapeHtml(student.middle_name || '-')}</td>${['prelim', 'midterm', 'prefinal', 'final'].map((term) => `<td><input class="grade-input" type="number" min="0" max="5" step="0.01" data-grade-term="${term}" value="${student[term] == null ? '' : Number(student[term]).toFixed(2)}" aria-label="${term} grade for ${escapeHtml(student.first_name)} ${escapeHtml(student.last_name)}"></td>`).join('')}<td data-grade-total>${student.total == null ? '—' : Number(student.total).toFixed(2)}</td><td>${Number(student.is_published) ? 'Published' : 'Draft'}</td><td><button class="btn btn-outline" type="button" data-drop-assignment-student="${student.enrollment_id}">Drop</button></td></tr>`).join('')
          : '<tr><td colspan="11" class="muted">No actively enrolled students are assigned to this subject.</td></tr>';
        panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }

      function updateAssignmentTotal(row) {
        const output = row.querySelector('[data-grade-total]');
        if (!output || !currentGradeWeights) return;
        const terms = ['prelim', 'midterm', 'prefinal', 'final'];
        const values = terms.map((term) => row.querySelector(`[data-grade-term="${term}"]`)?.value);
        const weights = terms.map((term) => currentGradeWeights[`${term}_weight`]);
        if (values.some((value) => value === '') || weights.some((weight) => weight == null)) {
          output.textContent = '—';
          return;
        }
        const total = values.reduce((sum, value, index) => sum + Number(value) * Number(weights[index]) / 100, 0);
        output.textContent = Number.isFinite(total) ? total.toFixed(2) : '—';
      }

      async function saveAssignmentGrades(published) {
        if (!selectedProfessorAssignment) return;
        const rows = [...document.querySelectorAll('[data-assignment-grade-rows] tr[data-grade-enrollment]')];
        const grades = rows.map((row) => {
          const entry = { enrollmentId: row.dataset.gradeEnrollment };
          row.querySelectorAll('[data-grade-term]').forEach((input) => { entry[input.dataset.gradeTerm] = input.value; });
          return entry;
        });
        try {
          const result = await apiRequest('save_assignment_grades', 'POST', {
            assignmentId: selectedProfessorAssignment.id,
            published,
            grades
          });
          showToast(`${result.saved} grade rows ${published ? 'published' : 'saved as draft'}.`);
          await loadAssignmentGradebook(selectedProfessorAssignment.id);
        } catch (error) {
          showToast(error.message);
        }
      }

      async function dropAssignmentStudent(enrollmentId) {
        if (!selectedProfessorAssignment || !window.confirm('Drop this student from the selected subject? Their account and grade history will remain.')) return;
        const reason = window.prompt('Enter the reason for this drop:')?.trim();
        if (!reason) {
          showToast('A reason is required to drop a student.');
          return;
        }
        try {
          await apiRequest('drop_assignment_student', 'POST', {
            assignmentId: selectedProfessorAssignment.id,
            enrollmentId,
            reason
          });
          showToast('Student dropped from this subject. Published grade history is retained.');
          await loadAssignmentGradebook(selectedProfessorAssignment.id);
        } catch (error) {
          showToast(error.message);
        }
      }

      async function refreshStaffGradebook() {
    const result = await apiRequest('grades');
    const rows = document.getElementById('staffGradeRows');
    if (!rows) return;
    rows.innerHTML = result.grades.length ? result.grades.map((grade) => (
      `<tr><td>${escapeHtml(grade.student_number)}</td><td>${escapeHtml(grade.subject_code)} · ${escapeHtml(grade.subject_name)}</td>`
      + `<td>${grade.prelim == null ? '-' : Number(grade.prelim).toFixed(2)}</td><td>${grade.midterm == null ? '-' : Number(grade.midterm).toFixed(2)}</td>`
      + `<td>${grade.prefinal == null ? '-' : Number(grade.prefinal).toFixed(2)}</td><td>${grade.final == null ? '-' : Number(grade.final).toFixed(2)}</td>`
      + `<td>${Number(grade.is_published) ? 'Published' : 'Draft'}</td></tr>`
    )).join('') : '<tr><td colspan="7" class="muted">No grade records have been entered.</td></tr>';
  }

  function ensureAccountProfileLink(role) {
    const header = document.querySelector('.app-topbar');
    if (!header) return;
    const profileHref = pageHref('profile', role);
    const profileLink = header.querySelector('a.student-avatar-link, a[href="profile.html"], a[href="profileProf.html"], a[href="profile-admin.html"]');
    if (profileLink) {
      profileLink.href = profileHref;
      profileLink.classList.add('account-profile-avatar');
      profileLink.setAttribute('aria-label', 'Open profile');
      return;
    }
    if (role === 'student' || document.body.dataset.page === 'profile' || header.querySelector('a.account-profile-avatar')) return;
    const link = document.createElement('a');
    link.className = 'profile-btn account-profile-avatar';
    link.href = profileHref;
    link.setAttribute('aria-label', 'Open profile');
    link.innerHTML = `<span class="avatar">${role === 'admin' ? 'AD' : 'PR'}</span>`;
    const logout = [...header.querySelectorAll('a')].find((item) => item.textContent.trim().toLowerCase() === 'logout');
    if (logout?.parentNode) logout.before(link);
    else (header.querySelector('.top-actions') || header).prepend(link);
  }

  async function refreshDatabaseOrders() {
    const history = document.getElementById('shopOrderHistory');
    if (!history) return;
    const result = await apiRequest('orders');
    history.innerHTML = result.orders.length ? result.orders.map((order) => (
      `<tr><td>${escapeHtml(order.reference)}</td><td>${new Date(order.created_at).toLocaleDateString()}</td>`
      + `<td>${formatMoney(order.total)}</td><td><a class="text-link" href="shop-receipt.html?id=${encodeURIComponent(order.reference)}">Receipt</a></td></tr>`
    )).join('') : '<tr><td colspan="4" class="muted">No completed orders yet.</td></tr>';
  }

  async function refreshTuitionReceiptFromDatabase() {
    const target = document.getElementById('tuitionReceipt');
    if (!target) return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const result = await apiRequest(`payment_receipt&id=${encodeURIComponent(id)}`);
    const payment = result.payment;
    target.innerHTML = `<span class="eyebrow">CCDI EDU · PAYMENT RECORD</span><h1>Tuition payment request</h1><p class="receipt-number">Reference ${escapeHtml(payment.reference)}</p>`
      + `<dl><div><dt>Student</dt><dd>${escapeHtml(payment.student_name)}</dd></div><div><dt>Term</dt><dd>${escapeHtml(payment.term)} · ${escapeHtml(payment.school_year)}</dd></div>`
      + `<div><dt>Request date</dt><dd>${new Date(payment.created_at).toLocaleString()}</dd></div><div><dt>Method</dt><dd>${escapeHtml(payment.method)}</dd></div>`
      + `<div><dt>Amount</dt><dd>${formatMoney(payment.amount)}</dd></div><div><dt>Status</dt><dd>${escapeHtml(payment.status)}</dd></div></dl>`
      + '<p class="muted">A payment request is not confirmation of payment. The finance office must confirm receipt.</p>';
  }

  async function refreshShopReceiptFromDatabase() {
    const target = document.getElementById('shopReceipt');
    if (!target) return;
    const id = new URLSearchParams(window.location.search).get('id');
    if (!id) return;
    const result = await apiRequest(`order_detail&id=${encodeURIComponent(id)}`);
    const order = result.order;
    const items = order.items.map((item) => `<li>${escapeHtml(item.product_name)} · ${escapeHtml(item.size)} · ${formatMoney(item.price)}</li>`).join('');
    target.innerHTML = `<span class="eyebrow">CCDI EDU · SHOP ORDER</span><h1>Order submitted</h1><p class="receipt-number">Order ${escapeHtml(order.reference)}</p>`
      + `<dl><div><dt>Student</dt><dd>${escapeHtml(order.student_name)}</dd></div><div><dt>Date</dt><dd>${new Date(order.created_at).toLocaleString()}</dd></div>`
      + `<div><dt>Payment method</dt><dd>${escapeHtml(order.payment_method)}</dd></div><div><dt>Total</dt><dd>${formatMoney(order.total)}</dd></div>`
      + `<div><dt>Status</dt><dd>${escapeHtml(order.status)}</dd></div></dl><h2>Items</h2><ul>${items}</ul>`
      + '<p class="muted">Orders are stored for campus pickup. No online payment is processed by this demo.</p>';
  }

  async function initializeDatabasePage() {
    const session = await loadApiSession();
    const page = document.body.dataset.page;
    const roleSpecificPages = ['dashboard', 'profile', 'settings', 'classes'];
    if (page && !session.user) {
      window.location.replace('index.html');
      return;
    }
    const adminPages = ['users', 'finance', 'reports', 'class-management', 'schedule-admin'];
    if (session.user && (roleSpecificPages.includes(page)
      && session.user.role !== document.body.dataset.role
      || adminPages.includes(page) && session.user.role !== 'admin')) {
      window.location.replace(`dashboard-${session.user.role}.html`);
      return;
    }
    if (page === 'grades' && session.user && session.user.role !== 'student') {
      window.location.replace(session.user.role === 'professor' ? 'classes.html' : 'class-management.html');
      return;
    }
    if (session.user?.role === 'student' && page === 'meetings') {
      window.location.replace('dashboard-student.html');
      return;
    }
    apiUser = session.user;
    if (!apiUser) return;
    document.body.dataset.role = apiUser.role;
    sessionStorage.setItem('ccdiRole', apiUser.role);
    syncRoleNavigation(apiUser.role);
    ensureAccountProfileLink(apiUser.role);
    document.querySelectorAll('.sidebar .nav-item[data-page]').forEach((item) => {
      if (!item.dataset.section) item.href = pageHref(item.dataset.page, apiUser.role);
    });
    const sidebarRole = document.getElementById('sidebarRole');
    if (sidebarRole) sidebarRole.textContent = apiUser.role.toUpperCase();
    document.querySelectorAll('#topUserName').forEach((node) => { node.textContent = apiUser.name; });
    document.querySelectorAll('[data-student-name]').forEach((node) => { node.textContent = apiUser.name.split(' ')[0]; });
    document.getElementById('shopProductManager')?.classList.toggle('hidden', apiUser.role !== 'admin');
    document.getElementById('announcementManager')?.classList.toggle('hidden', apiUser.role !== 'admin');
    document.getElementById('meetingManager')?.classList.toggle('hidden', apiUser.role !== 'admin');
    document.getElementById('gradeEntryForm')?.closest('.panel')?.classList.toggle('hidden', !['professor', 'admin'].includes(apiUser.role));
    document.getElementById('staffGradeRows')?.closest('.panel')?.classList.toggle('hidden', !['professor', 'admin'].includes(apiUser.role));
    document.getElementById('scheduleEntryForm')?.closest('.panel')?.classList.toggle('hidden', apiUser.role !== 'admin');
    document.getElementById('staffScheduleRows')?.closest('.panel')?.classList.toggle('hidden', !['professor', 'admin'].includes(apiUser.role));
    document.getElementById('tuitionTermManager')?.classList.toggle('hidden', apiUser.role !== 'admin');

    const dataPage = document.body.dataset.page;
    const isStudentDashboard = dataPage === 'dashboard' && apiUser.role === 'student';
    const actions = [];
    if (['schedule', 'schedule-all', 'grades'].includes(dataPage) || isStudentDashboard || document.getElementById('scheduleEntryForm')) {
      actions.push(() => refreshDatabaseSchedules(dataPage === 'schedule-all' || apiUser.role !== 'student'));
    }
    if (dataPage === 'grades' || isStudentDashboard) actions.push(() => refreshDatabaseGrades());
    if (['payments', 'finance', 'payment-receipt'].includes(dataPage) || isStudentDashboard) actions.push(() => refreshDatabaseTuition());
    if (dataPage === 'finance') actions.push(() => refreshDatabaseEnrollmentPayments());
    if (dataPage === 'shop') actions.push(() => refreshDatabaseProducts());
    if (dataPage === 'users' && apiUser.role === 'admin') actions.push(() => refreshProfessorInvites());
    if (dataPage === 'class-management' && apiUser.role === 'admin') actions.push(() => refreshAdminClassData());
    if (['classes', 'dashboard'].includes(dataPage) && apiUser.role === 'professor') actions.push(() => refreshProfessorAssignments());
    if (dataPage === 'announcements' || document.querySelector('[data-announcement-list], [data-announcements], [data-admin-announcements]')) {
      actions.push(() => refreshDatabaseAnnouncements());
    }
    if (dataPage === 'meetings' || document.querySelector('[data-upcoming-meetings], [data-past-meetings], [data-admin-meetings]')) {
      actions.push(() => refreshDatabaseMeetings());
    }
    if (document.getElementById('gradeEntryForm') && ['professor', 'admin'].includes(apiUser.role)) actions.push(() => refreshStaffGradebook());
    if (document.getElementById('shopOrderHistory')) actions.push(() => refreshDatabaseOrders());
    if (dataPage === 'payment-receipt') actions.push(() => refreshTuitionReceiptFromDatabase());
    if (dataPage === 'shop-receipt') actions.push(() => refreshShopReceiptFromDatabase());
    populateStudentProfile();
    for (const action of actions) {
      try {
        await action();
      } catch (error) {
        showToast(error.message);
      }
    }
  }

  function populateStudentProfile() {
    const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
    if (profile.name) {
      document.querySelectorAll('[data-profile-name], [data-record-name], #profileSummary h2, #topUserName').forEach((node) => { node.textContent = profile.name; });
    }
    if (profile.course) document.querySelectorAll('[data-record-course], .profile-academic-summary strong').forEach((node) => { node.textContent = profile.course; });
    if (profile.year) document.querySelectorAll('[data-record-year], .profile-academic-summary span:first-of-type').forEach((node) => { node.textContent = `${profile.year}, Block ${profile.block || 'A'}`; });
    document.querySelectorAll('[data-profile-field]').forEach((field) => {
      const value = profile[field.dataset.profileField];
      if (value != null) field.value = value;
    });
    document.querySelectorAll('[data-profile-value]').forEach((field) => {
      const key = field.dataset.profileValue;
      const value = key === 'yearBlock' ? `${profile.year || ''}${profile.block ? `, Block ${profile.block}` : ''}` : profile[key];
      if ('value' in field) field.value = value || '';
      else field.textContent = value || (key === 'ccdiId' ? 'Not assigned' : 'Not provided');
    });
    const assignedRows = document.querySelector('[data-assigned-classes]');
    if (assignedRows) {
      const classes = profile.assignedClasses || [];
      assignedRows.innerHTML = classes.length
        ? classes.map((item) => `<tr><td>${escapeHtml(item.course)}</td><td>${escapeHtml(item.year)}</td><td>${escapeHtml(item.block)}</td><td>${escapeHtml(item.subjectCode)} · ${escapeHtml(item.subjectName)}</td></tr>`).join('')
        : '<tr><td colspan="4" class="muted">No published class assignments are available.</td></tr>';
    }
    if (profile.name) {
      const initials = profile.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
      document.querySelectorAll('.student-avatar-link .avatar').forEach((avatar) => { avatar.textContent = initials; });
    }
    renderStudentSubjects(profile);
    document.querySelectorAll('.cor-panel').forEach((panel) => {
      panel.classList.add('cor-panel--document');
      panel.innerHTML = buildStudentCorMarkup(profile);
    });
  }

  function renderStudentGrades() {
    const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
    const hasPublishedGrades = getStudentSubjects(profile).some((subject) => getPublishedStudentGrades(profile, subject.code));
    document.querySelectorAll('#studentGradeStatus').forEach((status) => {
      status.className = `badge ${hasPublishedGrades ? 'badge-success' : 'badge-warning'}`;
      status.textContent = hasPublishedGrades ? 'Published' : 'Awaiting Release';
    });
  }

  function renderStudentSchedule() {
    const title = document.querySelector('[data-schedule-title]');
    const rows = document.getElementById('dashboardStudentScheduleRows');
    if (!title || !rows) return;
    const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
    const studentSchedule = getStudentSchedule(profile);
    title.textContent = `${studentSchedule.course} · ${profile.year || '1st Year'} · Block ${studentSchedule.block}`;
    rows.innerHTML = studentSchedule.rows.length
      ? studentSchedule.rows.map((subject) => `<tr>${subject.map((value) => `<td>${escapeHtml(value)}</td>`).join('')}</tr>`).join('')
      : '<tr><td colspan="7" class="muted">No schedule has been published for this course, year, and block yet.</td></tr>';
  }

  window.saveProfile = async () => {
    const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
    const updates = {};
    document.querySelectorAll('[data-profile-field]').forEach((field) => { updates[field.dataset.profileField] = field.value.trim(); });
    try {
      await apiRequest('update_profile', 'POST', updates);
      Object.assign(profile, updates);
      if (apiUser?.role !== 'admin') {
        profile.name = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ');
      }
      localStorage.setItem('ccdiStudentProfile', JSON.stringify(profile));
      localStorage.setItem('ccdiStudentName', profile.name);
      populateStudentProfile();
      showToast('Profile changes saved.');
    } catch (error) {
      showToast(error.message);
    }
  };

  window.downloadCor = () => {
    const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
    const corStyles = 'body{font:14px Arial,sans-serif;color:#18324a;margin:30px}.cor-document{max-width:1000px;margin:auto;border:1px solid #b7c7d6;padding:26px}.cor-document-header{display:flex;gap:18px;align-items:center;border-bottom:2px solid #173b5b;padding-bottom:18px}.cor-document-header img{width:64px;height:64px;object-fit:contain}.cor-document-header span,.cor-student-details small{font-size:10px;letter-spacing:.06em;color:#5e7183}.cor-document-header h2{margin:4px 0}.cor-student-details{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:20px 0}.cor-student-details div{border-bottom:1px solid #d5dfe8;padding:8px}.cor-student-details strong,.cor-student-details small{display:block}.cor-document-section-title{display:flex;justify-content:space-between;align-items:center;margin:20px 0 10px}.cor-document table{width:100%;border-collapse:collapse}.cor-document th,.cor-document td{border:1px solid #b7c7d6;padding:8px;text-align:left}.cor-document th{background:#edf3f8}.cor-installments{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.cor-installments div{display:grid;gap:4px;border:1px solid #d5dfe8;padding:10px}.cor-installments small,.cor-document-note{color:#687b8d}.cor-document-note{margin-top:20px}';
    const logoSource = new URL('image/CCDI EDU.png', window.location.href).href;
    const cor = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificate of Registration</title><style>${corStyles}</style></head><body>${buildStudentCorMarkup(profile, false, logoSource)}</body></html>`;
    const url = URL.createObjectURL(new Blob([cor], { type: 'text/html' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'CCDI-Certificate-of-Registration.html';
    link.click();
    URL.revokeObjectURL(url);
  };

  function pageHref(page, role = document.body.dataset.role || 'student') {
    if (page === 'dashboard') return `dashboard-${role}.html`;
    if (page === 'profile' && role === 'professor') return 'profileProf.html';
    if (page === 'profile' && role === 'admin') return 'profile-admin.html';
    if (role === 'professor') {
      const professorPages = { classes: 'classes.html', grades: 'classes.html', schedule: 'sched_prof.html', settings: 'settings-professor.html' };
      if (professorPages[page]) return professorPages[page];
    }
    if (role === 'admin') {
      const adminPages = { classes: 'class-management.html', 'class-management': 'class-management.html' };
      if (adminPages[page]) return adminPages[page];
    }
    if (role === 'student') {
      const dashboardSections = {
        payments: 'studentTuition',
        grades: 'studentGrades',
        schedule: 'studentSchedule',
        announcements: 'studentAnnouncements',
        shop: 'studentShop'
      };
      if (dashboardSections[page]) return `dashboard-student.html#${dashboardSections[page]}`;
    }
    if (page === 'settings') return role === 'student' ? 'settings-student.html' : `settings-${role}.html`;
    return `${page}.html`;
  }

  function goToPage(page) {
    window.location.href = pageHref(page);
  }

  function replaceNavigationButtons() {
    document.querySelectorAll('.nav-item[data-page]').forEach((item) => {
      const link = item.tagName === 'A' ? item : document.createElement('a');
      if (item !== link) {
        link.className = item.className;
        link.innerHTML = item.innerHTML;
        [...item.attributes].filter((attribute) => attribute.name.startsWith('data-'))
          .forEach((attribute) => link.setAttribute(attribute.name, attribute.value));
        item.replaceWith(link);
      }
      const page = link.dataset.page;
      if (document.body.dataset.page === 'dashboard' && link.dataset.section) {
        link.href = `#${link.dataset.section}`;
      } else {
        link.href = pageHref(page);
      }
      link.setAttribute('aria-current', link.classList.contains('active') ? 'page' : 'false');
    });
  }

  function setActiveNav(page) {
    document.querySelectorAll('.sidebar .nav-item').forEach((item) => {
      const active = item.dataset.page === page;
      item.classList.toggle('active', active);
      item.setAttribute('aria-current', active ? 'page' : 'false');
    });
  }

  function orderStudentNavigation() {
    if (document.body.dataset.role !== 'student') return;
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const order = ['dashboard', 'payments', 'grades', 'schedule', 'announcements', 'meetings', 'shop', 'settings'];
    const labels = {
      dashboard: 'Home',
      payments: 'Tuition',
      announcements: 'Announcements',
      meetings: 'Meetings',
      grades: 'Grades',
      schedule: 'Class Schedule',
      shop: 'CCDI Shop',
      settings: 'Settings'
    };
    const items = [...sidebar.querySelectorAll('.nav-item[data-page]')];
    items.filter((item) => !order.includes(item.dataset.page)).forEach((item) => item.remove());
    const orderedItems = items.filter((item) => order.includes(item.dataset.page));
    order.forEach((page) => {
      if (orderedItems.some((item) => item.dataset.page === page)) return;
      const link = document.createElement('a');
      link.className = 'nav-item';
      link.dataset.page = page;
      link.href = pageHref(page);
      link.innerHTML = `<span>${labels[page]}</span>`;
      orderedItems.push(link);
    });
    orderedItems.sort((left, right) => order.indexOf(left.dataset.page) - order.indexOf(right.dataset.page));
    orderedItems.forEach((item) => {
      item.innerHTML = `<span>${labels[item.dataset.page]}</span>`;
      sidebar.append(item);
    });
  }

  function syncRoleNavigation(role) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const navigation = {
      student: [['dashboard', 'Home'], ['payments', 'Tuition'], ['grades', 'Grades'], ['schedule', 'Class Schedule'], ['announcements', 'Announcements'], ['shop', 'CCDI Shop'], ['settings', 'Settings']],
      professor: [['dashboard', 'Home'], ['classes', 'Classes'], ['announcements', 'Announcements'], ['meetings', 'Meetings'], ['schedule', 'Class Schedule'], ['settings', 'Settings']],
      admin: [['dashboard', 'Home'], ['announcements', 'Announcements'], ['meetings', 'Meetings'], ['classes', 'Classes'], ['users', 'Users'], ['finance', 'Finance'], ['reports', 'Reports'], ['settings', 'Settings']]
    }[role];
    if (!navigation) return;
    const roleLabel = sidebar.querySelector('.sidebar-role');
    sidebar.replaceChildren(...[roleLabel].filter(Boolean));
    navigation.forEach(([page, label]) => {
      const link = document.createElement('a');
      link.className = 'nav-item';
      link.dataset.page = page;
      link.href = pageHref(page, role);
      link.innerHTML = `<span>${label}</span>`;
      if (document.body.dataset.page === 'dashboard' && role === 'student') {
        const sections = { dashboard: 'homeSection', payments: 'studentTuition', grades: 'studentGrades', schedule: 'studentSchedule', announcements: 'studentAnnouncements', shop: 'studentShop' };
        if (sections[page]) {
          link.dataset.section = sections[page];
          link.href = `#${sections[page]}`;
        }
      }
      if (page === document.body.dataset.page || (role === 'admin' && page === 'classes' && document.body.dataset.page === 'class-management')) {
        link.classList.add('active');
      }
      sidebar.append(link);
    });
  }

  function showServicePanel(service) {
    const details = document.getElementById('serviceDetail');
    const template = document.getElementById(`student${service[0].toUpperCase()}${service.slice(1)}PanelTemplate`);
    if (!details || !template) return;
    const alreadyOpen = details.dataset.service === service;
    document.querySelectorAll('.service-tile').forEach((tile) => {
      const selected = !alreadyOpen && tile.dataset.service === service;
      tile.classList.toggle('service-selected', selected);
      tile.setAttribute('aria-expanded', String(selected));
    });
    details.dataset.service = alreadyOpen ? '' : service;
    details.innerHTML = alreadyOpen ? '' : template.innerHTML;
    populateStudentProfile();
    renderStudentGrades();
    renderStudentSchedule();
    setActiveNav(alreadyOpen ? 'dashboard' : service);
  }

  function setupBackNavigation() {
    const page = document.body.dataset.page;
    if (page !== 'profile') return;
    const content = document.getElementById('appContent') || document.querySelector('main.app-content');
    if (!content || content.querySelector('.page-back-link')) return;
    const role = document.body.dataset.role || 'student';
    const service = page === 'grades' ? 'grades' : ['schedule', 'schedule-all'].includes(page) ? 'schedule' : page === 'shop' ? 'shop' : '';
    const returnHash = service ? `#service-${service}` : '#homeSection';
    const returnHref = `dashboard-${role}.html${returnHash}`;
    const existingHomeLink = [...content.querySelectorAll('.page-title a')]
      .find((link) => link.href.includes(`dashboard-${role}.html`));
    if (existingHomeLink) {
      existingHomeLink.href = returnHref;
      existingHomeLink.textContent = '← Back';
      existingHomeLink.classList.add('page-back-link');
      return;
    }
    const link = document.createElement('a');
    link.className = 'btn btn-outline page-back-link';
    link.href = returnHref;
    link.textContent = '← Back';
    const pageTitle = content.querySelector('.page-title');
    if (pageTitle) pageTitle.prepend(link);
    else content.prepend(link);
  }

  function restoreDashboardService() {
    if (document.body.dataset.page !== 'dashboard') return;
    const service = window.location.hash.match(/^#service-(grades|schedule|shop)$/)?.[1];
    if (!service) return;
    const sectionId = { grades: 'studentGrades', schedule: 'studentSchedule', shop: 'studentShop' }[service];
    document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveNav(service);
  }

  function setupMobileMenu() {
    document.querySelectorAll('.mobile-menu').forEach((button) => {
      button.textContent = '☰';
      button.type = 'button';
      button.setAttribute('aria-label', 'Open navigation');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  function setupStudentHeader() {
    if (document.body.dataset.role !== 'student') return;
    const header = document.querySelector('.app-topbar');
    if (!header) return;
    const logout = [...header.querySelectorAll('a')].find((link) => link.textContent.trim().toLowerCase() === 'logout');
    let profileLink = header.querySelector('.student-avatar-link, a[href="profile.html"]');
    if (!profileLink) {
      profileLink = document.createElement('a');
      profileLink.className = 'profile-btn student-avatar-link';
      profileLink.href = 'profile.html';
      profileLink.setAttribute('aria-label', 'Open profile');
      const avatar = document.createElement('span');
      avatar.className = 'avatar';
      avatar.textContent = 'CC';
      profileLink.append(avatar);
      logout?.before(profileLink);
      if (!logout) header.append(profileLink);
    }
    header.querySelectorAll('.profile-btn').forEach((profileLink) => {
      profileLink.href = 'profile.html';
      profileLink.setAttribute('aria-label', 'Open profile');
    });
  }

  function initializeScrollNavigation() {
    if (document.body.dataset.page !== 'dashboard' || !('IntersectionObserver' in window)) return;
    const sections = ['homeSection', 'studentTuition', 'studentGrades', 'studentSchedule', 'studentShop', 'studentAnnouncements', 'studentMeetings']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      if (document.getElementById('serviceDetail')?.dataset.service) return;
      const visible = entries.filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
      if (visible) {
        const link = document.querySelector(`.sidebar .nav-item[data-section="${visible.target.id}"]`);
        if (link) setActiveNav(link.dataset.page);
      }
    }, { rootMargin: '-18% 0px -62% 0px', threshold: [0, 0.15, 0.4] });
    sections.forEach((section) => observer.observe(section));
  }

  function setupPublicNavigation() {
    const nav = document.querySelector('.public-nav');
    const sections = ['home', 'academics', 'announcements', 'about']
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!nav || !sections.length) return;
    const links = [...nav.querySelectorAll('nav a[href^="#"]')];
    const updateActiveLink = () => {
      const headerBottom = nav.getBoundingClientRect().bottom;
      let currentSection = sections[0].id;
      sections.forEach((section) => {
        if (section.getBoundingClientRect().top <= headerBottom + 40) currentSection = section.id;
      });
      links.forEach((link) => {
        const active = link.hash === `#${currentSection}`;
        link.classList.toggle('is-current', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    window.addEventListener('scroll', updateActiveLink, { passive: true });
    window.addEventListener('hashchange', updateActiveLink);
    updateActiveLink();
  }

  function loadPageTemplate() {
    const page = document.body.dataset.page;
    const role = document.body.dataset.role || 'student';
    const content = document.getElementById('appContent');
    if (!page || !content) return;

    let templateId = `${page}Template`;
    if (page === 'dashboard') templateId = `${role}DashboardTemplate`;
    if (page === 'grades' && role === 'professor') templateId = 'professorGradesTemplate';

    const template = document.getElementById(templateId);
    if (template) {
      content.innerHTML = template.innerHTML;
      template.classList.add('hidden');
      return;
    }

    if (!content.textContent.trim() && page === 'announcements') {
      content.innerHTML = '<section class="page-title"><div><h1>Announcements</h1><p>School announcements and updates.</p></div></section><div class="panel"><p>There are no announcements to display right now.</p><p><a class="text-link" href="announcements-public.html">View public announcements</a></p></div>';
    }
  }

  function initializePageSearch() {
    const form = document.getElementById('pageSearchForm');
    const input = document.getElementById('pageSearchInput');
    const clear = document.getElementById('pageSearchClear');
    const content = document.getElementById('appContent');
    if (!form || !input || !clear || !content) return;
    const emptyState = document.createElement('p');
    emptyState.className = 'search-empty-state muted';
    emptyState.textContent = 'No matching results on this page.';
    emptyState.hidden = true;
    content.append(emptyState);

    const filter = () => {
      const query = input.value.trim().toLocaleLowerCase();
      const items = [...content.querySelectorAll('article, .stat-card, .list-item, tbody tr:not([data-empty]), .student-event-row, .shop-item')]
        .filter((item) => !item.closest('[hidden]'));
      let matches = 0;
      items.forEach((item) => {
        const matched = !query || item.textContent.toLocaleLowerCase().includes(query);
        item.hidden = !matched;
        if (matched) matches += 1;
      });
      emptyState.hidden = !query || matches > 0;
      clear.hidden = !query;
    };
    form.addEventListener('submit', (event) => { event.preventDefault(); filter(); });
    input.addEventListener('input', filter);
    clear.addEventListener('click', () => {
      input.value = '';
      filter();
      input.focus();
    });
  }

  function mountStudentDashboardSections() {
    if (document.body.dataset.page !== 'dashboard') return;
    [
      ['studentGrades', 'studentGradesPanelTemplate'],
      ['studentSchedule', 'studentSchedulePanelTemplate'],
      ['studentShop', 'studentShopPanelTemplate']
    ].forEach(([sectionId, templateId]) => {
      const section = document.getElementById(sectionId);
      const template = document.getElementById(templateId);
      if (section && template) section.innerHTML = template.innerHTML;
    });
  }

  function showToast(message) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 2800);
  }

  window.showPage = goToPage;
  window.navigateFromDashboard = goToPage;
  window.payTuitionPeriod = async (termName) => {
    const term = dbTuitionTerms.find((item) => item.name === termName);
    if (!term) {
      showToast('This tuition term is not available. Refresh and try again.');
      return;
    }
    try {
      await apiRequest('request_tuition_payment', 'POST', {
        termId: term.id,
        method: document.getElementById('tuitionPaymentMethod')?.value || 'Cashier'
      });
      showToast('Payment request recorded. The finance office must confirm receipt.');
      await refreshDatabaseTuition();
    } catch (error) {
      showToast(error.message);
    }
  };
  window.printReceipt = () => window.print();
  window.saveSettings = () => {
    const theme = document.getElementById('themeSelect')?.value || 'light';
    setTheme(theme);
    if (apiUser) {
      apiRequest('save_theme', 'POST', { theme })
        .then(() => showToast('Theme preference saved.'))
        .catch((error) => showToast(error.message));
      return;
    }
    showToast('Theme preference saved on this device.');
  };
  window.completeShopPayment = async () => {
    const cart = readRecords('ccdiCart');
    if (!cart.length) return;
    try {
      const result = await apiRequest('place_order', 'POST', {
        method: document.getElementById('shopPaymentMethod')?.value || 'Cashier',
        items: cart.map((item) => ({ sku: item.product, size: item.size || 'One size' }))
      });
      localStorage.setItem('ccdiCart', '[]');
      window.location.href = `shop-receipt.html?id=${encodeURIComponent(result.id)}`;
    } catch (error) {
      showToast(error.message);
    }
  };
  window.toggleSidebar = () => {
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar?.classList.toggle('open') || false;
    const menu = document.querySelector('.mobile-menu');
    menu?.setAttribute('aria-expanded', String(isOpen));
    menu?.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  };
  window.toggleProfileMenu = () => document.getElementById('profileDropdown')?.classList.toggle('show');
  window.logout = async () => {
    try {
      await apiRequest('logout', 'POST', {});
    } catch (error) {
      showToast(error.message);
      return;
    }
    sessionStorage.removeItem('ccdiRole');
    window.location.href = 'index.html';
  };
  window.showPublic = (section) => {
    document.getElementById(section === 'home' ? 'home' : section)?.scrollIntoView({ behavior: 'smooth' });
  };
  window.openLogin = () => document.getElementById('loginModal')?.classList.remove('hidden');
  window.closeLogin = () => document.getElementById('loginModal')?.classList.add('hidden');
  window.openRegister = () => {
    window.closeLogin();
    document.getElementById('registerModal')?.classList.remove('hidden');
    window.showSignupStep(1);
    refreshEnrollmentFee().catch((error) => showToast(error.message));
  };
  window.closeRegister = () => document.getElementById('registerModal')?.classList.add('hidden');
  window.togglePassword = () => {
    const input = document.getElementById('loginPassword');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
  };
  window.showSignupStep = (step) => {
    document.querySelectorAll('[data-signup-step]').forEach((panel) => {
      panel.classList.toggle('hidden', Number(panel.dataset.signupStep) !== step);
    });
  };
  window.continueSignup = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;
    const photo = document.getElementById('regPhoto')?.files?.[0];
    const lastName = document.getElementById('regLastName')?.value.trim();
    const firstName = document.getElementById('regFirstName')?.value.trim();
    const middleName = document.getElementById('regMiddleName')?.value.trim();
    const signup = {
      name: [firstName, middleName, lastName].filter(Boolean).join(' '),
      lastName,
      firstName,
      middleName,
      birthday: document.getElementById('regBirthday')?.value,
      sex: document.getElementById('regSex')?.value,
      phone: document.getElementById('regPhone')?.value.trim(),
      email: document.getElementById('regEmail')?.value.trim(),
      address: document.getElementById('regAddress')?.value.trim(),
      previousSchool: document.getElementById('regPreviousSchool')?.value.trim(),
      course: document.getElementById('regCourse')?.value.trim(),
      year: document.getElementById('regYear')?.value,
      guardian: document.getElementById('regGuardian')?.value.trim(),
      photoName: photo?.name || ''
    };
    sessionStorage.setItem('ccdiSignup', JSON.stringify(signup));
    window.showSignupStep(2);
  };
  window.continuePayment = () => {
    if (!document.getElementById('regPaymentMethod')?.value) {
      showToast('Select a payment method to continue.');
      return;
    }
    window.showSignupStep(3);
  };
  window.finishSignup = async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    const password = document.getElementById('regPassword')?.value;
    const confirmation = document.getElementById('regConfirm')?.value;
    if (password !== confirmation) {
      showToast('Passwords do not match.');
      return;
    }
    if (!sessionStorage.getItem('ccdiSignup')) {
      showToast('Complete the enrollment steps first.');
      window.showSignupStep(1);
      return;
    }
    const signup = JSON.parse(sessionStorage.getItem('ccdiSignup') || '{}');
    try {
      const result = await apiRequest('register', 'POST', {
        ...signup,
        password,
        method: document.getElementById('regPaymentMethod')?.value
      });
      sessionStorage.removeItem('ccdiSignup');
      const message = document.getElementById('signupPendingMessage');
      if (message) message.textContent = `Payment request ${result.reference} for ${formatMoney(result.amount)} is pending verification.`;
      window.showSignupStep(4);
    } catch (error) {
      showToast(error.message);
    }
  };
  window.login = async (event) => {
    event.preventDefault();
    if (!event.currentTarget.reportValidity()) return;
    try {
      const result = await apiRequest('login', 'POST', {
        login: document.getElementById('loginId')?.value.trim(),
        password: document.getElementById('loginPassword')?.value
      });
      apiUser = result.user;
      sessionStorage.setItem('ccdiRole', result.user.role);
      window.location.href = `dashboard-${result.user.role}.html`;
    } catch (error) {
      apiUser = null;
      sessionStorage.removeItem('ccdiRole');
      showToast(error.message);
    }
  };
  window.toggleServicePanel = (_button, page) => showServicePanel(page);
  window.filterGradebook = (value) => {
    const search = value.trim().toLowerCase();
    document.querySelectorAll('#gradebookRows tr').forEach((row) => {
      row.hidden = !row.textContent.toLowerCase().includes(search);
    });
  };
  window.saveGrades = () => showToast('Grade changes saved in this demo.');
  window.publishGrades = () => showToast('Grades published in this demo.');
  window.loadIT2DGrades = loadIT2DGrades;
  window.saveIT2DGrades = () => saveIT2DGradeRecord(false).catch((error) => showToast(error.message));
  window.publishIT2DGrades = () => saveIT2DGradeRecord(true).catch((error) => showToast(error.message));

  document.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const feedback = document.querySelector(`[data-form-feedback="${form.id}"]`);
    if (feedback) feedback.textContent = '';

    try {
      if (form.id === 'academicClassForm') {
        event.preventDefault();
        await apiRequest('save_academic_class', 'POST', {
          course: document.getElementById('academicCourse').value.trim(),
          yearLevel: document.getElementById('academicYear').value,
          block: document.getElementById('academicBlock').value.trim()
        });
        form.reset();
        showToast('Class section saved.');
        await refreshAdminClassData();
      } else if (form.id === 'classAssignmentForm') {
        event.preventDefault();
        await apiRequest('save_class_assignment', 'POST', {
          classId: document.getElementById('assignmentClass').value,
          subjectCode: document.getElementById('assignmentSubjectCode').value.trim(),
          subjectName: document.getElementById('assignmentSubjectName').value.trim(),
          units: document.getElementById('assignmentUnits').value,
          professorId: document.getElementById('assignmentProfessor').value
        });
        form.reset();
        if (feedback) feedback.textContent = 'Professor assignment saved to the database.';
        showToast('Professor assignment saved.');
        await refreshAdminClassData();
      } else if (form.id === 'classEnrollmentForm') {
        event.preventDefault();
        await apiRequest('enroll_student_in_class', 'POST', {
          classId: document.getElementById('enrollmentClass').value,
          ccdiId: document.getElementById('enrollmentStudentId').value.trim()
        });
        form.reset();
        showToast('Student enrolled in the section and its active subjects.');
        await refreshAdminClassData();
      } else if (form.id === 'gradeWeightsForm') {
        event.preventDefault();
        await apiRequest('save_grade_weights', 'POST', {
          prelimWeight: document.getElementById('prelimWeight').value,
          midtermWeight: document.getElementById('midtermWeight').value,
          prefinalWeight: document.getElementById('prefinalWeight').value,
          finalWeight: document.getElementById('finalWeight').value
        });
        showToast('Grading formula saved.');
        await refreshAdminClassData();
      } else if (form.id === 'professorInviteCheckForm') {
        event.preventDefault();
        const code = document.getElementById('professorInviteCode').value.trim();
        await apiRequest('check_professor_invite', 'POST', { code });
        document.getElementById('verifiedProfessorInvite').value = code;
        form.classList.add('hidden');
        document.getElementById('professorRegistrationForm').classList.remove('hidden');
        showToast('Invitation verified. Complete your professor profile.');
      } else if (form.id === 'professorRegistrationForm') {
        event.preventDefault();
        const password = document.getElementById('professorPassword').value;
        if (password !== document.getElementById('professorPasswordConfirm').value) {
          showToast('Passwords do not match.');
          return;
        }
        const result = await apiRequest('register_professor', 'POST', {
          invitationCode: document.getElementById('verifiedProfessorInvite').value,
          firstName: document.getElementById('professorFirstName').value.trim(),
          middleName: document.getElementById('professorMiddleName').value.trim(),
          lastName: document.getElementById('professorLastName').value.trim(),
          birthday: document.getElementById('professorBirthday').value,
          civilStatus: document.getElementById('professorCivilStatus').value.trim(),
          email: document.getElementById('professorEmail').value.trim(),
          phone: document.getElementById('professorPhone').value.trim(),
          address: document.getElementById('professorAddress').value.trim(),
          password
        });
        sessionStorage.setItem('ccdiRole', result.user.role);
        window.location.href = 'dashboard-professor.html';
      } else if (form.id === 'professorInviteForm') {
        event.preventDefault();
        const result = await apiRequest('create_professor_invite', 'POST', {
          expiresInDays: document.getElementById('inviteExpiry').value
        });
        const output = document.querySelector('[data-new-invite]');
        output.hidden = false;
        output.querySelector('[data-new-invite-code]').textContent = result.code;
        showToast('Invitation created. Copy the code before leaving this page.');
        await refreshProfessorInvites();
      } else if (form.id === 'announcementForm') {
        event.preventDefault();
        const publish = event.submitter?.dataset.announcementStatus === 'published';
        const announcementData = new FormData();
        announcementData.append('id', document.getElementById('announcementId').value);
        announcementData.append('title', document.getElementById('announcementTitle').value.trim());
        announcementData.append('content', document.getElementById('announcementContent').value.trim());
        announcementData.append('announcementDate', document.getElementById('announcementDate').value);
        announcementData.append('audience', document.getElementById('announcementAudience').value);
        announcementData.append('status', publish ? 'published' : 'draft');
        announcementData.append('attachmentUrl', document.getElementById('announcementAttachment').value.trim());
        const announcementImage = document.getElementById('announcementImage').files?.[0];
        if (announcementImage) announcementData.append('attachmentImage', announcementImage);
        await apiRequest('save_announcement', 'POST', announcementData);
        form.reset();
        if (feedback) feedback.textContent = publish ? 'Announcement published.' : 'Draft saved.';
        showToast(publish ? 'Announcement published.' : 'Announcement saved as draft.');
        await refreshDatabaseAnnouncements();
      } else if (form.id === 'meetingForm') {
        event.preventDefault();
        const publish = event.submitter?.dataset.meetingStatus === 'published';
        await apiRequest('save_meeting', 'POST', {
          id: document.getElementById('meetingId').value || null,
          title: document.getElementById('meetingTitle').value.trim(),
          description: document.getElementById('meetingDescription').value.trim(),
          meetingDate: document.getElementById('meetingDate').value,
          startTime: document.getElementById('meetingStartTime').value,
          endTime: document.getElementById('meetingEndTime').value,
          location: document.getElementById('meetingLocation').value.trim(),
          meetingLink: document.getElementById('meetingLink').value.trim(),
          audience: document.getElementById('meetingAudience').value,
          status: publish ? 'published' : 'draft'
        });
        form.reset();
        if (feedback) feedback.textContent = publish ? 'Meeting published.' : 'Draft saved.';
        showToast(publish ? 'Meeting published.' : 'Meeting saved as draft.');
        await refreshDatabaseMeetings();
      } else if (form.id === 'gradeEntryForm') {
        event.preventDefault();
        await apiRequest('save_grade', 'POST', {
          studentNumber: document.getElementById('gradeStudentNumber').value.trim(),
          subjectCode: document.getElementById('gradeSubjectCode').value.trim(),
          subjectName: document.getElementById('gradeSubjectName').value.trim(),
          instructor: document.getElementById('gradeInstructor').value.trim(),
          prelim: document.getElementById('gradePrelim').value,
          midterm: document.getElementById('gradeMidterm').value,
          prefinal: document.getElementById('gradePrefinal').value,
          final: document.getElementById('gradeFinal').value,
          published: document.getElementById('gradePublished').checked
        });
        showToast('Grade saved to the database.');
        await refreshStaffGradebook();
      } else if (form.id === 'scheduleEntryForm') {
        event.preventDefault();
        await apiRequest('save_schedule', 'POST', {
          course: document.getElementById('scheduleCourse').value,
          year: document.getElementById('scheduleYear').value,
          block: document.getElementById('scheduleBlock').value.trim(),
          subjectCode: document.getElementById('scheduleSubjectCode').value.trim(),
          subjectName: document.getElementById('scheduleSubjectName').value.trim(),
          units: document.getElementById('scheduleUnits').value,
          day: document.getElementById('scheduleDay').value,
          time: document.getElementById('scheduleTime').value.trim(),
          room: document.getElementById('scheduleRoom').value.trim(),
          instructor: document.getElementById('scheduleInstructor').value.trim()
        });
        showToast('Schedule entry saved and published.');
        form.reset();
        await refreshDatabaseSchedules(true);
      } else if (form.id === 'tuitionTermForm') {
        event.preventDefault();
        await apiRequest('save_tuition_term', 'POST', {
          schoolYear: document.getElementById('tuitionSchoolYear').value.trim(),
          name: document.getElementById('tuitionTermName').value,
          amount: document.getElementById('tuitionTermAmount').value,
          dueDate: document.getElementById('tuitionTermDueDate').value
        });
        showToast('Tuition term saved to the database.');
        await refreshDatabaseTuition();
      } else if (form.id === 'shopProductForm') {
        event.preventDefault();
        await apiRequest('save_product', 'POST', {
          sku: document.getElementById('productSku').value.trim(),
          name: document.getElementById('productName').value.trim(),
          description: document.getElementById('productDescription').value.trim(),
          price: document.getElementById('productPrice').value,
          image: document.getElementById('productImage').value.trim(),
          sizes: document.getElementById('productSizes').value.split(',').map((size) => size.trim()).filter(Boolean)
        });
        showToast('Shop product saved to the database.');
        await refreshDatabaseProducts();
      }
    } catch (error) {
      if (feedback) feedback.textContent = error.message;
      showToast(error.message);
    }
  });

  document.addEventListener('click', (event) => {
    const selectAssignment = event.target.closest('[data-select-assignment]');
    if (selectAssignment) {
      document.querySelectorAll('[data-select-assignment]').forEach((item) => item.classList.toggle('is-selected', item === selectAssignment));
      loadAssignmentGradebook(selectAssignment.dataset.selectAssignment).catch((error) => showToast(error.message));
    }

    if (event.target.closest('[data-close-gradebook]')) {
      document.getElementById('professorGradebook')?.classList.add('hidden');
      selectedProfessorAssignment = null;
      document.querySelector('[data-professor-assignments]')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    const saveAssignmentButton = event.target.closest('[data-save-assignment-grades]');
    if (saveAssignmentButton) saveAssignmentGrades(saveAssignmentButton.dataset.saveAssignmentGrades === 'published');

    const dropStudentButton = event.target.closest('[data-drop-assignment-student]');
    if (dropStudentButton) dropAssignmentStudent(dropStudentButton.dataset.dropAssignmentStudent);

    const editClassAssignment = event.target.closest('[data-edit-class-assignment]');
    if (editClassAssignment) {
      const item = administratorClassData?.assignments.find((entry) => String(entry.assignment_id) === editClassAssignment.dataset.editClassAssignment);
      if (item) {
        document.getElementById('assignmentClass').value = item.class_id;
        document.getElementById('assignmentSubjectCode').value = item.subject_code;
        document.getElementById('assignmentSubjectName').value = item.subject_name;
        document.getElementById('assignmentUnits').value = item.units;
        document.getElementById('assignmentProfessor').value = item.professor_user_id;
        document.getElementById('classAssignmentForm').scrollIntoView({ behavior: 'smooth' });
      }
    }

    const removeClassAssignment = event.target.closest('[data-remove-class-assignment]');
    if (removeClassAssignment && window.confirm('Remove this class and subject assignment? Grade history will be retained.')) {
      apiRequest('remove_class_assignment', 'POST', { assignmentId: removeClassAssignment.dataset.removeClassAssignment })
        .then(async () => { showToast('Assignment removed.'); await refreshAdminClassData(); })
        .catch((error) => showToast(error.message));
    }

    const announcementCard = event.target.closest('[data-announcement-detail]');
    if (announcementCard && !event.target.closest('a, button')) {
      openAnnouncementDetails(announcementCard.dataset.announcementDetail);
    }
    if (event.target.closest('[data-close-announcement]')) {
      document.getElementById('announcementDetailModal')?.classList.add('hidden');
    }

    const revokeInvite = event.target.closest('[data-revoke-invite]');
    if (revokeInvite) {
      apiRequest('revoke_professor_invite', 'POST', { id: revokeInvite.dataset.revokeInvite })
        .then(async () => { showToast('Invitation revoked.'); await refreshProfessorInvites(); })
        .catch((error) => showToast(error.message));
    }

    if (event.target.closest('[data-copy-invite]')) {
      const code = document.querySelector('[data-new-invite-code]')?.textContent || '';
      if (code) navigator.clipboard.writeText(code).then(() => showToast('Invitation code copied.'))
        .catch(() => showToast('Select and copy the invitation code.'));
    }

    const editAnnouncement = event.target.closest('[data-edit-announcement]');
    if (editAnnouncement) {
      const item = databaseAnnouncements.find((entry) => String(entry.id) === editAnnouncement.dataset.editAnnouncement);
      if (item) {
        document.getElementById('announcementId').value = item.id;
        document.getElementById('announcementTitle').value = item.title;
        document.getElementById('announcementContent').value = item.content;
        document.getElementById('announcementDate').value = item.announcement_date || new Date(item.created_at).toISOString().slice(0, 10);
        document.getElementById('announcementAudience').value = item.audience;
        document.getElementById('announcementAttachment').value = item.attachment_url || '';
        document.getElementById('announcementImage').value = '';
        document.getElementById('announcementForm').scrollIntoView({ behavior: 'smooth' });
      }
    }

    const publishAnnouncement = event.target.closest('[data-publish-announcement]');
    if (publishAnnouncement) {
      const item = databaseAnnouncements.find((entry) => String(entry.id) === publishAnnouncement.dataset.publishAnnouncement);
      if (item) apiRequest('save_announcement', 'POST', {
        id: item.id, title: item.title, content: item.content,
        announcementDate: item.announcement_date || new Date(item.created_at).toISOString().slice(0, 10), audience: item.audience,
        status: 'published', attachmentUrl: item.attachment_url || ''
      }).then(async () => { showToast('Announcement published.'); await refreshDatabaseAnnouncements(); })
        .catch((error) => showToast(error.message));
    }

    const deleteAnnouncement = event.target.closest('[data-delete-announcement]');
    if (deleteAnnouncement && window.confirm('Delete this announcement?')) {
      apiRequest('delete_announcement', 'POST', { id: deleteAnnouncement.dataset.deleteAnnouncement })
        .then(async () => { showToast('Announcement deleted.'); await refreshDatabaseAnnouncements(); })
        .catch((error) => showToast(error.message));
    }

    const editMeeting = event.target.closest('[data-edit-meeting]');
    if (editMeeting) {
      const item = databaseMeetings.find((entry) => String(entry.id) === editMeeting.dataset.editMeeting);
      if (item) {
        document.getElementById('meetingId').value = item.id;
        document.getElementById('meetingTitle').value = item.title;
        document.getElementById('meetingDescription').value = item.description;
        document.getElementById('meetingDate').value = item.meeting_date;
        document.getElementById('meetingStartTime').value = item.start_time.slice(0, 5);
        document.getElementById('meetingEndTime').value = item.end_time.slice(0, 5);
        document.getElementById('meetingLocation').value = item.location || '';
        document.getElementById('meetingLink').value = item.meeting_link || '';
        document.getElementById('meetingAudience').value = item.audience;
        document.getElementById('meetingForm').scrollIntoView({ behavior: 'smooth' });
      }
    }

    const publishMeeting = event.target.closest('[data-publish-meeting]');
    if (publishMeeting) {
      const item = databaseMeetings.find((entry) => String(entry.id) === publishMeeting.dataset.publishMeeting);
      if (item) apiRequest('save_meeting', 'POST', {
        id: item.id, title: item.title, description: item.description, meetingDate: item.meeting_date,
        startTime: item.start_time.slice(0, 5), endTime: item.end_time.slice(0, 5), location: item.location || '',
        meetingLink: item.meeting_link || '', audience: item.audience, status: 'published'
      }).then(async () => { showToast('Meeting published.'); await refreshDatabaseMeetings(); })
        .catch((error) => showToast(error.message));
    }

    const deleteMeeting = event.target.closest('[data-delete-meeting]');
    if (deleteMeeting && window.confirm('Delete this meeting?')) {
      apiRequest('delete_meeting', 'POST', { id: deleteMeeting.dataset.deleteMeeting })
        .then(async () => { showToast('Meeting deleted.'); await refreshDatabaseMeetings(); })
        .catch((error) => showToast(error.message));
    }

    const logoutLink = event.target.closest('a[href="index.html"]');
    if (logoutLink && logoutLink.textContent.trim().toLowerCase() === 'logout') {
      event.preventDefault();
      window.logout();
    }

    const confirmPayment = event.target.closest('[data-confirm-payment]');
    if (confirmPayment) {
      apiRequest('confirm_tuition_payment', 'POST', { paymentId: confirmPayment.dataset.confirmPayment })
        .then(async () => {
          showToast('Tuition payment confirmed.');
          await refreshDatabaseTuition();
        })
        .catch((error) => showToast(error.message));
    }

    const confirmEnrollmentPayment = event.target.closest('[data-confirm-enrollment-payment]');
    if (confirmEnrollmentPayment) {
      apiRequest('confirm_enrollment_payment', 'POST', { paymentId: confirmEnrollmentPayment.dataset.confirmEnrollmentPayment })
        .then(async (result) => {
          showToast(`Payment confirmed. CCDI ID ${result.studentNumber} assigned.`);
          await refreshDatabaseEnrollmentPayments();
        })
        .catch((error) => showToast(error.message));
    }

    const sectionLink = event.target.closest('.sidebar .nav-item[data-section]');
    if (sectionLink) {
      event.preventDefault();
      document.getElementById(sectionLink.dataset.section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setActiveNav(sectionLink.dataset.page);
      document.getElementById('sidebar')?.classList.remove('open');
      document.querySelector('.mobile-menu')?.setAttribute('aria-expanded', 'false');
      document.querySelector('.mobile-menu')?.setAttribute('aria-label', 'Open navigation');
    }

    const serviceLink = event.target.closest('.sidebar .nav-item[data-service]');
    if (serviceLink) {
      event.preventDefault();
      showServicePanel(serviceLink.dataset.service);
    }

    const serviceTile = event.target.closest('.service-tile[data-service]');
    if (serviceTile) showServicePanel(serviceTile.dataset.service);

    const payButton = event.target.closest('[data-pay-term]');
    if (payButton) window.payTuitionPeriod(payButton.dataset.payTerm);

    const receiptButton = event.target.closest('[data-receipt-id]');
    if (receiptButton) window.location.href = `payment-receipt.html?id=${encodeURIComponent(receiptButton.dataset.receiptId)}`;

    const removeButton = event.target.closest('[data-remove-cart-item]');
    if (removeButton) {
      const cart = readRecords('ccdiCart');
      cart.splice(Number(removeButton.dataset.removeCartItem), 1);
      localStorage.setItem('ccdiCart', JSON.stringify(cart));
      renderShopCheckout();
    }

    if (event.target.closest('#completeShopPayment')) window.completeShopPayment();

    const printButton = event.target.closest('button');
    if (printButton && /print/i.test(printButton.textContent)) window.print();

    const addToCartButton = event.target.closest('.shop-item [data-add-product]');
    if (addToCartButton) {
      const item = addToCartButton.closest('.shop-item');
      const itemName = item?.querySelector('h3')?.textContent.trim();
      const size = item?.querySelector('select')?.value;
      const cart = readRecords('ccdiCart');
      cart.push({ product: item.dataset.product, name: itemName, size: size || 'One size', price: Number(item.dataset.price || 0) });
      localStorage.setItem('ccdiCart', JSON.stringify(cart));
      renderShopCheckout();
      showToast(`${itemName} added to cart.`);
    }

    if (event.target.classList.contains('modal')) event.target.classList.add('hidden');
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'rosterClass') {
      loadAdminClassRoster(event.target.value).catch((error) => showToast(error.message));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.getElementById('announcementDetailModal')?.classList.add('hidden');
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-announcement-detail]')) {
      event.preventDefault();
      openAnnouncementDetails(event.target.dataset.announcementDetail);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target.matches('[data-grade-term]')) {
      const row = event.target.closest('tr[data-grade-enrollment]');
      if (row) updateAssignmentTotal(row);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    setupPublicNavigation();
    setupMobileMenu();
    setupStudentHeader();
    replaceNavigationButtons();
    orderStudentNavigation();
    syncRoleNavigation(document.body.dataset.role || 'student');
    if (document.body.dataset.page === 'profile') {
      document.body.classList.add('profile-page');
      document.getElementById('sidebar')?.remove();
      document.querySelector('.mobile-menu')?.remove();
    }
    document.querySelectorAll('.sidebar .nav-item[data-page]').forEach((item) => {
      if (item.dataset.page === document.body.dataset.page) item.classList.add('active');
    });
    loadPageTemplate();
    mountStudentDashboardSections();
    initializePageSearch();
    setupBackNavigation();
    populateStudentProfile();
    renderStudentGrades();
    renderStudentSchedule();
    restoreDashboardService();
    renderTuition();
    renderTuitionReceipt();
    renderShopCheckout();
    renderShopReceipt();
    renderIT2DGrades();
    document.getElementById('angeloGradeRows')?.addEventListener('input', () => {
      const status = document.getElementById('angeloGradeStatus');
      if (status) {
        status.textContent = 'Unsaved changes';
        status.className = 'badge badge-warning';
      }
    });
    initializeScrollNavigation();
    ['scheduleCourseFilter', 'scheduleYearFilter', 'scheduleBlockFilter'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        const course = document.getElementById('scheduleCourseFilter')?.value || 'all';
        const year = document.getElementById('scheduleYearFilter')?.value || 'all';
        const block = document.getElementById('scheduleBlockFilter')?.value || 'all';
        let visibleCount = 0;
        document.querySelectorAll('.schedule-catalog').forEach((section) => {
          const visible = (course === 'all' || section.dataset.course === course)
            && (year === 'all' || section.dataset.year === year)
            && (block === 'all' || section.dataset.block === block);
          section.hidden = !visible;
          if (visible) visibleCount += 1;
        });
        const unavailable = document.getElementById('scheduleUnavailable');
        if (unavailable) unavailable.hidden = visibleCount > 0;
      });
    });
    const role = sessionStorage.getItem('ccdiRole');
    const sidebarRole = document.getElementById('sidebarRole');
    if (role && sidebarRole) sidebarRole.textContent = role.toUpperCase();
    const profile = JSON.parse(localStorage.getItem('ccdiStudentProfile') || '{}');
    document.querySelectorAll('[data-student-name]').forEach((name) => {
      if (profile.name) name.textContent = profile.name.split(' ')[0];
    });
    if (profile.name) {
      localStorage.setItem('ccdiStudentName', profile.name);
      document.querySelectorAll('#topUserName').forEach((name) => { name.textContent = profile.name; });
      document.querySelectorAll('#profileSummary h2').forEach((name) => { name.textContent = profile.name; });
    }
      initializeDatabasePage().then(() => {
        if (apiUser?.role === 'student' && ['grades', 'dashboard'].includes(document.body.dataset.page)) {
          const refreshVisibleGrades = () => {
            if (document.visibilityState === 'visible') refreshDatabaseGrades().catch((error) => showToast(error.message));
          };
          window.addEventListener('focus', refreshVisibleGrades);
          window.setInterval(refreshVisibleGrades, 30000);
        }
      }).catch((error) => showToast(error.message));
  });

  window.addEventListener('hashchange', restoreDashboardService);
})();


(() => {
  const form = document.getElementById('siteSearchForm');
  const input = document.getElementById('siteSearchInput');
  const clearButton = document.getElementById('siteSearchClear');
  const emptyState = document.getElementById('publicSearchEmpty');
  if (!form || !input || !emptyState) return;

  const sections = [...document.querySelectorAll('#publicContent > section')];
  const searchableItems = '.feature-card, .announcement-card, .student-event-row, .info-box';

  function filterPublicContent() {
    const query = input.value.trim().toLocaleLowerCase();
    let matches = 0;

    sections.forEach((section) => {
      const items = [...section.querySelectorAll(searchableItems)];
      if (!query) {
        section.hidden = false;
        items.forEach((item) => { item.hidden = false; });
        return;
      }

      if (items.length) {
        let sectionMatches = 0;
        items.forEach((item) => {
          const matched = item.textContent.toLocaleLowerCase().includes(query);
          item.hidden = !matched;
          if (matched) sectionMatches += 1;
        });
        section.hidden = sectionMatches === 0;
        matches += sectionMatches;
      } else {
        const matched = section.textContent.toLocaleLowerCase().includes(query);
        section.hidden = !matched;
        if (matched) matches += 1;
      }
    });

    emptyState.hidden = !query || matches > 0;
    if (clearButton) clearButton.hidden = !query;
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    filterPublicContent();
  });
  input.addEventListener('input', filterPublicContent);
  clearButton?.addEventListener('click', () => {
    input.value = '';
    filterPublicContent();
    input.focus();
  });
})();
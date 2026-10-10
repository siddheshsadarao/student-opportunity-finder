import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, writeFile, rm, access } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import express from 'express';

const database = new PGlite();
let server, base, adminToken, studentToken, temp, studentId, resumeFile;
const call = (url, token = adminToken, options = {}) => fetch(`${base}${url}`, {
  ...options, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
});

before(async () => {
  for (const file of ['schema.sql', 'migration_002_ingestion.sql', 'migration_006_email_resume.sql', 'migration_007_student_phone.sql', 'migration_009_listing_freshness.sql']) {
    await database.exec(await readFile(new URL(`../../database/${file}`, import.meta.url), 'utf8'));
  }
  const { pool } = await import('../src/config/db.js');
  pool.query = (sql, params) => database.query(sql, params);
  pool.connect = async () => ({ query: (sql, params) => database.query(sql, params), release() {} });
  temp = await mkdtemp(path.join(os.tmpdir(), 'sof-admin-test-'));
  process.env.RESUME_STORAGE_DIR = temp;
  const { default: routes } = await import('../src/routes/adminRoutes.js');
  const { default: profileRoutes } = await import('../src/routes/profileRoutes.js');
  const { default: authRoutes } = await import('../src/routes/authRoutes.js');
  const { default: config } = await import('../src/config/env.js');
  config.email.resendApiKey = '';
  const { signToken } = await import('../src/utils/jwt.js');
  const admin = (await database.query("INSERT INTO users(name,email,password_hash,role) VALUES('Admin','admin@test.invalid','test','admin') RETURNING id,role")).rows[0];
  const student = (await database.query("INSERT INTO users(name,email,password_hash,email_verified) VALUES('Student','pending@test.invalid','test',FALSE) RETURNING id,role")).rows[0];
  studentId = student.id;
  resumeFile = path.join(temp, 'test-resume.pdf');
  await writeFile(resumeFile, '%PDF-1.4\nTest resume');
  await database.query("INSERT INTO student_profiles(user_id,resume_storage_name,resume_original_name) VALUES($1,'test-resume.pdf','student.pdf')", [studentId]);
  adminToken = signToken(admin); studentToken = signToken(student);
  const app = express(); app.use(express.json()); app.use('/admin', routes);
  app.use('/profile', profileRoutes);
  app.use('/auth', authRoutes);
  app.use((error, _req, res, _next) => res.status(error.statusCode || 500).json({ message: error.message }));
  server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await database.close();
  if (temp) await rm(temp, { recursive: true, force: true });
});

test('admin includes pending students, resume metadata and filters', async () => {
  const response = await call('/admin/students?status=pending&hasResume=true');
  assert.equal(response.status, 200);
  const { data } = await response.json();
  assert.equal(data.students.length, 1);
  assert.equal(data.students[0].email_verified, false);
  assert.equal(data.students[0].has_resume, true);
  assert.equal(data.students[0].resume_storage_name, undefined);
});

test('registration saves optional mobile and state without mobile OTP', async () => {
  const payload = { name: 'Registration Student', email: 'registration@test.invalid', password: 'Student123', confirmPassword: 'Student123', phone: '+91 98765 43210', state: 'Maharashtra', city: 'Mumbai' };
  const response = await call('/auth/register', null, { method: 'POST', body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  const { data } = await response.json();
  assert.equal(data.verificationRequired, true);
  const saved = (await database.query('SELECT p.phone,p.state,u.verification_code_hash FROM student_profiles p JOIN users u ON u.id=p.user_id WHERE u.email=$1', [payload.email])).rows[0];
  assert.equal(saved.phone, payload.phone);
  assert.equal(saved.state, payload.state);
  assert.ok(saved.verification_code_hash);
  const invalid = await call('/auth/register', null, { method: 'POST', body: JSON.stringify({ ...payload, email: 'invalid-mobile@test.invalid', phone: 'not a number' }) });
  assert.equal(invalid.status, 400);
  const noMobile = await call('/auth/register', null, { method: 'POST', body: JSON.stringify({ ...payload, email: 'optional-mobile@test.invalid', phone: '', state: '' }) });
  assert.equal(noMobile.status, 201);
});

test('state persists through profile edits and is visible to admin', async () => {
  await database.query('UPDATE users SET email_verified=TRUE WHERE id=$1', [studentId]);
  const updated = await call('/profile', studentToken, { method: 'PUT', body: JSON.stringify({ state: 'Delhi', phone: '9876543210' }) });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).data.state, 'Delhi');
  const partial = await call('/profile', studentToken, { method: 'PUT', body: JSON.stringify({ city: 'New Delhi' }) });
  assert.equal((await partial.json()).data.state, 'Delhi');
  const list = await call('/admin/students?search=pending%40test.invalid');
  const result = await list.json();
  assert.equal(result.data.students.find((student) => student.id === studentId).state, 'Delhi');
});

test('resume and deletion endpoints reject students and anonymous visitors', async () => {
  assert.equal((await call(`/admin/students/${studentId}/resume`, studentToken)).status, 403);
  assert.equal((await call(`/admin/students/${studentId}/resume`, null)).status, 401);
  assert.equal((await call(`/admin/students/${studentId}`, studentToken, { method: 'DELETE', body: '{}' })).status, 403);
});

test('admin downloads private resume and cannot delete an admin', async () => {
  const response = await call(`/admin/students/${studentId}/resume`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /no-store/);
  assert.match(await response.text(), /Test resume/);
  assert.equal((await call('/admin/students/1', adminToken, { method: 'DELETE', body: JSON.stringify({ confirmEmail: 'admin@test.invalid' }) })).status, 404);
});

test('student image upload is validated and admin retrieves the original image', async () => {
  const user = (await database.query("INSERT INTO users(name,email,password_hash,email_verified) VALUES('Image student','image@test.invalid','test',TRUE) RETURNING id,role")).rows[0];
  await database.query('INSERT INTO student_profiles(user_id) VALUES($1)', [user.id]);
  const { signToken } = await import('../src/utils/jwt.js');
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9XcAAAAASUVORK5CYII=', 'base64');
  const payload = new FormData(); payload.append('resume', new Blob([image], { type: 'image/png' }), 'resume.png');
  const response = await fetch(`${base}/profile/resume`, { method: 'POST', headers: { Authorization: `Bearer ${signToken(user)}` }, body: payload });
  assert.equal(response.status, 201);
  const stored = (await database.query('SELECT resume_storage_name,resume_mime_type FROM student_profiles WHERE user_id=$1', [user.id])).rows[0];
  assert.equal(stored.resume_mime_type, 'image/png');
  const preview = await call(`/admin/students/${user.id}/resume`);
  assert.equal(preview.status, 200);
  assert.match(preview.headers.get('content-type'), /image\/png/);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), image);
  const invalid = new FormData(); invalid.append('resume', new Blob(['<script>bad</script>']), 'fake.png');
  const rejected = await fetch(`${base}/profile/resume`, { method: 'POST', headers: { Authorization: `Bearer ${signToken(user)}` }, body: invalid });
  assert.equal(rejected.status, 400);
  assert.equal((await database.query('SELECT resume_storage_name FROM student_profiles WHERE user_id=$1', [user.id])).rows[0].resume_storage_name, stored.resume_storage_name);
  const restricted = new FormData(); restricted.append('resume', new Blob(['<svg/>']), 'resume.svg');
  assert.equal((await fetch(`${base}/profile/resume`, { method: 'POST', headers: { Authorization: `Bearer ${signToken(user)}` }, body: restricted })).status, 400);
});

test('suspension invalidates existing tokens and restore re-enables access', async () => {
  assert.equal((await call(`/admin/students/${studentId}/status`, adminToken, { method: 'PATCH', body: JSON.stringify({ isActive: false }) })).status, 200);
  assert.equal((await call('/admin/students', studentToken)).status, 403);
  assert.equal((await call(`/admin/students/${studentId}/status`, adminToken, { method: 'PATCH', body: JSON.stringify({ isActive: true }) })).status, 200);
});

test('delete requires email confirmation and cascades profile and private file', async () => {
  assert.equal((await call(`/admin/students/${studentId}`, adminToken, { method: 'DELETE', body: JSON.stringify({ confirmEmail: 'wrong' }) })).status, 400);
  const response = await call(`/admin/students/${studentId}`, adminToken, { method: 'DELETE', body: JSON.stringify({ confirmEmail: 'pending@test.invalid' }) });
  assert.equal(response.status, 200);
  assert.equal((await database.query('SELECT * FROM student_profiles WHERE user_id=$1', [studentId])).rows.length, 0);
  await assert.rejects(access(resumeFile));
  assert.equal((await call('/admin/students', studentToken)).status, 401);
});

test('freshness migration preserves unknown deadlines and hides stale or exact-time closed rows', async () => {
  const category = (await database.query("SELECT id FROM categories WHERE slug='job'")).rows[0].id;
  await database.query(`INSERT INTO opportunities(title,organization,category_id,description,application_url,is_external,deadline,deadline_at,ingested_at)
    VALUES ('Fresh','Employer',$1,'Real role','https://example.org',TRUE,NULL,NULL,NOW()),
           ('Stale','Employer',$1,'Real role','https://example.org',TRUE,NULL,NULL,NOW()-INTERVAL '49 hours'),
           ('Closed','Employer',$1,'Real role','https://example.org',TRUE,CURRENT_DATE,NOW()-INTERVAL '1 minute',NOW())`, [category]);
  const rows = (await database.query('SELECT title FROM opportunities o WHERE sof_is_open(o)')).rows;
  assert.deepEqual(rows.map((row) => row.title), ['Fresh']);
});

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

describe('read-only Production state integrity reconciliation', () => {
  test('binds the retained controlled onboarding identity chain and migration head', () => {
    const sql = read('scripts/productionStateIntegrityReconciliation.sql');
    for (const value of [
      '20260813140000',
      '961a4354-40f5-479d-a577-74839596ad14',
      'a865f157-c334-447e-aa1e-661ee0db7b85',
      '29b9b342-335e-4959-9402-4cb4e1090427',
      'ef06368d-6981-4fa6-8317-657bd6418f32',
      '2dd42623-5095-47ef-a46e-ace0f684dcf4',
      'd8a1ab9e-227b-46a6-b4b4-ea73c2d520be',
      '5afd5961-be47-4504-89bf-a51e737f3cf7',
      'eca3b587-bca1-40da-b91b-fb0eef7555ea',
      'ca153101-1ce5-451e-b21d-95133434a701',
      'd6b51071-817d-4b58-bf14-780d7d9d8fd8',
    ]) expect(sql).toContain(value);
    expect(sql).toMatch(/max\(version\)[\s\S]*20260813140000/);
    expect(sql).toMatch(/version>'20260813140000'/);
  });

  test('proves frozen genuine-data counts and digests without mutation', () => {
    const sql = read('scripts/productionStateIntegrityReconciliation.sql');
    for (const [count, digest] of [
      [27, '361ec0ed3203caf8f71f5a0e580fb98f'],
      [23, '8481208a52acf250dcb45d8ddd954297'],
      [20, 'ac6d293bc50227acac86e26feaaac141'],
      [18, 'e2c080779ebb0c3eda4f6ba63eb7a712'],
      [18, '341a30e6f87afdcaaab99d8622c95ba8'],
      [7, '7544fdbf2a4820630183588eaa0d542a'],
      [3, 'ea98f788724f969e823071afdcbb1ec4'],
      [6, 'f29ee3e6379136074b2f69dc715e2d46'],
    ]) {
      expect(sql).toContain(String(count));
      expect(sql).toContain(digest);
    }
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate|alter|create|drop|grant|revoke)\b/i);
  });

  test('classifies unfrozen history evidence explicitly and emits bounded evidence only', () => {
    const sql = read('scripts/productionStateIntegrityReconciliation.sql');
    expect(sql).toContain('NOT PREVIOUSLY FROZEN');
    expect(sql).toContain('MATCH');
    expect(sql).toMatch(/commercial_onboarding_application_events/);
    expect(sql).toMatch(/commercial_onboarding_invitation_events/);
    expect(sql).toMatch(/audit_events/);
    expect(sql).toMatch(/transactional_outbox/);
    expect(sql).toContain("array['SUBMITTED','UNDER_REVIEW','APPROVED']");
    expect(sql).toContain("array['PENDING','SENT','ACCEPTED']");
    expect(sql).toContain("business_name like 'SC ACCEPTANCE — %'");
    expect(sql).not.toMatch(/email|phone|payload\s+as|submitted_payload/i);
  });
});

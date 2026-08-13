describe('controlled onboarding REST error reporting', () => {
  test('reports bounded database diagnostics and request identity without leaking protected fields', async () => {
    const { controlledOnboardingRestError } = await import('../../scripts/controlledOnboardingRestError.mjs');
    const error = controlledOnboardingRestError({
      path: 'rpc/ftf_archive_controlled_commercial_onboarding?private=1',
      status: 500,
      body: {
        code: '55000',
        message: 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH',
        details: 'COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH',
        hint: 'COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore',
        service_role_key: 'must-not-leak',
        payload: { protected: true },
      },
      headers: new Headers({ 'x-request-id': 'request-123' }),
    });

    expect(error.message).toContain('rpc/ftf_archive_controlled_commercial_onboarding (500)');
    expect(error.message).toContain('code=55000');
    expect(error.message).toContain('message=COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH');
    expect(error.message).toContain('detail=COMMERCIAL_ONBOARDING_ACCEPTANCE_LEGACY_STORE_MISMATCH');
    expect(error.message).toContain('hint=COMMERCIAL_ONBOARDING_ACCEPTANCE_EVIDENCE_INVALID: legacyStore');
    expect(error.message).toContain('requestId=request-123');
    expect(error.message).not.toMatch(/must-not-leak|protected|private=1|service_role_key|payload/);
  });

  test('bounds diagnostic field lengths and tolerates a non-object response', async () => {
    const { controlledOnboardingRestError } = await import('../../scripts/controlledOnboardingRestError.mjs');
    const error = controlledOnboardingRestError({
      path: 'rpc/archive', status: 503, body: 'raw response', headers: new Headers(),
    });
    expect(error.message).toBe('Controlled onboarding verification failed at rpc/archive (503).');

    const bounded = controlledOnboardingRestError({
      path: 'rpc/archive', status: 500,
      body: { code: 'PGRST500', message: 'x'.repeat(1000) }, headers: new Headers(),
    });
    expect(bounded.message.length).toBeLessThan(500);
  });

  test('redacts protected values embedded inside otherwise recognised diagnostic fields', async () => {
    const { controlledOnboardingRestError } = await import('../../scripts/controlledOnboardingRestError.mjs');
    const error = controlledOnboardingRestError({
      path: 'rpc/archive', status: 500,
      body: {
        code: '55000',
        message: 'sk-ant-api03-ABCDEF',
        details: 'eyJhbGciOiJIUzI1NiJ9.payload.signature',
        hint: 'PlainAlphanumericCredentialWithoutMarker123456',
      },
      headers: new Headers({ 'x-request-id': 'request=unsafe-secret' }),
    });
    expect(error.message).toContain('code=55000');
    expect(error.message).not.toMatch(/sk-ant|eyJhbGci|PlainAlphanumericCredential|unsafe-secret/);
    expect(error.message.match(/\[redacted\]/g)).toHaveLength(4);
  });
});

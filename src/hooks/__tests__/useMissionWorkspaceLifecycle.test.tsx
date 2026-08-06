import { act, renderHook, waitFor } from '@testing-library/react';
import { useMissionWorkspaceLifecycle } from '../useMissionWorkspaceLifecycle';

test('derives authorisation and completion from authoritative APIs', async () => {
  const apis = { readAuthorisation: jest.fn().mockResolvedValue({ id: 'auth-1' }), readCloseout: jest.fn().mockResolvedValue({ completion: { id: 'completion-1' } }) };
  const { result } = renderHook(() => useMissionWorkspaceLifecycle('mission-1', apis));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current).toMatchObject({ authorised: true, completed: true, error: null });
});

test('fails closed when lifecycle evidence cannot be loaded', async () => {
  const apis = { readAuthorisation: jest.fn().mockRejectedValue(new Error('Unavailable')), readCloseout: jest.fn() };
  const { result } = renderHook(() => useMissionWorkspaceLifecycle('mission-1', apis));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current).toMatchObject({ authorised: false, completed: false, error: 'Unavailable' });
});

test('refreshes authoritative lifecycle evidence on demand', async () => {
  const apis = { readAuthorisation: jest.fn().mockResolvedValue(null), readCloseout: jest.fn().mockResolvedValue({ completion: null }) };
  const { result } = renderHook(() => useMissionWorkspaceLifecycle('mission-1', apis));
  await waitFor(() => expect(apis.readAuthorisation).toHaveBeenCalledTimes(1));
  act(() => result.current.refresh());
  await waitFor(() => expect(apis.readAuthorisation).toHaveBeenCalledTimes(2));
});

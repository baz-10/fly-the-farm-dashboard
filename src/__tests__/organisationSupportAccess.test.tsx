import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import OrganisationSupportAccess from '../components/admin/OrganisationSupportAccess';

test('keeps request and same-person approval as separate visible actions', async () => {
  const user = userEvent.setup();
  const api = {
    list: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ request_id: 'request-1', state: 'PENDING', row_version: 1 }),
    decide: jest.fn().mockResolvedValue({ approval_id: 'approval-1', requester_is_approver: true, state: 'APPROVED' }),
  };
  render(<OrganisationSupportAccess api={api} />);
  await user.type(screen.getByLabelText(/support reason/i), 'Investigate mission save failure');
  await user.click(screen.getByRole('button', { name: /request support/i }));
  expect(await screen.findByText(/request recorded/i)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: /approve request/i }));
  await waitFor(() => expect(screen.getByText(/requester and approver are the same person/i)).toBeInTheDocument());
});

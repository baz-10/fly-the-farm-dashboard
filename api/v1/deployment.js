module.exports = function deploymentIdentity(_request, response) {
  const commitSha = String(process.env.SPRAY_COMMAND_RELEASE_SHA || '').trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/.test(commitSha)) {
    return response.status(503).json({ error: { code: 'DEPLOYMENT_IDENTITY_UNAVAILABLE' } });
  }
  response.setHeader('Cache-Control', 'no-store');
  return response.status(200).json({ data: { commitSha } });
};

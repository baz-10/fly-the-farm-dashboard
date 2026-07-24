const { registerLocalApiMiddleware } = require('../server/localApiMiddleware');

module.exports = function setupProxy(app) {
  registerLocalApiMiddleware(app);
};

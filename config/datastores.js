// config/datastores.js
module.exports.datastores = {
  mysqlServer: {
    adapter: require('sails-mysql'),
    url: 'mysql://root@localhost/wikimess',
  }
};

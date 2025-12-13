function create(info) {
  return require('./dist/cjs/jsx-ts-plugin.js').create(info)
}

module.exports = create
module.exports.create = create
module.exports.default = create

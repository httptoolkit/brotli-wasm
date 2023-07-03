/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

function withWebpack(nextConfig) {
  return Object.assign({}, nextConfig, {
    webpack(config) {
      // For WASM
      config.experiments = {
        ...config.experiments,
        asyncWebAssembly: true,
      }

      if (typeof nextConfig.webpack == 'function') {
        return nextConfig.webpack(config, options)
      }
      return config
    },
  })
}

module.exports = withWebpack(nextConfig)

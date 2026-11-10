const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

config.resolver.assetExts.push('tflite');

// react-native-fast-tflite is a native-only (Nitro Modules) library that Expo Go
// doesn't ship, so it isn't installed here at all. Redirect every import of it —
// on every platform — to a stub that rejects when used
// (see stubs/react-native-fast-tflite.js).
const { resolveRequest: defaultResolveRequest } = config.resolver;
config.resolver.resolveRequest = (context, moduleName, platform, ...rest) => {
  if (moduleName === 'react-native-fast-tflite') {
    return {
      type: 'sourceFile',
      filePath: path.resolve(__dirname, 'stubs/react-native-fast-tflite.js'),
    };
  }
  return defaultResolveRequest
    ? defaultResolveRequest(context, moduleName, platform, ...rest)
    : context.resolveRequest(context, moduleName, platform, ...rest);
};

// 웹 미리보기용: /skin-api/* 를 같은 서버의 추론 서버(serve_skin.py, 127.0.0.1:8765)로 넘긴다.
// 브라우저는 Metro 주소 하나만 알면 되고(포트 포워딩 하나), CORS도 필요 없다. 네이티브는 .env 주소를 쓴다.
const http = require('http');
const SKIN_API_PORT = Number(process.env.SKIN_API_PORT || 8765);
config.server = config.server || {};
const prevEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = prevEnhance ? prevEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith('/skin-api/')) return base(req, res, next);
    const upstream = http.request(
      {
        host: '127.0.0.1',
        port: SKIN_API_PORT,
        method: req.method,
        path: req.url.slice('/skin-api'.length),
        headers: { ...req.headers, host: `127.0.0.1:${SKIN_API_PORT}` },
      },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      },
    );
    upstream.on('error', (e) => {
      res.writeHead(502, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ detail: `추론 서버(127.0.0.1:${SKIN_API_PORT})에 연결하지 못했어요: ${e.message}` }));
    });
    req.pipe(upstream);
  };
};

module.exports = config;

# Test client (web app)

This package contains a simple web app that allows to connect to a ws-protocol compliant server and test websocket data throughput. The web app is also available at https://foxglove.github.io/ws-protocol (Note: Use `http` when connecting to an insecure websocket server).

### Building

```bash
# Install dependencies
yarn install

# Build static web app. Output will be in `dist` folder
yarn workspace test-client-web-app build
```

### Local development

```bash
# Run development server
yarn workspace test-client-web-app start
```

import http from "http";

import app from "./app.js";
import { env } from "./config/env.js";
import { createSocketServer } from "./socket/socket.server.js";

const server = http.createServer(app);

createSocketServer(server);

server.listen(env.PORT, () => {
  console.log(`Server running on http://localhost:${env.PORT}`);
});

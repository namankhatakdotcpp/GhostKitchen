import { io, type Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (!socket) {
    socket = io(process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:5000", {
      autoConnect: false,
      transports: ["websocket"],
    });
  }

  if (typeof window !== "undefined") {
    const token = window.localStorage.getItem("ghost-kitchen-token");

    socket.auth = token ? { token } : {};
  }

  return socket;
}

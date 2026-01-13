import { io, type Socket } from 'socket.io-client';
import { SOCKET_BASE_URL } from '../config/backend';

// PREVIOUS IMPLEMENTATION (commented out):
// - Hard-coded localhost backend URL.
//
// Reason for change:
// - In production (Vercel + Fly), the browser must connect to the Fly app domain.
//   We configure this via VITE_BACKEND_URL / VITE_SOCKET_URL.
//
// const SOCKET_URL = 'http://localhost:5000';
const SOCKET_URL = SOCKET_BASE_URL || 'http://localhost:5000';

// PREVIOUS IMPLEMENTATION (commented out):
// - A singleton socket connected immediately on import and had no auth payload.
//
// Reason for change:
// - The backend now requires Clerk JWT verification during the socket handshake, so we must set `auth.token` before connecting.
//
// export const socket = io(SOCKET_URL, {
//   autoConnect: true,
//   reconnection: true,
//   reconnectionAttempts: 10,
//   reconnectionDelay: 1000,
//   reconnectionDelayMax: 5000,
//   timeout: 20000,
//   transports: ['websocket', 'polling'],
//   forceNew: false,
//   upgrade: true,
//   rememberUpgrade: true,
// });

let socket: Socket | null = null;

export function getSocket(token: string | null): Socket {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      transports: ['websocket', 'polling'],
      forceNew: false,
      upgrade: true,
      rememberUpgrade: true,
    });
  } else {
    socket.auth = { token };
  }
  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

import jwt from "jsonwebtoken";
import { WebSocketServer } from "ws";

const clientsByUser = new Map();

function addClient(userId, ws) {
  const existing = clientsByUser.get(userId) || new Set();
  existing.add(ws);
  clientsByUser.set(userId, existing);
}

function removeClient(userId, ws) {
  const existing = clientsByUser.get(userId);
  if (!existing) {
    return;
  }
  existing.delete(ws);
  if (existing.size === 0) {
    clientsByUser.delete(userId);
  }
}

export function notifyUser(userId, payload) {
  const clients = clientsByUser.get(userId);
  if (!clients || clients.size === 0) {
    return;
  }

  const message = JSON.stringify(payload);
  clients.forEach((client) => {
    if (client.readyState === client.OPEN) {
      client.send(message);
    }
  });
}

export function initializeWebSocket(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    try {
      const host = req.headers.host || "localhost";
      const url = new URL(req.url || "/", `http://${host}`);
      const token = url.searchParams.get("token");

      if (!token) {
        ws.close(1008, "Missing token");
        return;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const userId = decoded?.id;

      if (!userId) {
        ws.close(1008, "Invalid token");
        return;
      }

      ws.userId = userId;
      addClient(userId, ws);

      ws.on("close", () => removeClient(userId, ws));
      ws.on("error", () => removeClient(userId, ws));
    } catch (error) {
      ws.close(1008, "Unauthorized");
    }
  });

  return wss;
}

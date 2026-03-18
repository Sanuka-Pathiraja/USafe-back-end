import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    console.error("[AUTH] JWT_SECRET is not configured");
    return res.status(500).json({ error: "Authentication is not configured" });
  }

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return res.status(401).json({ error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    console.warn("[AUTH] Token verification failed");
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

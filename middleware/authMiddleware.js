import jwt from "jsonwebtoken";

export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log("[AUTH] Incoming Authorization header:", authHeader);

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("[AUTH] No token provided");
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  console.log("[AUTH] Extracted token:", token);

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { id, email }
    console.log("[AUTH] Token decoded successfully:", decoded);
    next();
  } catch (err) {
    console.log("[AUTH] Token verification failed:", err.message);
    res.status(401).json({ error: "Invalid or expired token" });
  }
};

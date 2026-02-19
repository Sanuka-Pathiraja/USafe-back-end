import jwt from "jsonwebtoken";

// export const authMiddleware = (req, res, next) => {
//   const authHeader = req.headers.authorization;

//   if (!authHeader || !authHeader.startsWith("Bearer ")) {
//     return res.status(401).json({ error: "No token provided" });
//   }

//   const token = authHeader.split(" ")[1];

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = decoded; // { id, email }
//     next();
//   } catch (err) {
//     res.status(401).json({ error: "Invalid or expired token" });
//   }
// };



export default function authMiddleware(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;

    if (!token) {
      return res.status(401).json({
        ok: false,
        success: false,
        code: "UNAUTHORIZED",
        message: "No token provided. Please re-login.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: decoded.id, email: decoded.email };

    next();
  } catch (err) {
    return res.status(401).json({
      ok: false,
      success: false,
      code: "UNAUTHORIZED",
      message: "Invalid or expired token. Please re-login.",
    });
  }
}

import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getMyContacts,
  addMyContact,
  updateMyContact,
  deleteMyContact,
} from "../Controller/ContactController.js";

const router = Router();

// With app.use("/contact", contactRouter):
// GET    /contact/contacts
// POST   /contact/contacts
// PUT    /contact/contacts/:contactId
// DELETE /contact/contacts/:contactId

router.get("/contacts", authMiddleware, getMyContacts);
router.post("/contacts", authMiddleware, addMyContact);
router.put("/contacts/:contactId", authMiddleware, updateMyContact);
router.delete("/contacts/:contactId", authMiddleware, deleteMyContact);

export default router;

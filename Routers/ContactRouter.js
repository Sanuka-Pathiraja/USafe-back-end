import { Router } from "express";
import authMiddleware from "../middleware/authMiddleware.js";
import {
  getMyContacts,
  addMyContact,
  updateMyContact,
  deleteMyContact,
} from "../Controller/ContactController.js";

const router = Router();

/*
  With this router and:
  app.use("/contact", contactRouter);

  Your final endpoints become:

  GET    /contact/contacts
  POST   /contact/contacts
  PUT    /contact/contacts/:contactId
  DELETE /contact/contacts/:contactId
*/

// Get logged-in user's emergency contacts
router.get("/contacts", authMiddleware, getMyContacts);

// Add new emergency contact
router.post("/contacts", authMiddleware, addMyContact);

// Update existing emergency contact
router.put("/contacts/:contactId", authMiddleware, updateMyContact);

// Delete emergency contact
router.delete("/contacts/:contactId", authMiddleware, deleteMyContact);

export default router;

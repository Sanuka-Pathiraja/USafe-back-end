import express from "express";
import { createContact, getContacts, updateContact, deleteContact } from "../Controller/ContactController.js";

const contactRouter = express.Router();
contactRouter.post("/add", createContact);
contactRouter.get("/", getContacts);
contactRouter.put("/update/:id", updateContact);
contactRouter.delete("/delete/:id", deleteContact);
export default contactRouter;

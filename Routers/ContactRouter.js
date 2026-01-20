import express from "express";
import { createContact, getContacts } from "../Controller/ContactController.js";

const contactRouter = express.Router();
contactRouter.post("/add", createContact);
contactRouter.get("/get", getContacts);

export default contactRouter;

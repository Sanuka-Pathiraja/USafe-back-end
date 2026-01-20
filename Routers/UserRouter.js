import express from "express";
import { createUser, getUsers, getUserById, getUserContacts } from "../Controller/UserController.js";

const Userrouter = express.Router();

Userrouter.post("/add", createUser);
Userrouter.get("/list", getUsers);
Userrouter.get("/get/:id", getUserById);
Userrouter.get("/contacts/:id", getUserContacts);

export default Userrouter;

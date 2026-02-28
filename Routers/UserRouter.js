import express from "express";
import { createUser, getUsers, getUserById, getUserContacts, loginUser, updateUser, deleteUser, googleLogin } from "../Controller/UserController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const Userrouter = express.Router();

Userrouter.post("/add", createUser);
Userrouter.post("/login", loginUser);
Userrouter.post("/googleLogin", googleLogin);
Userrouter.get("/", getUsers);
Userrouter.get("/get", authMiddleware, getUserById);
Userrouter.get("/contacts/", getUserContacts);
Userrouter.put("/update", authMiddleware, updateUser);
Userrouter.delete("/delete", authMiddleware, deleteUser);

export default Userrouter;

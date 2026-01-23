import express from "express";
import { createUser, getUsers, getUserById, getUserContacts, loginUser, updateUser, deleteUser, googleLogin } from "../Controller/UserController.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const Userrouter = express.Router();

Userrouter.post("/add", createUser);
Userrouter.post("/login", loginUser);
Userrouter.post("/googleLogin", googleLogin);
Userrouter.get("/", authMiddleware, getUsers);
Userrouter.get("/get/:id", getUserById);
Userrouter.get("/contacts/:id", getUserContacts);
Userrouter.put("/update/:id", authMiddleware, updateUser);
Userrouter.delete("/delete/:id", authMiddleware, deleteUser);

export default Userrouter;

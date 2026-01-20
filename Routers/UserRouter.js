import express from "express";
import { createUser, getUsers } from "../Controller/UserController.js";

const Userrouter = express.Router();

Userrouter.post("/add", createUser);
Userrouter.get("/list", getUsers);

export default Userrouter;

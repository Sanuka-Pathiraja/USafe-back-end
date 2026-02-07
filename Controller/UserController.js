import AppDataSource from "../config/data-source.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

/* ================= CREATE USER ================= */
export const createUser = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const { firstName, lastName, age, phone, email, password } = req.body;

    // Check if user already exists
    const existingUser = await repo.findOneBy({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = repo.create({
      firstName,
      lastName,
      age,
      phone,
      email,
      password: hashedPassword,
    });

    await repo.save(user);
    delete user.password;

    res.status(201).json({
      success: true,
      message: "User created successfully",
      user,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/* ================= LOGIN USER ================= */
export const loginUser = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const { email, password } = req.body;

    const user = await repo.findOneBy({ email });
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(401).json({ error: "Invalid email or password" });

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    delete user.password;

    res.json({
      success: true,
      message: "Login successful",
      token,
      user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET ALL USERS ================= */
export const getUsers = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const users = await repo.find({
      select: ["id", "firstName", "lastName", "age", "phone", "email"],
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET USER BY JWT ================= */
export const getUserById = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const userId = req.user.id; // ✅ get from authMiddleware
    const user = await repo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    delete user.password;
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET USER CONTACTS ================= */
export const getUserContacts = async (req, res) => {
  try {
    const userId = req.user?.id; // get user from JWT if auth
    const userRepo = AppDataSource.getRepository("User");
    const contactRepo = AppDataSource.getRepository("Contact");

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const contacts = await contactRepo.find({
      where: { user: { id: userId } },
      select: {
        contactId: true,
        name: true,
        relationship: true,
        phone: true,
        user: { id: true },
      },
      relations: { user: true },
    });

    res.json(contacts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= UPDATE USER ================= */
export const updateUser = async (req, res) => {
  try {
    const userRepo = AppDataSource.getRepository("User");
    const userId = req.user.id; // ✅ from JWT

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const { firstName, lastName, age, phone } = req.body;

    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (age !== undefined) user.age = age;
    if (phone !== undefined) user.phone = phone;

    await userRepo.save(user);
    delete user.password;

    res.json({
      success: true,
      message: "User updated successfully",
      user,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= DELETE USER ================= */
export const deleteUser = async (req, res) => {
  try {
    const userRepo = AppDataSource.getRepository("User");
    const userId = req.user.id; // from JWT

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    await userRepo.remove(user);
    res.json({
      success: true,
      message: "Your account has been deleted",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GOOGLE LOGIN ================= */
import { OAuth2Client } from "google-auth-library";
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Google token is required" });

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, given_name: firstName, family_name: lastName } = payload;

    const userRepo = AppDataSource.getRepository("User");
    let user = await userRepo.findOneBy({ email });

    if (!user) {
      user = userRepo.create({
        email,
        firstName,
        lastName,
        authProvider: "google",
        password: null,
      });
      await userRepo.save(user);
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: "Google login successful",
      token,
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName },
    });
  } catch (err) {
    res.status(401).json({ error: "Invalid Google token" });
  }
};

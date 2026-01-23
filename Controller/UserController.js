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

    // Remove password from response
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
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid email or password" });
    }

    // Generate JWT
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
/* ================= GET USERS ================= */

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

export const getUserById = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const user = await repo.findOneBy({ id: req.params.id });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET USERS AND CONTACTS ================= */

export const getUserContacts = async (req, res) => {
  try {
    const userId = req.params.id;
    const userRepo = AppDataSource.getRepository("User");
    const contactRepo = AppDataSource.getRepository("Contact");
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    } else {
      const contacts = await contactRepo.find({
        where: { user: { id: userId } },
        select: {
          contactId: true,
          name: true,
          relationship: true,
          phone: true,
          user: {
            id: true, // 👈 ONLY user id
          },
        },
        relations: {
          user: true,
        },
      });
      if (contacts.length === 0) {
        return res.status(404).json({ error: "contacts not found" });
      }
      res.json(contacts);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= UPDATE USERS  ================= */

export const updateUser = async (req, res) => {
  try {
    const userRepo = AppDataSource.getRepository("User");
    const tokenUserId = req.user.id;
    const userId = Number(req.params.id);
    if (tokenUserId !== userId) {
      return res.status(403).json({
        error: "You are not allowed to delete this user",
      });
    }
    const user = await userRepo.findOneBy({ id: tokenUserId });
    if (!user) {
      return res.status(404).json({ error: "user not found" });
    } else {
      const { firstName, lastName, age, phone } = req.body;
      user.firstName = firstName || user.firstName;
      user.lastName = lastName || user.lastName;
      user.age = age || user.age;
      user.phone = phone || user.phone;

      await userRepo.save(user);
      res.json({
        success: true,
        message: "user updated successfully",
        user,
      });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= DELETE USERS  ================= */

export const deleteUser = async (req, res) => {
  try {
    const userRepo = AppDataSource.getRepository("User");

    const tokenUserId = req.user.id; // 🔐 from JWT
    const paramUserId = Number(req.params.id);

    // ❌ Prevent deleting other users
    if (tokenUserId !== paramUserId) {
      return res.status(403).json({
        error: "You are not allowed to delete this user",
      });
    }

    const user = await userRepo.findOneBy({ id: tokenUserId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    await userRepo.remove(user);

    res.json({
      success: true,
      message: "Your account has been deleted",
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ================= GOOGLE LOGIN  ================= //

import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export const googleLogin = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: "Google token is required" });
    }

    // 🔐 Verify Google token
    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const { email, given_name: firstName, family_name: lastName } = payload;

    const userRepo = AppDataSource.getRepository("User");

    let user = await userRepo.findOneBy({ email });

    // 🆕 Auto-create user if not exists
    if (!user) {
      user = userRepo.create({
        email,
        firstName,
        lastName,
        authProvider: "google",
        password: null, // 🚫 no password
      });

      await userRepo.save(user);
    }

    // 🔐 Issue YOUR JWT
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });

    res.json({
      success: true,
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (err) {
    res.status(401).json({ error: "Invalid Google token" });
  }
};

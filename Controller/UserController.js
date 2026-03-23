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
    const userRepo = AppDataSource.getRepository("User");
    const reportRepo = AppDataSource.getRepository("CommunityReport");
    const userId = req.user.id;
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const communityReportCount = await reportRepo.count({
      where: { user: { id: userId } },
    });

    delete user.password;
    res.json({
      ...user,
      communityReportCount,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ================= GET MY COMMUNITY REPORT COUNT ================= */
export const getMyCommunityReportCount = async (req, res) => {
  try {
    const userRepo = AppDataSource.getRepository("User");
    const reportRepo = AppDataSource.getRepository("CommunityReport");
    const userId = req.user.id;

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    const communityReportCount = await reportRepo.count({
      where: { user: { id: userId } },
    });

    res.json({
      success: true,
      userId,
      communityReportCount,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
    const userId = req.user.id;

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
    const userId = req.user.id;

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

const normalizeGoogleBirthday = (birthday) => {
  if (!birthday?.date) return null;
  const { year, month, day } = birthday.date;
  if (!month || !day) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  if (year) return `${year}-${mm}-${dd}`;
  return `${mm}-${dd}`;
};

const getGoogleProfileExtras = async (accessToken) => {
  const result = {
    birthday: null,
    phone: null,
    avatar: null,
    peopleApiStatus: null,
    birthdayFound: false,
    phoneFound: false,
    error: null,
  };

  if (!accessToken) {
    result.error = "ACCESS_TOKEN_MISSING";
    return result;
  }

  try {
    const response = await fetch(
      "https://people.googleapis.com/v1/people/me?personFields=birthdays,phoneNumbers,photos",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    result.peopleApiStatus = response.status;

    if (!response.ok) {
      let errorPayload = null;
      try {
        errorPayload = await response.json();
      } catch {
        errorPayload = null;
      }
      result.error = errorPayload?.error?.message || `PEOPLE_API_${response.status}`;
      return result;
    }

    const data = await response.json();
    result.birthday = normalizeGoogleBirthday(data?.birthdays?.[0]);
    result.phone = data?.phoneNumbers?.[0]?.value || null;
    result.avatar = data?.photos?.[0]?.url || null;
    result.birthdayFound = !!result.birthday;
    result.phoneFound = !!result.phone;

    return result;
  } catch (err) {
    result.error = err?.message || "PEOPLE_API_REQUEST_FAILED";
    return result;
  }
};

export const googleLogin = async (req, res) => {
  try {
    const { idToken, accessToken } = req.body;
    if (!idToken) return res.status(400).json({ error: "Google token is required" });
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(500).json({ error: "GOOGLE_CLIENT_ID is not configured" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ error: "JWT_SECRET is not configured" });
    }
    const includeDebug = process.env.NODE_ENV !== "production" && (req.query?.debug === "1" || req.body?.debug === true);

    console.log("GOOGLE_LOGIN_REQUEST", {
      hasIdToken: !!idToken,
      hasAccessToken: !!accessToken,
    });

    const ticket = await client.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const { email, email_verified, given_name, family_name, picture } = payload || {};

    if (!email) {
      return res.status(400).json({ error: "Google account email is required" });
    }
    if (!email_verified) {
      return res.status(401).json({ error: "Google email is not verified" });
    }

    console.log("GOOGLE_LOGIN_VERIFIED", {
      email,
      emailVerified: email_verified,
    });

    const firstName = given_name || "Google";
    const lastName = family_name || "User";
    const googleAvatarFromIdToken = picture || null;
    const googleExtras = await getGoogleProfileExtras(accessToken);
    const finalAvatar = googleExtras.avatar || googleAvatarFromIdToken;

    const userRepo = AppDataSource.getRepository("User");
    let user = await userRepo.findOneBy({ email });

    if (!user) {
      const googleOnlyPassword = await bcrypt.hash(`google-${email}-${Date.now()}`, 10);
      user = userRepo.create({
        email,
        firstName,
        lastName,
        authProvider: "google",
        password: googleOnlyPassword,
        age: 0,
        phone: googleExtras.phone || "N/A",
        avatar: finalAvatar,
        birthday: googleExtras.birthday,
      });
      await userRepo.save(user);
    } else {
      let isDirty = false;

      if (!user.firstName) {
        user.firstName = firstName;
        isDirty = true;
      }
      if (!user.lastName) {
        user.lastName = lastName;
        isDirty = true;
      }
      if (!user.authProvider) {
        user.authProvider = "google";
        isDirty = true;
      }
      if ((!user.phone || user.phone === "N/A") && googleExtras.phone) {
        user.phone = googleExtras.phone;
        isDirty = true;
      }
      if ((!user.avatar || user.avatar.trim() === "") && finalAvatar) {
        user.avatar = finalAvatar;
        isDirty = true;
      }
      if ((!user.birthday || user.birthday.trim() === "") && googleExtras.birthday) {
        user.birthday = googleExtras.birthday;
        isDirty = true;
      }

      if (isDirty) {
        await userRepo.save(user);
      }
    }

    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
    const baseResponse = {
      success: true,
      message: "Google login successful",
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        phone: user.phone || googleExtras.phone || null,
        avatar: user.avatar || finalAvatar,
        birthday: user.birthday || googleExtras.birthday,
      },
    };

    console.log("GOOGLE_LOGIN_PROFILE_RESULT", {
      peopleApiStatus: googleExtras.peopleApiStatus,
      birthdayFound: googleExtras.birthdayFound,
      phoneFound: googleExtras.phoneFound,
      savedAvatar: !!(user.avatar || finalAvatar),
      savedPhone: !!(user.phone && user.phone !== "N/A"),
      savedBirthday: !!(user.birthday || googleExtras.birthday),
    });

    if (!accessToken) {
      baseResponse.message = "Google login successful (accessToken missing: birthday/phone may be null)";
    }
    if (includeDebug) {
      baseResponse.debug = {
        hasAccessToken: !!accessToken,
        peopleApiStatus: googleExtras.peopleApiStatus,
        birthdayFound: googleExtras.birthdayFound,
        phoneFound: googleExtras.phoneFound,
        peopleApiError: googleExtras.error,
      };
    }

    return res.json(baseResponse);
  } catch (err) {
    res.status(401).json({ error: "Invalid Google token", details: err.message });
  }
};

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

vi.mock("bcrypt", () => ({
  default: {
    hash: vi.fn(),
    compare: vi.fn(),
  },
}));

vi.mock("jsonwebtoken", () => ({
  default: {
    sign: vi.fn(),
    verify: vi.fn(),
  },
}));

// Prevent google-auth-library from being instantiated at module load
vi.mock("google-auth-library", () => {
  function OAuth2Client() {
    this.verifyIdToken = vi.fn();
  }
  return { OAuth2Client };
});

import AppDataSource from "../../config/data-source.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { createUser, loginUser } from "../../Controller/UserController.js";

function makeRes() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

function makeRepo(overrides = {}) {
  return {
    find: vi.fn(),
    findOne: vi.fn(),
    findOneBy: vi.fn(),
    create: vi.fn().mockReturnValue({}),
    save: vi.fn().mockResolvedValue({}),
    remove: vi.fn().mockResolvedValue(undefined),
    count: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── createUser ───────────────────────────────────────────────────────────────

describe("createUser", () => {
  it("returns 400 when the email is already registered", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: 1, email: "taken@example.com" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      body: { firstName: "John", lastName: "Doe", age: 25, phone: "0711111111", email: "taken@example.com", password: "pass" },
    };
    const res = makeRes();
    await createUser(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Email already registered" })
    );
  });

  it("hashes the password and returns 201 with success:true on success", async () => {
    const saved = { id: 10, firstName: "John", lastName: "Doe", email: "john@example.com", password: "hashed" };
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockReturnValue({ ...saved }),
      save: vi.fn().mockResolvedValue(saved),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    bcrypt.hash.mockResolvedValue("hashed");

    const req = {
      body: { firstName: "John", lastName: "Doe", age: 25, phone: "0711111111", email: "john@example.com", password: "secret" },
    };
    const res = makeRes();
    await createUser(req, res);

    expect(bcrypt.hash).toHaveBeenCalledWith("secret", 10);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("does not include password in the response", async () => {
    const saved = { id: 10, firstName: "John", email: "john@example.com", password: "hashed" };
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockReturnValue({ ...saved }),
      save: vi.fn().mockResolvedValue({ ...saved }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    bcrypt.hash.mockResolvedValue("hashed");

    const req = {
      body: { firstName: "John", lastName: "Doe", age: 25, phone: "07111", email: "john@example.com", password: "secret" },
    };
    const res = makeRes();
    await createUser(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload?.user?.password).toBeUndefined();
  });

  it("returns 500 when the database throws", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockRejectedValue(new Error("DB error")),
    });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = {
      body: { firstName: "John", email: "john@example.com", password: "pass" },
    };
    const res = makeRes();
    await createUser(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── loginUser ────────────────────────────────────────────────────────────────

describe("loginUser", () => {
  it("returns 401 when the user is not found", async () => {
    const repo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { body: { email: "nobody@example.com", password: "pass" } };
    const res = makeRes();
    await loginUser(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid email or password" })
    );
  });

  it("returns 401 when the password does not match", async () => {
    const repo = makeRepo({
      findOneBy: vi.fn().mockResolvedValue({ id: 1, email: "john@example.com", password: "hashed" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);
    bcrypt.compare.mockResolvedValue(false);

    const req = { body: { email: "john@example.com", password: "wrongpass" } };
    const res = makeRes();
    await loginUser(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: "Invalid email or password" })
    );
  });

  it("returns a JWT token and user on successful login", async () => {
    const user = { id: 1, email: "john@example.com", password: "hashed" };
    const repo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ ...user }) });
    AppDataSource.getRepository.mockReturnValue(repo);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock.jwt.token");

    const req = { body: { email: "john@example.com", password: "correctpass" } };
    const res = makeRes();
    await loginUser(req, res);

    expect(jwt.sign).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, token: "mock.jwt.token" })
    );
  });

  it("does not include password in the response", async () => {
    const user = { id: 1, email: "john@example.com", password: "hashed" };
    const repo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ ...user }) });
    AppDataSource.getRepository.mockReturnValue(repo);
    bcrypt.compare.mockResolvedValue(true);
    jwt.sign.mockReturnValue("mock.jwt.token");

    const req = { body: { email: "john@example.com", password: "correctpass" } };
    const res = makeRes();
    await loginUser(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload?.user?.password).toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../config/data-source.js", () => ({
  default: { getRepository: vi.fn() },
}));

vi.mock("../../CallFeat/notifylksms.js", () => ({
  sendNotifySMS: vi.fn(),
}));

import AppDataSource from "../../config/data-source.js";
import { sendNotifySMS } from "../../CallFeat/notifylksms.js";
import {
  getMyContacts,
  addMyContact,
  updateMyContact,
  deleteMyContact,
  sendContactAlert,
} from "../../Controller/ContactController.js";

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

// ─── getMyContacts ────────────────────────────────────────────────────────────

describe("getMyContacts", () => {
  it("returns a mapped list of contacts as JSON", async () => {
    const row = { contactId: 1, name: "Alice", relationship: "Friend", phone: "94711111111" };
    const repo = makeRepo({ find: vi.fn().mockResolvedValue([row]) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 42 } };
    const res = makeRes();
    await getMyContacts(req, res);

    expect(res.json).toHaveBeenCalledWith([row]);
  });

  it("returns 500 when the database throws", async () => {
    const repo = makeRepo({ find: vi.fn().mockRejectedValue(new Error("DB error")) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 42 } };
    const res = makeRes();
    await getMyContacts(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

// ─── addMyContact ─────────────────────────────────────────────────────────────

describe("addMyContact", () => {
  it("returns 400 when required fields are missing", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());

    const req = { user: { id: 1 }, body: { name: "Alice" } }; // missing phone & relationship
    const res = makeRes();
    await addMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("required") })
    );
  });

  it("returns 404 when the user does not exist", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(userRepo);

    const req = { user: { id: 99 }, body: { name: "Alice", phone: "0711111111", relationship: "Friend" } };
    const res = makeRes();
    await addMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when the phone number already exists for this user", async () => {
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ id: 1 }) });
    const contactRepo = makeRepo({ findOne: vi.fn().mockResolvedValue({ contactId: 5 }) });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : contactRepo
    );

    const req = { user: { id: 1 }, body: { name: "Alice", phone: "0711111111", relationship: "Friend" } };
    const res = makeRes();
    await addMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining("already saved") })
    );
  });

  it("creates the contact and returns 201 on success", async () => {
    const saved = { contactId: 10, name: "Alice", relationship: "Friend", phone: "0711111111" };
    const userRepo = makeRepo({ findOneBy: vi.fn().mockResolvedValue({ id: 1 }) });
    const contactRepo = makeRepo({
      findOne: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockReturnValue(saved),
      save: vi.fn().mockResolvedValue(saved),
    });
    AppDataSource.getRepository.mockImplementation((entity) =>
      entity === "User" ? userRepo : contactRepo
    );

    const req = { user: { id: 1 }, body: { name: "Alice", phone: "0711111111", relationship: "Friend" } };
    const res = makeRes();
    await addMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: "Alice" }));
  });
});

// ─── updateMyContact ──────────────────────────────────────────────────────────

describe("updateMyContact", () => {
  it("returns 400 for a non-numeric contactId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());

    const req = { user: { id: 1 }, params: { contactId: "abc" }, body: {} };
    const res = makeRes();
    await updateMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the contact does not belong to the user", async () => {
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 1 }, params: { contactId: "999" }, body: { name: "Bob" } };
    const res = makeRes();
    await updateMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns 400 when the new phone is a duplicate", async () => {
    const existing = { contactId: 1, name: "Alice", phone: "0711111111", user: { id: 1 } };
    const duplicate = { contactId: 2, phone: "0722222222" };
    const repo = makeRepo({
      findOne: vi.fn()
        .mockResolvedValueOnce(existing)   // first call: find the contact to update
        .mockResolvedValueOnce(duplicate), // second call: duplicate check
    });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 1 }, params: { contactId: "1" }, body: { phone: "0722222222" } };
    const res = makeRes();
    await updateMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("saves and returns the updated contact", async () => {
    const contact = { contactId: 1, name: "Alice", phone: "0711111111", relationship: "Friend", user: { id: 1 } };
    const repo = makeRepo({
      findOne: vi.fn().mockResolvedValue(contact),
      save: vi.fn().mockResolvedValue({ ...contact, name: "Alicia" }),
    });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 1 }, params: { contactId: "1" }, body: { name: "Alicia" } };
    const res = makeRes();
    await updateMyContact(req, res);

    expect(repo.save).toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: "Alicia" }));
  });
});

// ─── deleteMyContact ──────────────────────────────────────────────────────────

describe("deleteMyContact", () => {
  it("returns 400 for a non-numeric contactId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());

    const req = { user: { id: 1 }, params: { contactId: "xyz" } };
    const res = makeRes();
    await deleteMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the contact is not found", async () => {
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 1 }, params: { contactId: "5" } };
    const res = makeRes();
    await deleteMyContact(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("removes the contact and returns { success: true }", async () => {
    const contact = { contactId: 5, name: "Alice" };
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(contact) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 1 }, params: { contactId: "5" } };
    const res = makeRes();
    await deleteMyContact(req, res);

    expect(repo.remove).toHaveBeenCalledWith(contact);
    expect(res.json).toHaveBeenCalledWith({ success: true });
  });
});

// ─── sendContactAlert ─────────────────────────────────────────────────────────

describe("sendContactAlert", () => {
  it("returns 400 for a non-numeric contactId", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());

    const req = { user: { id: 1 }, params: { contactId: "bad" }, body: { message: "Help!" } };
    const res = makeRes();
    await sendContactAlert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 400 when message is empty or whitespace", async () => {
    AppDataSource.getRepository.mockReturnValue(makeRepo());

    const req = { user: { id: 1 }, params: { contactId: "1" }, body: { message: "   " } };
    const res = makeRes();
    await sendContactAlert(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  it("returns 404 when the contact is not found", async () => {
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(null) });
    AppDataSource.getRepository.mockReturnValue(repo);

    const req = { user: { id: 1 }, params: { contactId: "1" }, body: { message: "Help!" } };
    const res = makeRes();
    await sendContactAlert(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("sends SMS and returns 200 with success:true on success", async () => {
    const contact = { contactId: 1, name: "Alice", phone: "0711111111" };
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(contact) });
    AppDataSource.getRepository.mockReturnValue(repo);
    sendNotifySMS.mockResolvedValue({ data: { message_id: "abc123" } });

    const req = { user: { id: 1 }, params: { contactId: "1" }, body: { message: "Help!" } };
    const res = makeRes();
    await sendContactAlert(req, res);

    expect(sendNotifySMS).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it("returns 502 when the SMS provider throws", async () => {
    const contact = { contactId: 1, name: "Alice", phone: "0711111111" };
    const repo = makeRepo({ findOne: vi.fn().mockResolvedValue(contact) });
    AppDataSource.getRepository.mockReturnValue(repo);
    sendNotifySMS.mockRejectedValue(new Error("Provider down"));

    const req = { user: { id: 1 }, params: { contactId: "1" }, body: { message: "Help!" } };
    const res = makeRes();
    await sendContactAlert(req, res);

    expect(res.status).toHaveBeenCalledWith(502);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });
});

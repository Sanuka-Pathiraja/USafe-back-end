// Controller/ContactController.js
import AppDataSource from "../config/data-source.js";
import { sendNotifySMS } from "../CallFeat/notifylksms.js";
import { normalizeNum } from "../utils/normalizeNumberFormat.js";

const toDto = (c) => ({
  contactId: c.contactId,
  name: c.name,
  relationship: c.relationship,
  phone: c.phone,
});

const buildPhoneForResponse = (normalizedPhone) => {
  const digits = String(normalizedPhone || "").replace(/\D/g, "");
  return digits ? `+${digits}` : "";
};

const extractProviderMessageId = (providerResponse) => {
  if (!providerResponse || typeof providerResponse !== "object") return null;

  return (
    providerResponse?.data?.message_id ??
    providerResponse?.data?.messageId ??
    providerResponse?.message_id ??
    providerResponse?.messageId ??
    null
  );
};

async function writeSmsLog(payload) {
  try {
    const smsLogRepo = AppDataSource.getRepository("SmsLog");
    const entry = smsLogRepo.create(payload);
    await smsLogRepo.save(entry);
  } catch (logError) {
    console.error("Failed to persist SMS log:", logError.message);
  }
}

export const getMyContacts = async (req, res) => {
  try {
    const userId = req.user.id;
    const repo = AppDataSource.getRepository("Contact");

    const contacts = await repo.find({
      where: { user: { id: userId } },
      relations: { user: true },
      select: {
        contactId: true,
        name: true,
        relationship: true,
        phone: true,
        user: { id: true },
      },
      order: { contactId: "ASC" },
    });

    return res.json(contacts.map(toDto));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const addMyContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, phone, relationship } = req.body || {};

    if (!name || !phone || !relationship) {
      return res.status(400).json({ error: "name, phone, relationship required" });
    }

    const userRepo = AppDataSource.getRepository("User");
    const contactRepo = AppDataSource.getRepository("Contact");

    const user = await userRepo.findOneBy({ id: userId });
    if (!user) return res.status(404).json({ error: "User not found" });

    // prevent duplicates for THIS user only
    const existing = await contactRepo.findOne({
      where: { phone, user: { id: userId } },
      relations: { user: true },
    });

    if (existing) {
      return res.status(400).json({ error: "This phone is already saved in your contacts" });
    }

    const contact = contactRepo.create({ name, phone, relationship, user });
    const saved = await contactRepo.save(contact);

    return res.status(201).json(toDto(saved));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateMyContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = Number(req.params.contactId);
    const { name, phone, relationship } = req.body || {};

    if (!Number.isFinite(contactId)) {
      return res.status(400).json({ error: "Invalid contactId" });
    }

    const repo = AppDataSource.getRepository("Contact");

    const contact = await repo.findOne({
      where: { contactId, user: { id: userId } },
      relations: { user: true },
    });

    if (!contact) return res.status(404).json({ error: "Contact not found" });

    if (phone && phone !== contact.phone) {
      const dup = await repo.findOne({
        where: { phone, user: { id: userId } },
        relations: { user: true },
      });
      if (dup) return res.status(400).json({ error: "This phone is already saved in your contacts" });
      contact.phone = phone;
    }

    if (name) contact.name = name;
    if (relationship) contact.relationship = relationship;

    const saved = await repo.save(contact);
    return res.json(toDto(saved));
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteMyContact = async (req, res) => {
  try {
    const userId = req.user.id;
    const contactId = Number(req.params.contactId);

    if (!Number.isFinite(contactId)) {
      return res.status(400).json({ error: "Invalid contactId" });
    }

    const repo = AppDataSource.getRepository("Contact");

    const contact = await repo.findOne({
      where: { contactId, user: { id: userId } },
      relations: { user: true },
    });

    if (!contact) return res.status(404).json({ error: "Contact not found" });

    await repo.remove(contact);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const sendContactAlert = async (req, res) => {
  const userId = req.user.id;
  const contactId = Number(req.params.contactId);
  const trimmedMessage = String(req.body?.message ?? "").trim();
  let providerPhone = null;

  if (!Number.isFinite(contactId)) {
    return res.status(400).json({
      success: false,
      message: "Invalid contactId.",
    });
  }

  if (!trimmedMessage) {
    return res.status(400).json({
      success: false,
      message: "Message is required.",
    });
  }

  const contactRepo = AppDataSource.getRepository("Contact");

  try {
    const contact = await contactRepo.findOne({
      where: { contactId, user: { id: userId } },
      relations: { user: true },
    });

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found.",
      });
    }

    try {
      providerPhone = normalizeNum(contact.phone);
    } catch {
      return res.status(400).json({
        success: false,
        message: "Valid phone number is required.",
      });
    }

    const providerResponse = await sendNotifySMS({
      to: providerPhone,
      message: trimmedMessage,
      unicode: /[^\x00-\x7F]/.test(trimmedMessage),
    });

    await writeSmsLog({
      userId,
      contactId,
      phoneNumber: providerPhone,
      message: trimmedMessage,
      provider: "notifylk",
      providerResponse,
      status: "sent",
    });

    return res.status(200).json({
      success: true,
      message: "Emergency alert sent successfully.",
      provider: "notifylk",
      contactId,
      phoneNumber: buildPhoneForResponse(providerPhone),
      providerMessageId: extractProviderMessageId(providerResponse),
    });
  } catch (error) {
    await writeSmsLog({
      userId,
      contactId,
      phoneNumber: providerPhone,
      message: trimmedMessage,
      provider: "notifylk",
      providerResponse: {
        error: error.message,
      },
      status: "failed",
    });

    return res.status(502).json({
      success: false,
      message: "Failed to send emergency alert.",
    });
  }
};




// // Controller/ContactController.js
// import AppDataSource from "../config/data-source.js";

// const pickContactResponse = (c) => ({
//   contactId: c.contactId,
//   name: c.name,
//   relationship: c.relationship,
//   phone: c.phone,
// });

// export const getMyContacts = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const repo = AppDataSource.getRepository("Contact");

//     const contacts = await repo.find({
//       where: { user: { id: userId } },
//       relations: { user: true },
//       select: {
//         contactId: true,
//         name: true,
//         relationship: true,
//         phone: true,
//         user: { id: true },
//       },
//       order: { contactId: "ASC" },
//     });

//     // Return as a plain list (best for Flutter)
//     return res.json(contacts.map(pickContactResponse));
//   } catch (err) {
//     return res.status(500).json({ error: err.message });
//   }
// };

// export const addMyContact = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const { name, phone, relationship } = req.body;

//     if (!name || !phone || !relationship) {
//       return res.status(400).json({ error: "name, phone, relationship required" });
//     }

//     const userRepo = AppDataSource.getRepository("User");
//     const contactRepo = AppDataSource.getRepository("Contact");

//     const user = await userRepo.findOneBy({ id: userId });
//     if (!user) return res.status(404).json({ error: "User not found" });

//     // ✅ Duplicate check ONLY within this user
//     const existing = await contactRepo.findOne({
//       where: { phone, user: { id: userId } },
//       relations: { user: true },
//     });
//     if (existing) {
//       return res.status(400).json({ error: "This phone is already saved in your contacts" });
//     }

//     const contact = contactRepo.create({ name, phone, relationship, user });
//     const saved = await contactRepo.save(contact);

//     return res.status(201).json(pickContactResponse(saved));
//   } catch (err) {
//     return res.status(500).json({ error: err.message });
//   }
// };

// export const updateMyContact = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const contactId = Number(req.params.contactId);
//     const { name, relationship, phone } = req.body;

//     const contactRepo = AppDataSource.getRepository("Contact");

//     const contact = await contactRepo.findOne({
//       where: { contactId, user: { id: userId } },
//       relations: { user: true },
//     });

//     if (!contact) {
//       return res.status(404).json({ error: "Contact not found" });
//     }

//     // If phone is changing, ensure not duplicated for this user
//     if (phone && phone !== contact.phone) {
//       const dup = await contactRepo.findOne({
//         where: { phone, user: { id: userId } },
//         relations: { user: true },
//       });
//       if (dup) return res.status(400).json({ error: "This phone is already saved in your contacts" });
//       contact.phone = phone;
//     }

//     if (name) contact.name = name;
//     if (relationship) contact.relationship = relationship;

//     const saved = await contactRepo.save(contact);
//     return res.json(pickContactResponse(saved));
//   } catch (err) {
//     return res.status(500).json({ error: err.message });
//   }
// };

// export const deleteMyContact = async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const contactId = Number(req.params.contactId);

//     const repo = AppDataSource.getRepository("Contact");
//     const contact = await repo.findOne({
//       where: { contactId, user: { id: userId } },
//       relations: { user: true },
//     });

//     if (!contact) return res.status(404).json({ error: "Contact not found" });

//     await repo.remove(contact);
//     return res.json({ success: true });
//   } catch (err) {
//     return res.status(500).json({ error: err.message });
//   }
// };

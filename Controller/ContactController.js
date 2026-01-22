import AppDataSource from "../config/data-source.js";

export const createContact = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("Contact");
    const userRepo = AppDataSource.getRepository("User");

    const { name, relationship, phone, userId } = req.body;

    // Validate required fields
    if (!name || !relationship || !phone || !userId) {
      return res.status(400).json({ error: "All fields are required" });
    }

    // Check duplicate phone
    const existingContact = await repo.findOneBy({ phone });
    if (existingContact) {
      return res.status(400).json({
        success: false,
        error: "Contact with this phone number already exists",
      });
    }

    // Check user exists
    const user = await userRepo.findOneBy({ id: userId });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    // ✅ CORRECT way to create entity
    const contact = repo.create({
      name,
      relationship,
      phone,
      user, // TypeORM sets userId automatically
    });

    await repo.save(contact);

    res.status(201).json({
      success: true,
      message: "Contact saved successfully",
      contact: {
        contactId: contact.contactId,
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        userId: user.id,
      },
    });
  } catch (err) {
    console.error("contact saved unsuccessfull ❌", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getContacts = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("Contact");

    const contacts = await repo.find({
      relations: {
        user: true,
      },
      select: {
        contactId: true,
        name: true,
        relationship: true,
        phone: true,
        user: {
          id: true,
        },
      },
    });

    // Transform response
    const response = contacts.map((contact) => ({
      contactId: contact.contactId,
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      userId: contact.user.id,
    }));

    res.json({ success: true, contacts: response });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const updateContact = async (req, res) => {
  try {
    const contactRepo = AppDataSource.getRepository("Contact");
    const contactId = Number(req.params.contactId);
    const userId = req.user.id;
    const contact = await contactRepo.findOne({
      where: {
        contactId: contactId,
        user: { id: userId }, // 🔒 OWNERSHIP CHECK
      },
      relations: { user: true },
    });
    if (!contact) {
      return res.status(403).json({
        error: "Access denied or contact not found",
      });
    }
    const { name, relationship, phone } = req.body;
    contact.name = name || contact.name;
    contact.relationship = relationship || contact.relationship;
    contact.phone = phone || contact.phone;
    await contactRepo.save(contact);
    res.json({
      success: true,
      message: "contact updated successfully",
      contact: {
        contactId: contact.contactId,
        name: contact.name,
        relationship: contact.relationship,
        phone: contact.phone,
        userId: contact.user.id,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteContact = async (req, res) => {
  try {
    const contactRepo = AppDataSource.getRepository("Contact");

    const contactId = req.params.id;
    const userId = req.user.id; // from JWT

    const contact = await contactRepo.findOne({
      where: {
        contactId: contactId,
        user: { id: userId }, // 🔒 OWNERSHIP CHECK
      },
      relations: { user: true },
    });

    if (!contact) {
      return res.status(403).json({
        error: "Access denied or contact not found",
      });
    }

    await contactRepo.remove(contact);

    res.json({ success: true, message: "Contact deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

import AppDataSource from "../config/data-source.js";

export const createContact = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("Contact");
    const contact = repo.create(req.body);
    await repo.save(contact);
    console.log("Contact saved successfully ✔️");
    res.json({ success: true, contact });
  } catch (err) {
    console.log("contact saved unsuccessfull ❌");
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getContacts = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("Contact");
    const contacts = await repo.find();
    res.json(contacts);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

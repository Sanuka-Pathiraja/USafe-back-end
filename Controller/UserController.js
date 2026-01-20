import AppDataSource from "../config/data-source.js";

export const createUser = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const user = repo.create(req.body);
    await repo.save(user);
    console.log("User saved successfully ✔️");
    res.json({ success: true, user });
  } catch (err) {
    console.log("User saved unsuccessfull ❌");
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getUsers = async (req, res) => {
  try {
    const repo = AppDataSource.getRepository("User");
    const users = await repo.find();
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
        relations: ["user"],
      });
      res.json(contacts);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

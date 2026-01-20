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

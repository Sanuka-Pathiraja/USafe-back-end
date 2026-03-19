import { Router } from "express";
import { initiateCall } from "../Controller/CallController.js";

const router = Router();

router.post("/call", initiateCall);

export default router;

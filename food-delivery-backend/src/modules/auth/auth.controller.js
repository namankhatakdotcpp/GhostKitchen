import { registerUser, loginUser, getCurrentUser } from "./auth.service.js";
import { validateRegister, validateLogin } from "./auth.validation.js";

export const register = async (req, res) => {
  try {
    const error = validateRegister(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const result = await registerUser(req.body);
    res.status(201).json(result);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const error = validateLogin(req.body);
    if (error) {
      return res.status(400).json({ message: error });
    }

    const { email, password } = req.body;
    const result = await loginUser(email, password);

    res.status(200).json({
      token: result.token,
      user: {
        id: result.user.id,
        name: result.user.name,
        email: result.user.email,
        role: result.user.role,
      },
    });
  } catch (err) {
    res.status(401).json({ message: err.message });
  }
};

export const me = async (req, res) => {
  try {
    const user = await getCurrentUser(req.user.userId);
    res.status(200).json({ user });
  } catch (err) {
    res.status(404).json({ message: err.message });
  }
};

export const logout = async (req, res) => {
  // JWT is stateless, no server-side logout needed
  res.status(200).json({ message: "Logged out successfully" });
};

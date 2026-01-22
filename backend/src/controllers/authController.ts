import { Request, Response } from 'express';
import { authService } from '../services/authService';
import { LoginRequest, RegisterRequest, RefreshTokenRequest } from '../types';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, user_type, display_name }: RegisterRequest = req.body;

    if (!email || !password || !user_type) {
      res.status(400).json({
        success: false,
        error: 'Email, password, and user_type are required',
      });
      return;
    }

    if (!['kid', 'adult'].includes(user_type)) {
      res.status(400).json({
        success: false,
        error: 'Invalid user_type. Must be "kid" or "adult"',
      });
      return;
    }

    const result = await authService.register(email, password, user_type, display_name);

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    if (error.code === '23505') {
      res.status(409).json({
        success: false,
        error: 'Email already exists',
      });
      return;
    }

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password }: LoginRequest = req.body;

    if (!email || !password) {
      res.status(400).json({
        success: false,
        error: 'Email and password are required',
      });
      return;
    }

    const result = await authService.login(email, password);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken }: RefreshTokenRequest = req.body;

    if (!refreshToken) {
      res.status(400).json({
        success: false,
        error: 'Refresh token is required',
      });
      return;
    }

    const result = await authService.refresh(refreshToken);

    res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    res.status(401).json({
      success: false,
      error: error.message,
    });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await authService.logout(refreshToken);
    }

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

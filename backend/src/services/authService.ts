import * as bcrypt from 'bcrypt';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { config } from '../config/env';
import { query } from '../config/database';
import { User, AuthResponse } from '../types';

class AuthService {
  private readonly saltRounds = 10;

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  generateAccessToken(user: Omit<User, 'password_hash'>): string {
    const payload = {
      id: user.id,
      email: user.email,
      user_type: user.user_type,
      role: user.role,
    };

    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiry,
    });
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  verifyAccessToken(token: string): any {
    try {
      return jwt.verify(token, config.jwt.secret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  async saveRefreshToken(userId: string, refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + config.jwt.refreshExpiryDays); // 6 months by default

    await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, tokenHash, expiresAt]
    );
  }

  async verifyRefreshToken(refreshToken: string): Promise<string | null> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const result = await query(
      `SELECT user_id, expires_at FROM refresh_tokens
       WHERE token_hash = $1 AND expires_at > NOW()`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0].user_id;
  }

  async deleteRefreshToken(refreshToken: string): Promise<void> {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    await query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
  }

  async deleteExpiredTokens(): Promise<void> {
    await query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
  }

  async register(
    email: string,
    password: string,
    userType: 'kid' | 'adult',
    displayName?: string
  ): Promise<AuthResponse> {
    const passwordHash = await this.hashPassword(password);

    const result = await query(
      `INSERT INTO users (email, password_hash, user_type, display_name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, user_type, role, display_name, config, created_at`,
      [email, passwordHash, userType, displayName || null]
    );

    const user = result.rows[0];

    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken();

    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user,
      accessToken,
      refreshToken,
    };
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    const result = await query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('Invalid email or password');
    }

    const user = result.rows[0] as User;

    const isValidPassword = await this.comparePassword(password, user.password_hash);

    if (!isValidPassword) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const { password_hash, ...userWithoutPassword } = user;

    const accessToken = this.generateAccessToken(userWithoutPassword);
    const refreshToken = this.generateRefreshToken();

    await this.saveRefreshToken(user.id, refreshToken);

    return {
      user: userWithoutPassword,
      accessToken,
      refreshToken,
    };
  }

  async refresh(refreshToken: string): Promise<AuthResponse> {
    const userId = await this.verifyRefreshToken(refreshToken);

    if (!userId) {
      throw new Error('Invalid or expired refresh token');
    }

    // Delete old refresh token
    await this.deleteRefreshToken(refreshToken);

    // Get user
    const result = await query(
      'SELECT id, email, user_type, role, display_name, config FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];

    const accessToken = this.generateAccessToken(user);
    const newRefreshToken = this.generateRefreshToken();

    await this.saveRefreshToken(user.id, newRefreshToken);

    return {
      user,
      accessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.deleteRefreshToken(refreshToken);
  }
}

export const authService = new AuthService();

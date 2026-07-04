import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { AuthResponse, AuthTokens } from "@arenafit/shared";
import * as bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import { config } from "../config";
import { PrismaService } from "../prisma/prisma.service";
import { JwtPayload, LoginDto, RegisterDto } from "./dto";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function ttlToMs(ttl: string): number {
  const match = /^(\d+)([smhd])$/.exec(ttl);
  if (!match) return 7 * 24 * 3600 * 1000;
  const n = Number(match[1]);
  const unit = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[match[2] as "s" | "m" | "h" | "d"];
  return n * unit;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResponse> {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email.toLowerCase() }, { username: dto.username }] },
      select: { email: true },
    });
    if (existing) {
      throw new ConflictException(
        existing.email === dto.email.toLowerCase()
          ? "Email already registered"
          : "Username already taken",
      );
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        username: dto.username,
        passwordHash: await bcrypt.hash(dto.password, 10),
        profile: { create: { displayName: dto.username } },
      },
    });

    return { user: this.toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async login(dto: LoginDto): Promise<AuthResponse> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.identifier.toLowerCase() }, { username: dto.identifier }],
      },
    });
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return { user: this.toAuthUser(user), tokens: await this.issueTokens(user) };
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload: JwtPayload & { jti?: string };
    try {
      payload = await this.jwt.verifyAsync(refreshToken, {
        secret: config().JWT_REFRESH_SECRET,
      });
    } catch {
      throw new UnauthorizedException("Invalid refresh token");
    }

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
    });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token expired or revoked");
    }

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) throw new UnauthorizedException("User no longer exists");

    // Rotate: revoke the old token, issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(user);
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  verifyAccessToken(token: string): JwtPayload {
    try {
      return this.jwt.verify<JwtPayload>(token, { secret: config().JWT_ACCESS_SECRET });
    } catch {
      throw new UnauthorizedException("Invalid access token");
    }
  }

  private toAuthUser(user: { id: string; email: string; username: string; role: string }) {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role as "USER" | "ADMIN",
    };
  }

  private async issueTokens(user: {
    id: string;
    username: string;
    role: string;
  }): Promise<AuthTokens> {
    const { JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, JWT_ACCESS_TTL, JWT_REFRESH_TTL } = config();
    const payload: JwtPayload = {
      sub: user.id,
      username: user.username,
      role: user.role as "USER" | "ADMIN",
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: JWT_ACCESS_SECRET,
      expiresIn: Math.floor(ttlToMs(JWT_ACCESS_TTL) / 1000),
    });
    const refreshToken = await this.jwt.signAsync(
      { ...payload, jti: randomUUID() },
      { secret: JWT_REFRESH_SECRET, expiresIn: Math.floor(ttlToMs(JWT_REFRESH_TTL) / 1000) },
    );

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(Date.now() + ttlToMs(JWT_REFRESH_TTL)),
      },
    });

    return { accessToken, refreshToken };
  }
}

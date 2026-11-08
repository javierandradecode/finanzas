export interface JwtPayload {
  sub: string;
  email: string;
}

export interface AuthUser {
  userId: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  user: { id: string; email: string; name: string; currency: string };
}

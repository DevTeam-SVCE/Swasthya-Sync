export type UserRole = "admin" | "staff";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  hospitalName: string;
  hospitalId: string;
  department?: string;
  designation?: string;
  avatarInitials: string;
}

export interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterCredentials {
  hospitalName: string;
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
}

export interface LoginResponse {
  user: AuthUser;
  token: string;
}

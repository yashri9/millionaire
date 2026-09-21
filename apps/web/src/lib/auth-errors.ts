/**
 * Maps Supabase Auth / network failures to user-facing copy.
 * Never reveal whether a specific email is registered.
 */

export type AuthField = "email" | "password" | "confirm" | "name" | "form";

export type AuthFeedback = {
  field: AuthField;
  message: string;
  /** Offer resend verification when email is unconfirmed */
  offerResend?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

export function validateEmail(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Enter your email address.";
  if (!isValidEmail(trimmed)) return "Enter a valid email address.";
  return null;
}

export function validatePassword(
  password: string,
  opts: { required?: boolean; minLength?: number } = {},
): string | null {
  const { required = true, minLength = 8 } = opts;
  if (!password) return required ? "Enter your password." : null;
  if (password.length < minLength) {
    return `Password must be at least ${minLength} characters.`;
  }
  return null;
}

export function validatePasswordConfirm(
  password: string,
  confirm: string,
): string | null {
  if (!confirm) return "Confirm your password.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

/** Normalize AuthError-like objects from supabase-js. */
export function mapAuthError(
  err: unknown,
  context: "login" | "signup" | "reset" | "oauth" | "update" | "resend" = "login",
): AuthFeedback {
  const raw =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: string }).message)
      : err instanceof Error
        ? err.message
        : "Something went wrong.";
  const msg = raw.toLowerCase();
  const status =
    err && typeof err === "object" && "status" in err
      ? Number((err as { status: number }).status)
      : undefined;

  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("timeout")
  ) {
    return {
      field: "form",
      message: "Something went wrong. Check your connection and try again.",
    };
  }

  if (status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return {
      field: "form",
      message: "Too many attempts. Please wait and try again.",
    };
  }

  if (
    msg.includes("email not confirmed") ||
    msg.includes("email_not_confirmed") ||
    msg.includes("not confirmed")
  ) {
    return {
      field: "form",
      message: "Please verify your email before logging in.",
      offerResend: true,
    };
  }

  if (
    msg.includes("invalid login") ||
    msg.includes("invalid credentials") ||
    msg.includes("invalid email or password")
  ) {
    return {
      field: "form",
      message:
        "Invalid email or password. Try again or reset your password.",
    };
  }

  if (
    msg.includes("user already registered") ||
    msg.includes("already been registered") ||
    msg.includes("already registered")
  ) {
    return {
      field: "form",
      message:
        "This email may already be registered. Try logging in or resetting your password.",
    };
  }

  if (msg.includes("password") && (msg.includes("weak") || msg.includes("least"))) {
    return {
      field: "password",
      message: "Password does not meet requirements. Use at least 8 characters.",
    };
  }

  if (context === "oauth") {
    return {
      field: "form",
      message: "Google sign-in couldn't be completed. Try again.",
    };
  }

  if (context === "update") {
    return {
      field: "form",
      message: "Couldn't update your password. The link may have expired.",
    };
  }

  if (context === "resend" || context === "reset") {
    return {
      field: "form",
      message: "Couldn't send the email right now. Try again in a minute.",
    };
  }

  if (context === "signup") {
    return {
      field: "form",
      message: "Couldn't create your account. Check your details and try again.",
    };
  }

  return {
    field: "form",
    message: "Something went wrong. Check your connection and try again.",
  };
}

export function oauthQueryError(code: string | null): string | null {
  if (!code) return null;
  if (code === "oauth_failed" || code === "access_denied") {
    return "Google sign-in couldn't be completed. Try again.";
  }
  if (code === "config") {
    return "Authentication isn't configured correctly. Contact support.";
  }
  return null;
}
